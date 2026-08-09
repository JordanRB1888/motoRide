import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const tripDate = trip => new Date(trip.scheduledAt || trip.completedAt || trip.createdAt || Date.now()).toLocaleString('es-VE', { dateStyle:'medium', timeStyle:'short' });
const fare = trip => Number(trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0).toFixed(2);

export function renderRideHistory(container) {
  let activeTab = 'scheduled';
  let trips = [];
  let loading = true;

  const load = async () => {
    const result = await apiService.get('/trips/me/history');
    trips = Array.isArray(result) ? result : [];
    loading = false;
    draw();
  };

  const card = (trip, scheduled) => `<article class="trip-card diorama-card-3d" style="padding:18px;border-radius:22px;background:var(--surface-card);border:1px solid ${scheduled?'var(--accent-primary)':'var(--border-color)'}">
    <header style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span class="badge ${scheduled?'badge-warning':'badge-success'}">${scheduled?'PROGRAMADO':'COMPLETADO'}</span><time>${escapeHtml(tripDate(trip))}</time></header>
    <div style="margin:14px 0;padding:14px;border-radius:16px;background:var(--surface-elevated);display:grid;gap:10px"><strong>${icon('navigation',16)} ${escapeHtml(trip.pickup?.address || 'Punto de recogida')}</strong><strong>${icon('mapPin',16)} ${escapeHtml(trip.destination?.address || 'Destino')}</strong></div>
    <footer style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><small>TARIFA REGISTRADA</small><strong style="display:block;color:var(--accent-primary);font-size:1.3rem">$${fare(trip)}</strong></div>${scheduled?`<button class="btn cancel-scheduled-trip-btn" data-id="${escapeHtml(trip.id)}">Cancelar reserva</button>`:'<button class="btn btn-secondary-3d" data-repeat>Solicitar otra carrera</button>'}</footer>
  </article>`;

  const draw = () => {
    const scheduled = trips.filter(trip => trip.status === 'SCHEDULED');
    const completed = trips.filter(trip => trip.status === 'COMPLETED');
    const shown = activeTab === 'scheduled' ? scheduled : completed;
    container.innerHTML = `<div class="ride-history-page" style="padding:20px 16px 110px;max-width:520px;margin:0 auto;text-align:left">
      <header class="page-section-header"><h2>Mis viajes</h2><small>Reservas e historial persistidos en +58Express.</small></header>
      <div class="filter-tabs" style="display:flex;gap:10px;margin:20px 0"><button class="history-tab-btn ${activeTab==='scheduled'?'active':''}" data-tab="scheduled">Programados (${scheduled.length})</button><button class="history-tab-btn ${activeTab==='completed'?'active':''}" data-tab="completed">Completados (${completed.length})</button></div>
      <div class="trips-list" style="display:grid;gap:14px">${loading?'<div class="document-real-empty"><strong>Cargando tus viajes…</strong></div>':shown.length?shown.map(trip=>card(trip,activeTab==='scheduled')).join(''):`<div class="document-real-empty">${icon('history',32)}<h3>No hay viajes en esta categoría</h3><p>Los servicios reales aparecerán aquí.</p></div>`}</div>
    </div>`;
    container.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.tab; draw(); });
    container.querySelectorAll('[data-repeat]').forEach(button => button.onclick = () => window.navigateTo('#/passenger'));
    container.querySelectorAll('.cancel-scheduled-trip-btn').forEach(button => button.onclick = async () => {
      button.disabled = true;
      const result = await apiService.delete(`/trips/scheduled/${encodeURIComponent(button.dataset.id)}`);
      if (!result) { button.disabled = false; return showToast(apiService.lastError?.error === 'SCHEDULED_TRIP_ALREADY_ASSIGNED' ? 'La reserva ya fue asignada; comunícate con soporte.' : 'No se pudo cancelar la reserva.', 'error'); }
      showToast('Reserva cancelada correctamente.', 'success');
      await load();
    });
  };

  draw();
  load();
}
