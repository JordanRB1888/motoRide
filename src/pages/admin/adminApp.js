import { db, apiService } from '../../services/apiService.js';
import { authService } from '../../services/mockAuth.js';
import { renderFleetMap } from './fleetMap.js';
import { renderUsersManagement } from './usersManagement.js';
import { renderTariffsConfig } from './tariffsConfig.js';
import { renderFinances } from './finances.js';
import { renderAdminSupport } from './adminSupport.js';
import { initThemeToggle } from '../../utils/themeToggle.js';
import { createNotificationCenterModal } from '../../components/notificationCenterModal.js';
import { notificationService } from '../../services/notificationService.js';
import { socket } from '../../services/socketClient.js';
import { icon } from '../../utils/icons.js';

export function renderAdminApp(container) {
  const admin = authService.getCurrentUser() || { id:'admin_1', firstName:'Admin', role:'admin' };
  let overview = null;
  const nav = [['dashboard','grid','Dashboard'],['fleet','map','Mapa de Flota'],['users','users','Usuarios'],['tariffs','dollarSign','Tarifas'],['finances','trending','Finanzas'],['support','message','Soporte']];
  container.innerHTML = `<div class="admin-app"><aside class="admin-sidebar" id="sidebar"><div class="admin-logo"><img src="/logo.jpg" alt="+58express" style="width:32px;height:32px;border-radius:8px"><div class="logo-text-full"><span class="accent-text">+58</span>express</div></div><nav class="admin-nav">${nav.map(([id,ic,label],index)=>`<button class="nav-item ${index?'':'active'}" data-target="${id}"><span class="nav-icon">${icon(ic,18)}</span><span class="nav-text">${label}</span></button>`).join('')}</nav></aside><main class="admin-main"><header class="admin-header"><div class="header-left"><button class="mobile-menu-btn" id="menu-btn">☰</button><h2 id="page-title">Dashboard</h2></div><div class="header-right" style="display:flex;align-items:center;gap:10px"><button id="admin-bell" title="Notificaciones" style="position:relative;width:38px;height:38px;border-radius:50%;border:1px solid var(--accent-primary);background:transparent;color:var(--accent-primary)">${icon('bell',18)}<span id="admin-badge" style="position:absolute;right:-4px;top:-4px;background:var(--danger);color:white;border-radius:10px;padding:1px 5px;font-size:.65rem"></span></button><div id="theme"></div><span>Hola, ${admin.firstName}</span><button class="logout-btn" id="logout">Salir</button></div></header><div class="admin-content" id="admin-content"></div></main></div>`;
  container.querySelector('#theme').appendChild(initThemeToggle());
  const content = container.querySelector('#admin-content');
  const title = container.querySelector('#page-title');
  const updateBadge = () => { const count=notificationService.getUnreadCount(admin.id||'admin_1');const badge=container.querySelector('#admin-badge');badge.textContent=count>99?'99+':count;badge.style.display=count?'block':'none'; };
  updateBadge(); window.addEventListener('58express:notifications-updated',updateBadge);
  container.querySelector('#admin-bell').onclick=()=>container.appendChild(createNotificationCenterModal(admin));
  container.querySelector('#menu-btn').onclick=()=>container.querySelector('#sidebar').classList.toggle('collapsed');
  container.querySelector('#logout').onclick=()=>{authService.logout();window.navigateTo('#/');};

  const dashboard = () => {
    const trips=db.getCollection('trips')||[], users=db.getCollection('users')||[];
    const active=overview?.activeTrips??trips.filter(t=>['SEARCHING','DRIVER_ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS','IN_TRIP'].includes(t.status)).length;
    const drivers=overview?overview.drivers.available+overview.drivers.busy:users.filter(u=>u.role==='driver'&&['AVAILABLE','ONLINE','BUSY','IN_TRIP'].includes(u.status)).length;
    const gross=Number(overview?.grossToday||0),bcv=Number(overview?.bcvRate||0);
    content.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Operación en tiempo real</h2><small style="color:var(--text-secondary)">Maracaibo · ${new Date().toLocaleString('es-VE')}</small></div><span class="badge badge-warning">BCV Bs. ${bcv.toFixed(2)}</span></div><div class="kpi-grid" style="margin:20px 0"><div class="kpi-card cyan"><span class="kpi-label">Viajes activos</span><b class="kpi-value">${active}</b></div><div class="kpi-card green"><span class="kpi-label">Conductores activos</span><b class="kpi-value">${drivers}</b></div><div class="kpi-card yellow"><span class="kpi-label">Facturación hoy</span><b class="kpi-value">$${gross.toFixed(2)}</b><small>Bs. ${(gross*bcv).toFixed(2)}</small></div><div class="kpi-card orange"><span class="kpi-label">Calificación</span><b class="kpi-value">${overview?.averageRating??'—'}</b></div></div><div class="data-table-container"><table class="data-table"><thead><tr><th>Viaje</th><th>Pasajero</th><th>Conductor</th><th>Ruta</th><th>Tarifa</th><th>Estado</th></tr></thead><tbody>${trips.slice().reverse().slice(0,12).map(t=>`<tr><td>#${t.id.slice(-7)}</td><td>${users.find(u=>u.id===t.passengerId)?.firstName||t.passengerId}</td><td>${users.find(u=>u.id===t.driverId)?.firstName||'Sin asignar'}</td><td>${t.pickup?.address||'Origen'} → ${t.destination?.address||'Destino'}</td><td>$${Number(t.fareUSD||t.fareEUR||t.pricing?.fareUSD||0).toFixed(2)}</td><td><span class="badge">${t.status}</span></td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center">No hay viajes registrados.</td></tr>'}</tbody></table></div>`;
  };
  const renderers={dashboard, fleet:()=>renderFleetMap(content), users:()=>renderUsersManagement(content), tariffs:()=>renderTariffsConfig(content), finances:()=>renderFinances(content), support:()=>renderAdminSupport(content)};
  const switchTab=id=>{container.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.target===id));title.textContent=nav.find(item=>item[0]===id)?.[2]||id;content.innerHTML='';renderers[id]?.();};
  container.querySelectorAll('.nav-item').forEach(button=>button.onclick=()=>switchTab(button.dataset.target));
  const refresh=async()=>{const [users,trips,stats]=await Promise.all([apiService.get('/users'),apiService.get('/trips'),apiService.get('/admin/overview')]);if(Array.isArray(users))db.setCollection('users',users);if(Array.isArray(trips))db.setCollection('trips',trips);overview=stats;if(container.querySelector('.nav-item.active')?.dataset.target==='dashboard')dashboard();};
  socket.on('rideRequested',data=>{notificationService.notify(admin.id||'admin_1',{title:'Nueva solicitud de viaje',message:`Solicitud #${data?.id?.slice(-6)||''}`,category:'TRIP',icon:'🏍️'});refresh();});
  socket.on('tripStatusUpdated',refresh); socket.on('admin:driver_updated',refresh); socket.on('finance:payout_updated',refresh);
  dashboard();refresh();
}
