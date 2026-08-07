import { db } from '../../services/mockDatabase.js';
import { icon } from '../../utils/icons.js';

export function renderRideHistory(container) {
  let activeTab = 'scheduled'; // Default to scheduled to show active reservations

  function renderView() {
    let allTrips = db.getCollection('trips') || [];
    let scheduledTrips = allTrips.filter(t => t.status === 'SCHEDULED');
    let completedTrips = allTrips.filter(t => t.status === 'COMPLETED' || t.status === 'COMPLETED_MOCK');

    if (completedTrips.length === 0) {
      completedTrips = [
        { id: 'trip_101', pickup: { address: 'Basílica de La Chiquinquirá' }, destination: { address: 'Centro Comercial Sambil Maracaibo' }, distance: 4.8, fareUSD: 4.50, status: 'COMPLETED', createdAt: new Date(Date.now() - 3600000 * 5).toISOString() },
        { id: 'trip_102', pickup: { address: '5 de Julio / Calle 72' }, destination: { address: 'Vereda del Lago Maracaibo' }, distance: 3.2, fareUSD: 3.00, status: 'COMPLETED', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() }
      ];
    }

    container.innerHTML = `
      <div class="ride-history-page" style="padding: 20px 16px 100px; max-width: 480px; margin: 0 auto; text-align: left;">
        <div class="page-section-header" style="margin-bottom: 20px;">
          <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 900; margin: 0 0 4px 0;">Mis Viajes y Reservas 🇻🇪</h2>
          <small style="color: var(--text-secondary); font-size: 0.88rem; font-weight: 700; display: block;">Historial de carreras y viajes futuros programados en Maracaibo</small>
        </div>
        
        <div class="filter-tabs" style="display: flex; gap: 10px; margin-bottom: 20px;">
          <button class="history-tab-btn ${activeTab === 'scheduled' ? 'active' : ''}" data-tab="scheduled" style="
            flex:1; padding: 12px 14px; border-radius: 18px; font-weight: 900; font-size: 0.88rem; cursor: pointer;
            background: ${activeTab === 'scheduled' ? 'var(--accent-primary)' : 'var(--surface-elevated)'};
            color: ${activeTab === 'scheduled' ? '#121824' : 'var(--text-primary)'};
            border: 1.5px solid var(--border-color); box-shadow: 0 4px 10px rgba(0,0,0,0.1);
          ">
            📅 Reservas Programadas (${scheduledTrips.length})
          </button>
          <button class="history-tab-btn ${activeTab === 'completed' ? 'active' : ''}" data-tab="completed" style="
            flex:1; padding: 12px 14px; border-radius: 18px; font-weight: 900; font-size: 0.88rem; cursor: pointer;
            background: ${activeTab === 'completed' ? 'var(--accent-primary)' : 'var(--surface-elevated)'};
            color: ${activeTab === 'completed' ? '#121824' : 'var(--text-primary)'};
            border: 1.5px solid var(--border-color); box-shadow: 0 4px 10px rgba(0,0,0,0.1);
          ">
            ✓ Completados (${completedTrips.length})
          </button>
        </div>
        
        <div class="trips-list" style="display: flex; flex-direction: column; gap: 16px;">
          ${activeTab === 'scheduled' ? (
            scheduledTrips.length > 0 ? scheduledTrips.map(trip => `
              <div class="trip-card diorama-card-3d" style="padding: 20px; border-radius: 24px; background: var(--surface-card); border: 2px solid var(--accent-secondary); box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap:wrap; gap:8px;">
                  <span style="
                    padding: 6px 12px; border-radius: 14px; background: rgba(2,132,199,0.15); border: 1.5px solid var(--accent-secondary);
                    color: var(--accent-secondary); font-weight: 900; font-size: 0.85rem;
                  ">
                    📅 ${trip.formattedDateTime || (trip.scheduledDate + ' ' + trip.scheduledTime)}
                  </span>
                  ${trip.isPaidInAdvance ? `
                    <span style="
                      padding: 6px 12px; border-radius: 14px; background: rgba(0,200,83,0.15); border: 1.5px solid var(--success);
                      color: var(--success); font-weight: 900; font-size: 0.82rem;
                    ">✓ Pagado por Adelantado</span>
                  ` : `
                    <span style="
                      padding: 6px 12px; border-radius: 14px; background: rgba(217,119,6,0.15); border: 1.5px solid var(--warning);
                      color: var(--warning); font-weight: 900; font-size: 0.82rem;
                    ">💵 Pago al Iniciar</span>
                  `}
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; background: var(--surface-elevated); padding: 14px; border-radius: 16px; border: 1.5px solid var(--border-color);">
                  <div style="display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 0.98rem; font-weight: 800;">
                    <span style="font-size: 1.2rem;">🟢</span> ${trip.pickup?.address || 'Origen en Maracaibo'}
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 0.98rem; font-weight: 800;">
                    <span style="font-size: 1.2rem;">🚩</span> ${trip.destination?.address || 'Destino en Maracaibo'}
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 14px;">
                  <div>
                    <small style="color:var(--text-secondary); font-weight: 800; font-size: 0.78rem; display:block;">TARIFA CONGELADA</small>
                    <div style="font-weight: 900; color: var(--accent-secondary); font-size: 1.4rem; font-family: 'JetBrains Mono', monospace;">
                      €${(trip.fareEUR || 4.50).toFixed(2)} EUR
                    </div>
                  </div>
                  <button class="btn cancel-scheduled-trip-btn" data-id="${trip.id}" style="
                    padding: 10px 16px; border-radius: 14px; background: rgba(239,68,68,0.15); border: 1.5px solid var(--danger);
                    color: var(--danger); font-size: 0.85rem; font-weight: 900; cursor: pointer;
                  ">
                    ✕ Cancelar Reserva
                  </button>
                </div>
              </div>
            `).join('') : `
              <div style="text-align:center; padding: 40px 20px; color: var(--text-secondary); background: var(--surface-card); border-radius: 22px; border: 1px solid var(--border-color);">
                <p style="font-size: 3rem; margin-bottom: 8px;">📅</p>
                <strong style="color: var(--text-primary); font-weight: 900; font-size: 1.1rem; display:block;">No tienes reservas de viajes programados</strong>
                <small style="color: var(--text-secondary); font-weight: 600; display:block; margin: 6px 0 18px 0;">Puedes reservar un viaje futuro en moto seleccionando fecha y hora</small>
                <button class="btn btn-3d primary-btn btn-open-schedule-now" style="padding: 14px 24px; font-weight: 900; border-radius: 16px;">
                  📅 PROGRAMAR VIAJE AHORA
                </button>
              </div>
            `
          ) : (
            completedTrips.map(trip => `
              <div class="trip-card diorama-card-3d" style="padding: 20px; border-radius: 22px; background: var(--surface-card); border: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                  <span style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 800;">
                    📅 ${new Date(trip.createdAt || Date.now()).toLocaleDateString('es-VE')}
                  </span>
                  <span class="badge badge-success" style="font-size:0.8rem; font-weight:900;">✓ COMPLETADO</span>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; background: var(--surface-elevated); padding: 14px; border-radius: 16px; border: 1px solid var(--border-color);">
                  <div style="display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 0.98rem; font-weight: 800;">
                    <span style="font-size:1.2rem;">🟢</span> ${trip.pickup?.address || 'Origen en Maracaibo'}
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 0.98rem; font-weight: 800;">
                    <span style="font-size:1.2rem;">🚩</span> ${trip.destination?.address || 'Destino en Maracaibo'}
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 14px;">
                  <div>
                    <small style="color:var(--text-secondary); font-weight:800; font-size:0.78rem; display:block;">TARIFA PAGADA</small>
                    <div style="font-weight: 900; color: var(--accent-primary); font-size: 1.3rem; font-family: 'JetBrains Mono', monospace;">
                      €${(trip.fareEUR || trip.fareUSD || 3.50).toFixed(2)} EUR
                    </div>
                  </div>
                  <button class="btn btn-secondary-3d" style="padding: 10px 16px; font-size: 0.88rem; font-weight:800; border-radius:14px;" onclick="window.navigateTo('#/passenger')">
                    🏍️ Pedir de Nuevo
                  </button>
                </div>
              </div>
            `).join('')
          )}
        </div>
      </div>
    `;

    // Handlers
    container.querySelectorAll('.history-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTab = e.currentTarget.dataset.tab;
        renderView();
      });
    });

    container.querySelectorAll('.cancel-scheduled-trip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        db.delete('trips', id);
        renderView();
      });
    });

    const openSchNow = container.querySelector('.btn-open-schedule-now');
    if (openSchNow) {
      openSchNow.addEventListener('click', () => {
        window.navigateTo('#/passenger');
      });
    }
  }

  renderView();
}
