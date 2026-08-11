import { apiService, db } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fullName = user => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Usuario +58Express';
const initials = user => `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '58';
const formatDate = value => value ? new Date(value).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha';
const tripDate = trip => new Date(trip.completedAt || trip.updatedAt || trip.createdAt || 0);
const isSuspended = user => user.status === 'SUSPENDED' || user.accountStatus === 'DISABLED';
const isVerified = user => user.role === 'passenger' ? user.accountStatus !== 'DISABLED' : Boolean(user.isVerified);
const avatarSource = user => user.photoUrl || user.avatar || user.profilePhoto || '';
const statusText = user => isSuspended(user) ? 'Suspendido' : isVerified(user) ? 'Cuenta habilitada' : 'Pendiente';
const vehicleText = user => user.role === 'driver' ? `${user.vehicleBrand || 'Vehículo'} ${user.vehicleModel || ''}`.trim() : 'Pasajero';
const documentEntries = user => Object.entries(user.documents || {}).map(([key, status]) => ({ key, status }));
const documentName = key => ({ cedula: 'Cédula', licencia: 'Licencia', rcv: 'RCV', certificadoMedico: 'Certificado', carnetCirculacion: 'Circulación' }[key] || key);

export function renderUsersManagement(container) {
  let disposed = false;
  let users = db.getCollection('users') || [];
  let trips = db.getCollection('trips') || [];
  let role = 'all';
  let status = 'all';
  let query = '';
  let selectedId = null;
  let page = 1;
  const pageSize = 8;

  const userTrips = userId => trips
    .filter(trip => trip.passengerId === userId || trip.driverId === userId || trip.assignedDriverId === userId)
    .sort((a, b) => tripDate(b) - tripDate(a));

  const filteredUsers = () => users
    .filter(user => ['driver', 'passenger'].includes(user.role))
    .filter(user => role === 'all' || user.role === role)
    .filter(user => status === 'all' || (status === 'suspended' ? isSuspended(user) : status === 'verified' ? isVerified(user) && !isSuspended(user) : !isVerified(user) && !isSuspended(user)))
    .filter(user => {
      const haystack = `${fullName(user)} ${user.email || ''} ${user.phone || ''} ${user.id || ''} ${user.vehiclePlate || ''}`.toLowerCase();
      return !query || haystack.includes(query.toLowerCase());
    });

  const load = async () => {
    const [freshUsers, freshTrips] = await Promise.all([apiService.get('/users'), apiService.get('/trips')]);
    if (disposed) return;
    if (Array.isArray(freshUsers)) { users = freshUsers; db.setCollection('users', freshUsers); }
    if (Array.isArray(freshTrips)) { trips = freshTrips; db.setCollection('trips', freshTrips); }
    if (selectedId && !users.some(user => user.id === selectedId)) selectedId = null;
    render();
  };

  const row = user => {
    const relatedTrips = userTrips(user.id);
    const completed = relatedTrips.filter(trip => trip.status === 'COMPLETED').length;
    const photo = avatarSource(user);
    return `<tr class="${selectedId === user.id ? 'selected' : ''}" data-user-row="${escape(user.id)}">
      <td><div class="user-command-person"><span class="user-command-avatar">${photo ? `<img src="${escape(photo)}" alt="">` : escape(initials(user))}<i class="${isSuspended(user) ? 'offline' : ''}"></i></span><div><strong>${escape(fullName(user))}</strong><small>ID: ${escape(String(user.id).slice(-10))}</small></div></div></td>
      <td><strong>${escape(user.phone || 'No registrado')}</strong><small>${escape(user.email || 'Sin correo')}</small></td>
      <td><strong>${escape(user.role === 'driver' ? 'Conductor' : 'Pasajero')}</strong><small>${escape(vehicleText(user))}${user.vehiclePlate ? ` · ${escape(user.vehiclePlate)}` : ''}</small></td>
      <td><span class="user-verification ${isVerified(user) ? 'verified' : ''}">${icon(isVerified(user) ? 'checkCircle' : 'clock', 14)} ${isVerified(user) ? 'Verificado' : 'Pendiente'}</span><small>${formatDate(user.createdAt)}</small></td>
      <td><strong class="user-rating">${icon('starFilled', 13)} ${Number(user.rating || 5).toFixed(1)}</strong><small>${completed} viajes</small></td>
      <td><span class="user-state ${isSuspended(user) ? 'suspended' : isVerified(user) ? 'enabled' : 'pending'}">${statusText(user)}</span></td>
      <td><button class="user-row-action" data-select-user="${escape(user.id)}" type="button" aria-label="Ver detalles">•••</button></td>
    </tr>`;
  };

  const detail = user => {
    if (!user) return '';
    const relatedTrips = userTrips(user.id);
    const completed = relatedTrips.filter(trip => trip.status === 'COMPLETED').slice(0, 3);
    const documents = documentEntries(user);
    const photo = avatarSource(user);
    return `<aside class="user-detail-drawer">
      <button id="close-user-detail" class="user-detail-close" type="button">${icon('close', 18)}</button>
      <header><span class="user-command-avatar large">${photo ? `<img src="${escape(photo)}" alt="">` : escape(initials(user))}<i class="${isSuspended(user) ? 'offline' : ''}"></i></span><div><div><h2>${escape(fullName(user))}</h2><span class="user-state ${isSuspended(user) ? 'suspended' : isVerified(user) ? 'enabled' : 'pending'}">${statusText(user)}</span></div><p>ID: ${escape(String(user.id).slice(-12))}</p><small>${user.role === 'driver' ? 'Conductor' : 'Pasajero'} registrado el ${formatDate(user.createdAt)}</small></div></header>
      <section><h3>Contacto</h3><dl><div><dt>${icon('phone', 15)} Teléfono</dt><dd>${escape(user.phone || 'No registrado')}</dd></div><div><dt>${icon('message', 15)} Correo</dt><dd>${escape(user.email || 'No registrado')}</dd></div></dl></section>
      ${user.role === 'driver' ? `<section class="user-detail-vehicle"><h3>Vehículo</h3><div><span>${icon(user.vehicleType === 'CAR' ? 'car' : 'bike', 25)}</span><p><strong>${escape(vehicleText(user))}</strong><small>Placa: ${escape(user.vehiclePlate || 'Sin registrar')}</small></p></div></section>
      <section><div class="user-section-heading"><h3>Documentos</h3><span>${documents.filter(item => item.status === 'approved').length}/${documents.length || 0}</span></div><div class="user-documents">${documents.length ? documents.slice(0, 5).map(item => `<span class="${item.status}">${icon(item.status === 'approved' ? 'checkCircle' : item.status === 'rejected' ? 'close' : 'clock', 14)}<b>${escape(documentName(item.key))}</b><small>${item.status === 'approved' ? 'Verificado' : item.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</small></span>`).join('') : '<p>Sin documentos registrados.</p>'}</div></section>` : ''}
      <section><div class="user-section-heading"><h3>Actividad reciente</h3><span>${relatedTrips.length} viajes</span></div><div class="user-recent-trips">${completed.length ? completed.map(trip => `<article><span>${icon('checkCircle', 14)}</span><div><strong>Viaje completado</strong><small>${formatDate(trip.completedAt || trip.updatedAt)}</small></div><b>$${Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0).toFixed(2)}</b></article>`).join('') : '<p>No tiene viajes completados.</p>'}</div></section>
      <section class="user-wallet-summary"><div><span>${icon('wallet', 19)}</span><p><small>Saldo disponible</small><strong>$${Number(user.walletBalance || 0).toFixed(2)}</strong></p></div><span>${Number(user.totalTrips || relatedTrips.length)} servicios totales</span></section>
      <footer><button id="contact-user" type="button">${icon('message', 16)} Contactar</button>${user.phone ? `<a href="tel:${escape(user.phone)}">${icon('phone', 16)} Llamar</a>` : ''}${user.role === 'driver' ? `<button id="toggle-user-state" class="${isSuspended(user) ? 'reactivate' : 'suspend'}" type="button">${icon(isSuspended(user) ? 'checkCircle' : 'alertCircle', 16)} ${isSuspended(user) ? 'Reactivar cuenta' : 'Suspender cuenta'}</button>` : ''}</footer>
    </aside>`;
  };

  const render = () => {
    const all = users.filter(user => ['driver', 'passenger'].includes(user.role));
    const visible = filteredUsers();
    const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
    if (page > totalPages) page = totalPages;
    const paged = visible.slice((page - 1) * pageSize, page * pageSize);
    const selected = users.find(user => user.id === selectedId);
    const drivers = all.filter(user => user.role === 'driver').length;
    const passengers = all.filter(user => user.role === 'passenger').length;
    const suspended = all.filter(isSuspended).length;
    container.innerHTML = `<div class="users-command-view ${selected ? 'with-detail' : ''}">
      <div class="users-command-main">
        <header class="users-command-heading"><div><div><h1>Gestión de Usuarios</h1><span><i></i> Cuentas reales</span></div><p>Administra conductores y pasajeros registrados en +58Express.</p></div><button id="new-driver" type="button">${icon('plus', 17)} Nuevo conductor</button></header>
        <section class="users-command-metrics"><article class="blue"><span>${icon('users', 24)}</span><div><small>Usuarios totales</small><strong>${all.length}</strong><em>Cuentas registradas</em></div></article><article class="yellow"><span>${icon('navigation', 24)}</span><div><small>Conductores</small><strong>${drivers}</strong><em>Flota registrada</em></div></article><article class="cyan"><span>${icon('user', 24)}</span><div><small>Pasajeros</small><strong>${passengers}</strong><em>Clientes registrados</em></div></article><article class="red"><span>${icon('alertCircle', 24)}</span><div><small>Suspendidos</small><strong>${suspended}</strong><em>Acceso restringido</em></div></article></section>
        <section class="users-command-toolbar"><nav>${[['all','grid','Todos'],['driver','navigation','Conductores'],['passenger','user','Pasajeros']].map(([id,ic,label]) => `<button class="${role === id ? 'active' : ''}" data-user-role="${id}" type="button">${icon(ic, 16)} ${label}</button>`).join('')}</nav><select id="user-status-filter"><option value="all" ${status === 'all' ? 'selected' : ''}>Todos los estados</option><option value="verified" ${status === 'verified' ? 'selected' : ''}>Habilitados</option><option value="pending" ${status === 'pending' ? 'selected' : ''}>Pendientes</option><option value="suspended" ${status === 'suspended' ? 'selected' : ''}>Suspendidos</option></select><label>${icon('search', 17)}<input id="user-command-search" value="${escape(query)}" placeholder="Buscar nombre, correo, teléfono o ID"></label></section>
        <section class="users-command-table"><div class="users-table-scroll"><table><thead><tr><th>Usuario</th><th>Contacto</th><th>Rol / Vehículo</th><th>Verificación</th><th>Rating / Viajes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${paged.map(row).join('') || '<tr><td colspan="7"><div class="users-command-empty">No hay usuarios que coincidan con la búsqueda.</div></td></tr>'}</tbody></table></div><footer><span>Mostrando ${visible.length ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, visible.length)} de ${visible.length} resultados</span><nav><button id="users-prev" ${page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 15)}</button>${Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map(value => `<button class="${page === value ? 'active' : ''}" data-user-page="${value}">${value}</button>`).join('')}<button id="users-next" ${page >= totalPages ? 'disabled' : ''}>${icon('chevronRight', 15)}</button></nav></footer></section>
      </div>${detail(selected)}
    </div>`;
    bindEvents();
  };

  const changeDriverState = async user => {
    const action = isSuspended(user) ? 'approve' : 'suspend';
    const reason = action === 'suspend' ? (prompt(`Indica la razón para suspender a ${fullName(user)}:`) || '').trim() : '';
    if (action === 'suspend' && !reason) return;
    const updated = await apiService.patch(`/admin/drivers/${encodeURIComponent(user.id)}`, { action, reason });
    if (!updated) return showToast('No se pudo actualizar el conductor.', 'error');
    showToast(action === 'suspend' ? 'Cuenta suspendida.' : 'Cuenta reactivada.', 'success');
    await load();
  };

  const openCreateDriver = () => {
    const overlay = document.createElement('div'); overlay.className = 'user-create-overlay';
    overlay.innerHTML = `<form class="user-create-modal"><header><div><h2>Nuevo conductor</h2><p>Crea una cuenta operativa y registra su vehículo.</p></div><button id="close-create-user" type="button">${icon('close', 18)}</button></header><div class="user-create-grid"><label>Nombre<input name="firstName" required></label><label>Apellido<input name="lastName"></label><label>Correo<input name="email" type="email" required></label><label>Teléfono<input name="phone" required></label><label>Tipo de vehículo<select name="vehicleType"><option value="MOTO">Moto</option><option value="CAR">Automóvil</option></select></label><label>Marca<input name="vehicleBrand" required></label><label>Modelo<input name="vehicleModel"></label><label>Placa<input name="vehiclePlate" required></label></div><footer><button id="cancel-create-user" type="button">Cancelar</button><button type="submit">${icon('plus', 16)} Crear conductor</button></footer></form>`;
    const close = () => overlay.remove();
    overlay.querySelector('#close-create-user').onclick = close; overlay.querySelector('#cancel-create-user').onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const result = await apiService.post('/admin/drivers', payload);
      if (!result) { submit.disabled = false; return showToast('No se pudo crear el conductor. Verifica los datos.', 'error'); }
      close(); await load();
      alert(`Conductor creado correctamente.\n\nContraseña temporal: ${result.temporaryPassword}\n\nGuárdala y entrégala de forma segura al conductor.`);
    };
    document.body.appendChild(overlay);
  };

  const bindEvents = () => {
    container.querySelectorAll('[data-user-role]').forEach(button => button.onclick = () => { role = button.dataset.userRole; page = 1; render(); });
    container.querySelector('#user-status-filter').onchange = event => { status = event.target.value; page = 1; render(); };
    container.querySelector('#user-command-search').oninput = event => { query = event.target.value; page = 1; const cursor = query.length; render(); const input = container.querySelector('#user-command-search'); input?.focus(); input?.setSelectionRange(cursor, cursor); };
    container.querySelectorAll('[data-user-row]').forEach(rowElement => rowElement.onclick = event => { if (event.target.closest('button')) return; selectedId = rowElement.dataset.userRow; render(); });
    container.querySelectorAll('[data-select-user]').forEach(button => button.onclick = () => { selectedId = button.dataset.selectUser; render(); });
    container.querySelector('#close-user-detail')?.addEventListener('click', () => { selectedId = null; render(); });
    container.querySelectorAll('[data-user-page]').forEach(button => button.onclick = () => { page = Number(button.dataset.userPage); render(); });
    container.querySelector('#users-prev')?.addEventListener('click', () => { page = Math.max(1, page - 1); render(); });
    container.querySelector('#users-next')?.addEventListener('click', () => { page += 1; render(); });
    container.querySelector('#new-driver')?.addEventListener('click', openCreateDriver);
    const selected = users.find(user => user.id === selectedId);
    container.querySelector('#toggle-user-state')?.addEventListener('click', () => selected && changeDriverState(selected));
    container.querySelector('#contact-user')?.addEventListener('click', () => {
      if (!selected) return;
      localStorage.setItem('58express_support_focus', selected.id);
      window.dispatchEvent(new CustomEvent('58express:admin-tab', { detail: 'support' }));
    });
  };

  const observer = new MutationObserver(() => {
    if (document.body.contains(container) && container.querySelector('.users-command-view')) return;
    disposed = true; observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  render(); load();
}
