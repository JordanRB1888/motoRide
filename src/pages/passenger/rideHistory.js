import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const tripDate = trip => new Date(
  trip.scheduledAt || trip.completedAt || trip.createdAt || Date.now()
).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });

const fare = trip => Number(
  trip.fareUSD || trip.fareEUR || trip.pricing?.fareUSD || 0
).toFixed(2);

export function renderRideHistory(container) {
  let activeTab = 'all';
  let trips = [];
  let loading = true;

  const load = async () => {
    const result = await apiService.get('/trips/me/history');
    trips = Array.isArray(result) ? result : [];
    loading = false;
    draw();
  };

  const card = trip => {
    const scheduled = trip.status === 'SCHEDULED';
    return `<article class="passenger-history-card">
      <header>
        <span class="passenger-history-status ${scheduled ? 'scheduled' : 'completed'}">${icon(scheduled ? 'calendar' : 'checkCircle', 14)} ${scheduled ? 'PROGRAMADO' : 'COMPLETADO'}</span>
        <time>${escapeHtml(tripDate(trip))}</time>
      </header>
      <div class="passenger-history-route">
        <span class="passenger-history-dot pickup"></span>
        <div><small>RECOGIDA</small><strong>${escapeHtml(trip.pickup?.address || 'Punto de recogida')}</strong></div>
        <i></i>
        <span class="passenger-history-dot destination"></span>
        <div><small>DESTINO</small><strong>${escapeHtml(trip.destination?.address || 'Destino')}</strong></div>
      </div>
      <footer>
        <div><small>TARIFA REGISTRADA</small><strong>$${fare(trip)} <em>USD</em></strong></div>
        ${scheduled
          ? `<button class="cancel-scheduled-trip-btn" data-id="${escapeHtml(trip.id)}">${icon('close', 14)} Cancelar reserva</button>`
          : `<button data-repeat>${icon('route', 14)} Repetir viaje</button>`}
      </footer>
    </article>`;
  };

  const emptyState = () => {
    const isAll = activeTab === 'all';
    const title = isAll ? 'Aún no tienes viajes' : `No tienes viajes ${activeTab === 'scheduled' ? 'programados' : 'completados'}`;
    const copy = isAll
      ? 'Tus reservas y servicios completados aparecerán aquí.'
      : 'Cuando tengas movimientos en esta categoría aparecerán aquí.';
    return `<div class="passenger-history-empty">
      <div class="passenger-history-empty-art">
        <span>${icon('history', 43)}</span><i>${icon('mapPin', 22)}</i><b>${icon('mapPin', 22)}</b>
      </div>
      <h3>${title}</h3><p>${copy}</p>
      <button type="button" data-empty-action>${icon(isAll ? 'car' : 'grid', 17)} ${isAll ? 'Solicitar mi primer viaje' : 'Ver todos los viajes'}</button>
    </div>`;
  };

  const draw = () => {
    const scheduled = trips.filter(trip => trip.status === 'SCHEDULED');
    const completed = trips.filter(trip => trip.status === 'COMPLETED');
    const persisted = [...scheduled, ...completed];
    const shown = activeTab === 'scheduled' ? scheduled : activeTab === 'completed' ? completed : persisted;

    container.innerHTML = `<div class="ride-history-page passenger-history-premium fade-in">
      <header class="passenger-history-heading">
        <small>${icon('history', 16)} HISTORIAL +58EXPRESS</small>
        <h2>Mis viajes</h2>
        <p>Reservas e historial de tus recorridos.</p>
      </header>
      <section class="passenger-history-summary">
        <article><span>${icon('route', 20)}</span><div><strong>${persisted.length}</strong><small>Totales</small></div></article>
        <article><span>${icon('calendar', 20)}</span><div><strong>${scheduled.length}</strong><small>Programados</small></div></article>
        <article><span>${icon('checkCircle', 20)}</span><div><strong>${completed.length}</strong><small>Completados</small></div></article>
      </section>
      <nav class="passenger-history-filters" aria-label="Filtrar viajes">
        <button class="${activeTab === 'all' ? 'active' : ''}" data-tab="all">${icon('grid', 16)} Todos</button>
        <button class="${activeTab === 'scheduled' ? 'active' : ''}" data-tab="scheduled">${icon('calendar', 16)} Programados</button>
        <button class="${activeTab === 'completed' ? 'active' : ''}" data-tab="completed">${icon('checkCircle', 16)} Completados</button>
      </nav>
      <section class="passenger-history-list">
        ${loading
          ? `<div class="passenger-history-loading"><span></span><strong>Cargando tus viajes…</strong></div>`
          : shown.length ? shown.map(card).join('') : emptyState()}
      </section>
    </div>`;

    container.querySelectorAll('[data-tab]').forEach(button => {
      button.onclick = () => {
        activeTab = button.dataset.tab;
        draw();
      };
    });
    container.querySelectorAll('[data-repeat]').forEach(button => {
      button.onclick = () => window.navigateTo('#/passenger');
    });
    container.querySelector('[data-empty-action]')?.addEventListener('click', () => {
      if (activeTab === 'all') window.navigateTo('#/passenger');
      else { activeTab = 'all'; draw(); }
    });
    container.querySelectorAll('.cancel-scheduled-trip-btn').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        const result = await apiService.delete(`/trips/scheduled/${encodeURIComponent(button.dataset.id)}`);
        if (!result) {
          button.disabled = false;
          return showToast(
            apiService.lastError?.error === 'SCHEDULED_TRIP_ALREADY_ASSIGNED'
              ? 'La reserva ya fue asignada; comunícate con soporte.'
              : 'No se pudo cancelar la reserva.',
            'error'
          );
        }
        showToast('Reserva cancelada correctamente.', 'success');
        await load();
      };
    });
  };

  draw();
  load();
}
