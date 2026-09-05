import { db, apiService } from '../../services/apiService.js';
import { createAdminGoogleMap } from '../../components/adminControlCenter/adminGoogleMap.js';
import { mergeById, createCoalescer, withCanonicalId, accumulatePage } from '../../utils/liveUpdates.js';
import { authService } from '../../services/authService.js';
import { renderFleetMap } from './fleetMap.js';
import { renderUsersManagement } from './usersManagement.js';
import { renderTariffsConfig } from './tariffsConfig.js';
import { renderFinances } from './finances.js';
import { renderWalletTopups } from './walletTopups.js';
import { renderAdminSupport } from './adminSupport.js';
import { renderCommunications } from './communications.js';
import { renderDriverApplicationsManagement, disposeDriverApplicationsManagement } from './driverApplicationsManagement.js';
import { initThemeToggle } from '../../utils/themeToggle.js';
import { createNotificationCenterModal } from '../../components/notificationCenterModal.js';
import { notificationService } from '../../services/notificationService.js';
import { socket } from '../../services/socketClient.js';
import { icon } from '../../utils/icons.js';
import { dashboardTemplate } from '../../components/adminControlCenter/dashboard.js';
import { SECTIONS, openCommandPalette } from '../../components/adminControlCenter/ui.js';
import { renderPreparation, renderAudit, renderTeam, renderTrips, renderSystem } from '../../components/adminControlCenter/workspaces.js';
import { renderAdsCms } from '../../components/adminControlCenter/adsCms.js';
import { renderPartnersManagement } from '../../components/adminControlCenter/partnersManagement.js';
import { renderRbacMatrix } from '../../components/adminControlCenter/rbacMatrix.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

const ACTIVE_STATUSES = ['SEARCHING','DRIVER_ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS','IN_TRIP'];
const statusLabel = status => ({SEARCHING:'Buscando',DRIVER_ASSIGNED:'Asignado',EN_ROUTE:'En camino',ARRIVED:'En recogida',IN_PROGRESS:'En viaje',IN_TRIP:'En viaje',COMPLETED:'Completado',CANCELLED:'Cancelado'}[status] || (status ? 'Estado no reconocido' : 'Pendiente'));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export function renderAdminApp(container) {
  const admin = authService.getCurrentUser();
  if (!admin) return;
  // Admin owns its visual system. Restore the public experience on unmount.
  const publicVisualClasses = ['modern-yellow-lab','um-motion-preview'].filter(name=>document.documentElement.classList.contains(name));
  publicVisualClasses.forEach(name=>document.documentElement.classList.remove(name));
  let overview = null;
  let overviewError = false;
  let disposed = false;
  let tripTotal = 0;
  let dashboardMap = null;
  const nav = SECTIONS;
  const groups = [...new Set(nav.map(item=>item[3]))];
  container.innerHTML = `<div class="admin-app cc-app"><a class="cc-skip" href="#admin-content">Ir al contenido</a><aside class="admin-sidebar" id="sidebar" aria-label="Navegación administrativa">
    <div class="admin-logo"><span class="cc-wordmark">+58<span>Express</span></span><span class="cc-brand-short">58</span><small>CONTROL CENTER</small></div>
    <button class="cc-workspace" id="admin-system-card"><span class="cc-workspace-symbol">${icon('mapPin',16)}</span><span><strong>Maracaibo</strong><small id="admin-system-live">Consultando operación</small></span>${icon('chevronDown',14)}</button>
    <nav class="admin-nav" aria-label="Secciones del panel">${groups.map(group=>`<div class="cc-nav-group"><span class="cc-nav-caption">${group}</span>${nav.filter(item=>item[3]===group).map(([id,ic,label])=>`<button class="nav-item ${id==='dashboard'?'active':''}" data-target="${id}" data-label="${label}" aria-label="${label}" title="${label}"><span class="nav-icon">${icon(ic,16)}</span><span class="nav-text">${label}</span></button>`).join('')}</div>`).join('')}</nav>
    <div class="cc-sidebar-footer"><span class="cc-env">Entorno local de revisión</span><button class="sidebar-collapse" id="sidebar-collapse" aria-label="Contraer menú">${icon('chevronLeft',16)}<span class="nav-text">Contraer menú</span></button></div></aside>
    <main class="admin-main" id="admin-main"><header class="admin-header"><div class="header-left"><button class="mobile-menu-btn" id="menu-btn" aria-label="Abrir menú">${icon('menu',20)}</button><span class="cc-breadcrumb">Control Center <span>/</span></span><h2 id="page-title">Centro de Operaciones</h2></div><div class="admin-command"><button id="cc-search" class="cc-search-trigger" aria-label="Buscar en Control Center">${icon('search',16)}<span>Buscar sección…</span><kbd>⌘ K</kbd></button><button id="admin-bell" class="admin-icon-button" aria-label="Notificaciones">${icon('bell',16)}<span id="admin-badge"></span></button><div id="theme" class="admin-theme-slot"></div><div class="admin-profile"><span class="admin-avatar">${escapeHtml(admin.firstName?.[0]||'A')}</span><div><strong>${escapeHtml(admin.firstName||'Administrador')}</strong><small>Administrador</small></div></div><button class="logout-btn" id="logout" title="Cerrar sesión" aria-label="Cerrar sesión">${icon('logout',16)}</button></div></header><div class="admin-content" id="admin-content" tabindex="-1"></div></main></div>`;
  container.querySelector('#theme').appendChild(initThemeToggle());
  const content = container.querySelector('#admin-content');
  const title = container.querySelector('#page-title');
  const toggleSidebar = () => {
    const sidebar = container.querySelector('#sidebar');
    const collapsed = sidebar.classList.toggle('collapsed');
    container.querySelector('#sidebar-collapse')?.setAttribute('aria-label', collapsed ? 'Expandir menú' : 'Contraer menú');
    container.querySelector('#sidebar-collapse')?.setAttribute('title', collapsed ? 'Expandir menú' : 'Contraer menú');
  };
  container.querySelector('#menu-btn').onclick=toggleSidebar;
  container.querySelector('.cc-skip').onclick=event=>{
    event.preventDefault();
    content.setAttribute('tabindex','-1');
    content.focus();
  };
  container.querySelector('#sidebar-collapse').onclick=toggleSidebar;
  // Salir destruye el visor antes de borrar la sesión y de navegar: ninguna
  // Blob URL de un documento protegido puede sobrevivir al cierre de sesión.
  container.querySelector('#logout').onclick=()=>{disposeDriverApplicationsManagement(content);authService.logout();window.navigateTo('#/');};
  const updateBadge=()=>{const count=notificationService.getUnreadCount(admin.id),badge=container.querySelector('#admin-badge');badge.textContent=count>99?'99+':count;badge.hidden=!count;};
  updateBadge(); window.addEventListener('58express:notifications-updated',updateBadge);
  // Tocar un aviso abre su sección (finanzas, soporte, operación) de una vez.
  container.querySelector('#admin-bell').onclick=()=>container.querySelector('.cc-app').appendChild(createNotificationCenterModal(admin,null,{onNavigate:id=>switchTab(id)}));

  const initDashboardMap = users => requestAnimationFrame(async () => {
    const target=container.querySelector('#operations-map');
    if(!target || disposed) return;
    if(dashboardMap){dashboardMap.destroy();dashboardMap=null;}
    const nextMap=await createAdminGoogleMap({container:target,center:{lat:10.6427,lng:-71.6125},zoom:12});
    if(!nextMap||disposed||!target.isConnected){nextMap?.destroy();return;}
    dashboardMap=nextMap;
    const located=[];
    users.filter(u=>u.role==='driver'&&Number.isFinite(u.location?.lat)&&Number.isFinite(u.location?.lng)).forEach(driver=>{
      const tone=['AVAILABLE','ONLINE'].includes(driver.status)?'#20dc8e':['BUSY','IN_TRIP'].includes(driver.status)?'#e5b94d':'#ffb800';
      const lat=Number(driver.location.lat),lng=Number(driver.location.lng);
      located.push([lat,lng]);
      nextMap.crearMarcadorHtml({lat,lng,className:'ops-driver-marker',anchor:[19,19],title:`${driver.firstName||'Conductor'} · ${statusLabel(driver.status)}`,html:`<span style="--marker-tone:${tone}">${vehicleImage(driver.vehicleType,{variant:'map',className:'ops-real-vehicle',decorative:true})}</span>`});
    });
    if(located.length>1)nextMap.fitBounds(located);
  });

  const dashboard = () => {
    const trips=db.getCollection('trips')||[],users=db.getCollection('users')||[];
    content.innerHTML=dashboardTemplate({overview,trips,users,total:tripTotal,error:overviewError});
    container.querySelector('[data-open-fleet]')?.addEventListener('click',()=>switchTab('fleet'));
    content.querySelectorAll('[data-cc-nav]').forEach(button=>button.onclick=()=>switchTab(button.dataset.ccNav));
    content.querySelector('[data-retry-overview]')?.addEventListener('click',loadAll);
    initDashboardMap(users);
  };

  const renderers = {
    'dashboard': dashboard,
    'fleet': () => renderFleetMap(content),
    'applications': () => renderDriverApplicationsManagement(content),
    'users': () => renderUsersManagement(content),
    'tariffs': () => renderTariffsConfig(content),
    'topups': () => renderWalletTopups(content),
    'finances': () => renderFinances(content),
    'support': () => renderAdminSupport(content),
    'communications': () => renderCommunications(content),
    'trips': () => renderTrips(content),
    'ads': () => renderAdsCms(content),
    'partners': () => renderPartnersManagement(content),
    'roles': () => renderRbacMatrix(content),
    'team': () => renderTeam(content),
    'audit': () => renderAudit(content),
    'system': () => renderSystem(content)
  };
  // Vaciar el contenido desconecta el DOM pero no libera las Blob URLs de los
  // documentos protegidos: hay que cerrar la pantalla antes de sustituirla.
  const switchTab=id=>{if(!renderers[id] || disposed)return;if(dashboardMap){dashboardMap.destroy();dashboardMap=null;}disposeDriverApplicationsManagement(content);container.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.target===id));title.textContent=nav.find(item=>item[0]===id)?.[2]||id;content.innerHTML='';container.querySelector('.admin-main').scrollTop=0;content.scrollTop=0;renderers[id]?.();};
  const onTab = event => switchTab(event.detail);
  window.addEventListener('58express:admin-tab', onTab);
  const search = () => {if(!container.querySelector('.cc-dialog-backdrop'))openCommandPalette(container.querySelector('.cc-app'),switchTab);};
  container.querySelector('#cc-search').onclick=search;
  const onKey=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}};
  window.addEventListener('keydown',onKey);
  const shell=container.querySelector('.cc-app');
  const teardown=new MutationObserver(()=>{if(shell.isConnected)return;disposed=true;publicVisualClasses.forEach(name=>document.documentElement.classList.add(name));window.removeEventListener('keydown',onKey);window.removeEventListener('58express:admin-tab',onTab);window.removeEventListener('58express:notifications-updated',updateBadge);if(dashboardMap){dashboardMap.destroy();dashboardMap=null;}teardown.disconnect();});
  teardown.observe(container,{childList:true});
  container.querySelectorAll('.nav-item').forEach(button=>button.onclick=()=>switchTab(button.dataset.target));
  const redrawIfDashboard=()=>{if(!disposed&&container.querySelector('.nav-item.active')?.dataset.target==='dashboard')dashboard();};

  /**
   * La tarjeta de ciudad era decorativa: ocupaba el pie de la barra lateral y
   * no decia nada que cambiara. Ahora lleva el pulso de la operacion --cuantos
   * conductores hay disponibles y cuantos viajes estan en curso-- y es el
   * acceso directo al mapa de flota, que es lo que uno quiere ver justo
   * despues de leer esas dos cifras.
   *
   * Se alimenta de `overview` cuando el servidor ya lo mando, y si no, cuenta
   * sobre las colecciones locales: la misma regla que usa el tablero, para que
   * las dos superficies nunca digan cosas distintas.
   */
  const actualizarTarjetaSistema=()=>{
    const linea=container.querySelector('#admin-system-live');
    if(!linea)return;
    const users=db.getCollection('users')||[],trips=db.getCollection('trips')||[];
    const disponibles=overview?.drivers?.available??users.filter(u=>u.role==='driver'&&['AVAILABLE','ONLINE'].includes(u.status)).length;
    const activos=overview?.activeTrips??trips.filter(t=>ACTIVE_STATUSES.includes(t.status)).length;
    linea.textContent=`${disponibles} en linea · ${activos} en curso`;
    const tarjeta=container.querySelector('#admin-system-card');
    if(tarjeta)tarjeta.title=`${disponibles} conductores disponibles y ${activos} viajes en curso. Abrir el mapa de flota`;
  };
  container.querySelector('#admin-system-card')?.addEventListener('click',()=>switchTab('fleet'));

  const applyOverview=stats=>{
    overview=stats;
    overviewError=!stats;
    const applicationsButton=container.querySelector('[data-target="applications"]');
    if(applicationsButton)applicationsButton.dataset.count=stats?.driverApplications?.pending?String(stats.driverApplications.pending):'';
    const topupsButton=container.querySelector('[data-target="topups"]');
    if(topupsButton)topupsButton.dataset.count=stats?.walletRequests?.pendingTopups?String(stats.walletRequests.pendingTopups):'';
    actualizarTarjetaSistema();
  };

  // Carga completa: solo al abrir el panel. Las listas enteras no vuelven a
  // pedirse por un evento; `/api/users` son 7 MB con el volumen de seis meses.
  // El panel no necesita el censo entero: el mapa dibuja conductores y la
  // tabla nombra a los participantes de los ocho viajes mas recientes. Pedir
  // los 25 000 usuarios eran 7 MB medidos contra el servidor real.
  //
  // El mapa se acota por criterio operativo, no por un tope arbitrario: pedir
  // «los cien primeros» dejaba fuera del mapa a conductores en la calle en
  // cuanto la flota pasaba de cien cuentas, y justo a los de alta mas
  // reciente. Se piden los que estan en servicio y se recorre el cursor hasta
  // agotarlo, de modo que no queda ninguno sin dibujar; el volumen lo acota la
  // realidad --cuantos hay conectados a la vez-- y no una constante.
  // El panel solo enseña ocho viajes recientes. Se guardan algunos más para
  // que los avisos de socket tengan dónde encajar sin volver a pedir nada.
  const TRIPS_ON_DASHBOARD=8;
  const TRIPS_IN_MEMORY=40;
  const recencia=t=>new Date(t?.completedAt||t?.closedAt||t?.updatedAt||t?.createdAt||0).getTime()||0;
  // Un aviso de socket puede traer un viaje más reciente que los que hay: se
  // reordena y se recorta, o la tabla acabaría mostrando los ocho primeros que
  // llegaron en vez de los ocho últimos.
  const ordenarViajes=lista=>[...lista].sort((a,b)=>recencia(b)-recencia(a)).slice(0,TRIPS_IN_MEMORY);

  const ESTADOS_EN_SERVICIO='AVAILABLE,ONLINE,BUSY,IN_TRIP';
  const DRIVERS_PAGE=100;
  // Cortafuegos por si el cursor no avanzara: 50 paginas son 5 000 conductores
  // simultaneos, muy por encima de cualquier operacion real.
  const DRIVERS_MAX_PAGES=50;

  const loadOperationalDrivers=async()=>{
    let acumulados=[];
    let cursor=null;
    let vueltas=0;
    do{
      const consulta=`/users?role=driver&driverStatus=${ESTADOS_EN_SERVICIO}&limit=${DRIVERS_PAGE}`
        +(cursor?`&cursor=${encodeURIComponent(cursor)}`:'');
      const pagina=await apiService.get(consulta);
      if(!Array.isArray(pagina?.items))break;
      acumulados=accumulatePage(acumulados,pagina.items);
      cursor=pagina.nextCursor||null;
      vueltas+=1;
    }while(cursor&&vueltas<DRIVERS_MAX_PAGES);
    return acumulados;
  };

  // Identificadores que aparecen en la tabla y aun no estan en memoria. Se
  // piden juntos y de una vez, nunca uno por fila.
  const faltantes=new Set();
  const resolverFaltantes=createCoalescer(async()=>{
    const pendientes=[...faltantes].slice(0,50);
    faltantes.clear();
    if(!pendientes.length)return;
    const pagina=await apiService.get(`/users?ids=${encodeURIComponent(pendientes.join(','))}&limit=50`);
    if(!Array.isArray(pagina?.items))return;
    let coleccion=db.getCollection('users');
    for(const usuario of pagina.items)coleccion=mergeById(coleccion,usuario);
    db.setCollection('users',coleccion);
    redrawIfDashboard();
  },{intervalMs:400});

  const ensureParticipants=trips=>{
    const conocidos=new Set((db.getCollection('users')||[]).map(u=>u.id));
    // Los mismos ocho viajes que muestra la tabla.
    for(const trip of (trips||[]).slice(0,TRIPS_ON_DASHBOARD)){
      for(const id of [trip?.passengerId,trip?.driverId]){
        if(id&&!conocidos.has(id))faltantes.add(id);
      }
    }
    if(faltantes.size)resolverFaltantes();
  };

  const loadAll=async()=>{
    const [conductores,pagina,stats]=await Promise.all([
      loadOperationalDrivers(),
      apiService.get(`/trips?limit=${TRIPS_ON_DASHBOARD}`),
      apiService.get('/admin/overview')
    ]);
    if(disposed)return;
    if(Array.isArray(conductores))db.setCollection('users',conductores);
    const trips=Array.isArray(pagina?.items)?pagina.items:[];
    tripTotal=Number(pagina?.total)||trips.length;
    db.setCollection('trips',trips);
    applyOverview(stats);
    ensureParticipants(trips);
    redrawIfDashboard();
  };

  // Las cifras agregadas si hay que pedirlas, pero son un objeto pequeno y las
  // rafagas de eventos se funden en una sola peticion por segundo.
  const refreshOverview=createCoalescer(async()=>{
    const stats=await apiService.get('/admin/overview');
    if(disposed)return;
    if(!stats){overviewError=true;redrawIfDashboard();return;}
    applyOverview(stats);
    redrawIfDashboard();
  },{intervalMs:1000});

  // El registro que cambio viene dentro del propio evento, asi que se aplica
  // sobre lo que ya esta en memoria en lugar de volver a descargar la lista.
  const patchTrip=patch=>{const normalizado=withCanonicalId(patch,['id','tripId']);if(!normalizado)return;const previos=db.getCollection('trips')||[];if(!previos.some(t=>t.id===normalizado.id))tripTotal+=1;const trips=ordenarViajes(mergeById(previos,normalizado));db.setCollection('trips',trips);ensureParticipants(trips);redrawIfDashboard();};
  const patchUser=patch=>{const normalizado=withCanonicalId(patch,['id','userId','driverId']);if(!normalizado)return;db.setCollection('users',mergeById(db.getCollection('users'),normalizado));redrawIfDashboard();};
  socket.on('rideRequested',data=>{notificationService.notify(admin.id,{title:'Nueva solicitud de viaje',message:`Solicitud #${data?.id?.slice(-6)||''}`,category:'TRIP',icon:'🏍️'});patchTrip(data);refreshOverview();});
  socket.on('tripStatusUpdated',data=>{patchTrip(data);refreshOverview();});socket.on('admin:driver_updated',data=>{patchUser(data);refreshOverview();});socket.on('admin:driver_location',data=>{const users=db.getCollection('users')||[],driver=users.find(u=>u.id===(data.userId||data.driverId));if(driver)driver.location={...(driver.location||{}),...data};if(container.querySelector('.nav-item.active')?.dataset.target==='dashboard')dashboard();});socket.on('finance:payout_updated',refreshOverview);
  socket.on('finance:topup_pending',()=>{notificationService.syncFromServer?.(admin.id);refreshOverview();if(container.querySelector('.nav-item.active')?.dataset.target==='topups')renderWalletTopups(content);});
  socket.on('finance:transaction_updated',()=>{refreshOverview();if(container.querySelector('.nav-item.active')?.dataset.target==='topups')renderWalletTopups(content);});
  socket.on('driver_application:new',()=>{notificationService.syncFromServer?.(admin.id);if(container.querySelector('.nav-item.active')?.dataset.target==='applications')renderDriverApplicationsManagement(content);});
  socket.on('driver_application:updated',()=>{if(container.querySelector('.nav-item.active')?.dataset.target==='applications')renderDriverApplicationsManagement(content);});
  dashboard();loadAll();
}
