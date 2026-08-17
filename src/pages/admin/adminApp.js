import { db, apiService } from '../../services/apiService.js';
import { mergeById, createCoalescer } from '../../utils/liveUpdates.js';
import { authService } from '../../services/authService.js';
import { renderFleetMap } from './fleetMap.js';
import { renderUsersManagement } from './usersManagement.js';
import { renderTariffsConfig } from './tariffsConfig.js';
import { renderFinances } from './finances.js';
import { renderWalletTopups } from './walletTopups.js';
import { renderAdminSupport } from './adminSupport.js';
import { renderDriverApplicationsManagement, disposeDriverApplicationsManagement } from './driverApplicationsManagement.js';
import { initThemeToggle } from '../../utils/themeToggle.js';
import { createNotificationCenterModal } from '../../components/notificationCenterModal.js';
import { notificationService } from '../../services/notificationService.js';
import { socket } from '../../services/socketClient.js';
import { icon } from '../../utils/icons.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

const ACTIVE_STATUSES = ['SEARCHING','DRIVER_ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS','IN_TRIP'];
const statusLabel = status => ({SEARCHING:'Buscando',DRIVER_ASSIGNED:'Asignado',EN_ROUTE:'En camino',ARRIVED:'En recogida',IN_PROGRESS:'En viaje',IN_TRIP:'En viaje',COMPLETED:'Completado',CANCELLED:'Cancelado'}[status] || status || 'Pendiente');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export function renderAdminApp(container) {
  const admin = authService.getCurrentUser();
  if (!admin) return;
  let overview = null;
  let dashboardMap = null;
  const nav = [['dashboard','grid','Centro de Operaciones'],['fleet','map','Mapa de Flota'],['applications','shield','Solicitudes'],['users','users','Usuarios'],['tariffs','dollarSign','Tarifas'],['topups','wallet','Recargas'],['finances','trending','Finanzas'],['support','message','Soporte']];

  container.innerHTML = `<div class="admin-app"><aside class="admin-sidebar" id="sidebar"><div class="admin-logo"><img src="/app-icon-v2.png" alt="+58 Express"><div class="logo-text-full"><span>+58</span>express<small>Operations</small></div></div><nav class="admin-nav">${nav.map(([id,ic,label],index)=>`<button class="nav-item ${index?'':'active'}" data-target="${id}"><span class="nav-icon">${icon(ic,19)}</span><span class="nav-text">${label}</span></button>`).join('')}</nav><div class="admin-system-card"><span class="system-pin">M</span><div><strong>Maracaibo</strong><small><i></i>Sistema operativo</small></div></div><button class="sidebar-collapse" id="sidebar-collapse">${icon('chevronLeft',17)}<span class="nav-text">Contraer menú</span></button></aside><main class="admin-main"><header class="admin-header"><div class="header-left"><button class="mobile-menu-btn" id="menu-btn">${icon('menu',19)}</button><div><h2 id="page-title">Centro de Operaciones</h2><small>Control, seguridad y movilidad en tiempo real</small></div></div><div class="admin-command"><button id="admin-bell" class="admin-icon-button" title="Notificaciones">${icon('bell',18)}<span id="admin-badge"></span></button><div id="theme"></div><div class="admin-profile"><span class="admin-avatar">${escapeHtml(admin.firstName?.[0] || 'A')}</span><div><strong>Hola, ${escapeHtml(admin.firstName)}</strong><small>Administrador</small></div></div><button class="logout-btn" id="logout">Salir</button></div></header><div class="admin-content" id="admin-content"></div></main></div>`;

  container.querySelector('#theme').appendChild(initThemeToggle());
  const content = container.querySelector('#admin-content');
  const title = container.querySelector('#page-title');
  const toggleSidebar = () => container.querySelector('#sidebar').classList.toggle('collapsed');
  container.querySelector('#menu-btn').onclick=toggleSidebar;
  container.querySelector('#sidebar-collapse').onclick=toggleSidebar;
  // Salir destruye el visor antes de borrar la sesión y de navegar: ninguna
  // Blob URL de un documento protegido puede sobrevivir al cierre de sesión.
  container.querySelector('#logout').onclick=()=>{disposeDriverApplicationsManagement(content);authService.logout();window.navigateTo('#/');};
  const updateBadge=()=>{const count=notificationService.getUnreadCount(admin.id),badge=container.querySelector('#admin-badge');badge.textContent=count>99?'99+':count;badge.hidden=!count;};
  updateBadge(); window.addEventListener('58express:notifications-updated',updateBadge);
  container.querySelector('#admin-bell').onclick=()=>container.appendChild(createNotificationCenterModal(admin));

  const initDashboardMap = users => requestAnimationFrame(() => {
    const target=container.querySelector('#operations-map');
    if(!target || typeof L==='undefined') return;
    if(dashboardMap){dashboardMap.remove();dashboardMap=null;}
    dashboardMap=L.map(target,{zoomControl:false,attributionControl:false,dragging:true,scrollWheelZoom:false}).setView([10.6427,-71.6125],12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(dashboardMap);
    users.filter(u=>u.role==='driver'&&Number.isFinite(u.location?.lat)&&Number.isFinite(u.location?.lng)).forEach(driver=>{
      const tone=['AVAILABLE','ONLINE'].includes(driver.status)?'#20dc8e':['BUSY','IN_TRIP'].includes(driver.status)?'#22c7e8':'#ffb800';
      const marker=L.divIcon({className:'ops-driver-marker',html:`<span style="--marker-tone:${tone}">${vehicleImage(driver.vehicleType,{variant:'map',className:'ops-real-vehicle',decorative:true})}</span>`,iconSize:[38,38],iconAnchor:[19,19]});
      L.marker([driver.location.lat,driver.location.lng],{icon:marker}).addTo(dashboardMap).bindTooltip(`${escapeHtml(driver.firstName)} · ${statusLabel(driver.status)}`);
    });
  });

  const dashboard = () => {
    const trips=db.getCollection('trips')||[],users=db.getCollection('users')||[];
    const recent=trips.slice().reverse().slice(0,8),active=overview?.activeTrips??trips.filter(t=>ACTIVE_STATUSES.includes(t.status)).length;
    const available=overview?.drivers?.available??users.filter(u=>u.role==='driver'&&['AVAILABLE','ONLINE'].includes(u.status)).length;
    const busy=overview?.drivers?.busy??users.filter(u=>u.role==='driver'&&['BUSY','IN_TRIP'].includes(u.status)).length;
    const gross=Number(overview?.grossToday||0),bcv=Number(overview?.bcvRate||0),rating=overview?.averageRating??'—';
    const activities=recent.slice(0,6).map(trip=>({trip,type:trip.status==='COMPLETED'?'success':trip.status==='CANCELLED'?'danger':trip.status==='SEARCHING'?'warning':'info',title:trip.status==='COMPLETED'?'Viaje completado':trip.status==='CANCELLED'?'Viaje cancelado':trip.status==='SEARCHING'?'Nueva solicitud':'Viaje actualizado'}));
    content.innerHTML=`<div class="dashboard-view ops-dashboard"><div class="ops-heading"><div><span class="eyebrow"><i></i> OPERACIÓN EN VIVO</span><h1>Movilidad bajo control.</h1><p>Maracaibo, Zulia · ${new Date().toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'})}</p></div><div class="ops-heading-actions"><span class="ops-health"><i></i> Todos los sistemas operativos</span><span class="ops-rate">BCV <strong>Bs. ${bcv.toFixed(2)}</strong></span></div></div><div class="ops-overview"><section class="operations-map-card"><div class="map-card-head"><div><strong>Mapa operativo</strong><small>Ubicación actual de la flota</small></div><button class="map-expand" data-open-fleet>${icon('maximize',17)} Abrir mapa</button></div><div id="operations-map"></div><div class="map-overlay-stats"><div><small>Disponibles</small><strong class="green">${available}</strong></div><div><small>En servicio</small><strong class="cyan">${busy}</strong></div><div><small>Solicitudes</small><strong class="amber">${trips.filter(t=>t.status==='SEARCHING').length}</strong></div></div></section><div class="ops-kpis"><article class="metric-card cyan"><span class="metric-icon">${icon('navigation',20)}</span><div><small>Viajes activos</small><strong>${active}</strong><p>Ahora mismo</p></div></article><article class="metric-card green"><span class="metric-icon">${icon('users',20)}</span><div><small>Conductores disponibles</small><strong>${available}</strong><p>${busy} prestando servicio</p></div></article><article class="metric-card amber"><span class="metric-icon">${icon('dollarSign',20)}</span><div><small>Facturación hoy</small><strong>$${gross.toFixed(2)}</strong><p>Bs. ${(gross*bcv).toFixed(2)}</p></div></article><article class="metric-card orange"><span class="metric-icon">${icon('star',20)}</span><div><small>Calificación</small><strong>${rating}</strong><p>Experiencia promedio</p></div></article></div></div><div class="ops-lower"><section class="ops-panel trips-panel"><header><div><h3>Viajes recientes</h3><p>Seguimiento de la operación</p></div><span>${trips.length} registros</span></header><div class="ops-table-wrap"><table class="data-table"><thead><tr><th>Viaje</th><th>Pasajero</th><th>Conductor</th><th>Ruta</th><th>Tarifa</th><th>Estado</th></tr></thead><tbody>${recent.map(t=>{const passenger=users.find(u=>u.id===t.passengerId),driver=users.find(u=>u.id===t.driverId);return `<tr><td><code>#${escapeHtml(t.id.slice(-7))}</code></td><td>${escapeHtml(passenger?.firstName||'Cliente')}</td><td>${escapeHtml(driver?.firstName||'Sin asignar')}</td><td class="route-cell"><span>${escapeHtml(t.pickup?.address||'Origen')}</span>${icon('arrowRight',14)}<span>${escapeHtml(t.destination?.address||'Destino')}</span></td><td><strong>$${Number(t.fareUSD||t.fareEUR||t.pricing?.fareUSD||0).toFixed(2)}</strong></td><td><span class="trip-status status-${String(t.status).toLowerCase()}">${statusLabel(t.status)}</span></td></tr>`}).join('')||'<tr><td colspan="6" class="empty-cell">No hay viajes registrados todavía.</td></tr>'}</tbody></table></div></section><aside class="ops-panel activity-panel"><header><div><h3>Actividad reciente</h3><p>Eventos de plataforma</p></div><span class="live-dot"></span></header><div class="activity-list">${activities.map(({trip,type,title})=>`<article><span class="activity-icon ${type}">${icon(type==='success'?'check':type==='danger'?'close':type==='warning'?'bell':'navigation',15)}</span><div><strong>${title}</strong><p>${escapeHtml(trip.destination?.address||statusLabel(trip.status))}</p></div><time>${new Date(trip.updatedAt||trip.createdAt||Date.now()).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}</time></article>`).join('')||'<div class="empty-activity">La actividad aparecerá aquí en tiempo real.</div>'}</div></aside></div></div>`;
    container.querySelector('[data-open-fleet]')?.addEventListener('click',()=>switchTab('fleet'));
    initDashboardMap(users);
  };

  const renderers={dashboard,fleet:()=>renderFleetMap(content),applications:()=>renderDriverApplicationsManagement(content),users:()=>renderUsersManagement(content),tariffs:()=>renderTariffsConfig(content),topups:()=>renderWalletTopups(content),finances:()=>renderFinances(content),support:()=>renderAdminSupport(content)};
  // Vaciar el contenido desconecta el DOM pero no libera las Blob URLs de los
  // documentos protegidos: hay que cerrar la pantalla antes de sustituirla.
  const switchTab=id=>{if(dashboardMap){dashboardMap.remove();dashboardMap=null;}disposeDriverApplicationsManagement(content);container.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.target===id));title.textContent=nav.find(item=>item[0]===id)?.[2]||id;content.innerHTML='';renderers[id]?.();};
  window.addEventListener('58express:admin-tab', event => switchTab(event.detail));
  container.querySelectorAll('.nav-item').forEach(button=>button.onclick=()=>switchTab(button.dataset.target));
  const redrawIfDashboard=()=>{if(container.querySelector('.nav-item.active')?.dataset.target==='dashboard')dashboard();};

  const applyOverview=stats=>{
    overview=stats;
    const applicationsButton=container.querySelector('[data-target="applications"]');
    if(applicationsButton)applicationsButton.dataset.count=stats?.driverApplications?.pending?String(stats.driverApplications.pending):'';
    const topupsButton=container.querySelector('[data-target="topups"]');
    if(topupsButton)topupsButton.dataset.count=stats?.walletRequests?.pendingTopups?String(stats.walletRequests.pendingTopups):'';
  };

  // Carga completa: solo al abrir el panel. Las listas enteras no vuelven a
  // pedirse por un evento; `/api/users` son 7 MB con el volumen de seis meses.
  const loadAll=async()=>{
    const [users,trips,stats]=await Promise.all([apiService.get('/users'),apiService.get('/trips'),apiService.get('/admin/overview')]);
    if(Array.isArray(users))db.setCollection('users',users);
    if(Array.isArray(trips))db.setCollection('trips',trips);
    applyOverview(stats);
    redrawIfDashboard();
  };

  // Las cifras agregadas si hay que pedirlas, pero son un objeto pequeno y las
  // rafagas de eventos se funden en una sola peticion por segundo.
  const refreshOverview=createCoalescer(async()=>{
    const stats=await apiService.get('/admin/overview');
    if(!stats)return;
    applyOverview(stats);
    redrawIfDashboard();
  },{intervalMs:1000});

  // El registro que cambio viene dentro del propio evento, asi que se aplica
  // sobre lo que ya esta en memoria en lugar de volver a descargar la lista.
  const patchTrip=patch=>{db.setCollection('trips',mergeById(db.getCollection('trips'),patch));redrawIfDashboard();};
  const patchUser=patch=>{db.setCollection('users',mergeById(db.getCollection('users'),patch));redrawIfDashboard();};
  socket.on('rideRequested',data=>{notificationService.notify(admin.id,{title:'Nueva solicitud de viaje',message:`Solicitud #${data?.id?.slice(-6)||''}`,category:'TRIP',icon:'🏍️'});patchTrip(data);refreshOverview();});
  socket.on('tripStatusUpdated',data=>{patchTrip({...data,id:data?.tripId||data?.id});refreshOverview();});socket.on('admin:driver_updated',data=>{patchUser(data);refreshOverview();});socket.on('admin:driver_location',data=>{const users=db.getCollection('users')||[],driver=users.find(u=>u.id===(data.userId||data.driverId));if(driver)driver.location={...(driver.location||{}),...data};if(container.querySelector('.nav-item.active')?.dataset.target==='dashboard')dashboard();});socket.on('finance:payout_updated',refreshOverview);
  socket.on('finance:topup_pending',()=>{notificationService.syncFromServer?.(admin.id);refreshOverview();if(container.querySelector('.nav-item.active')?.dataset.target==='topups')renderWalletTopups(content);});
  socket.on('finance:transaction_updated',()=>{refreshOverview();if(container.querySelector('.nav-item.active')?.dataset.target==='topups')renderWalletTopups(content);});
  socket.on('driver_application:new',()=>{notificationService.syncFromServer?.(admin.id);if(container.querySelector('.nav-item.active')?.dataset.target==='applications')renderDriverApplicationsManagement(content);});
  socket.on('driver_application:updated',()=>{if(container.querySelector('.nav-item.active')?.dataset.target==='applications')renderDriverApplicationsManagement(content);});
  dashboard();loadAll();
}
