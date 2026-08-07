import { db } from '../../services/mockDatabase.js';
import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';
import { showToast } from '../../components/toast.js';

export function renderScheduledRides() {
    const container = document.createElement('div');
    container.className = 'scheduled-rides-view slide-up-animation';
    container.style.cssText = 'padding: 20px; max-width: 600px; margin: 0 auto; color: var(--text-primary);';

    const bcvRate = getBcvEuroRate();

    // Mock scheduled rides in Maracaibo
    let scheduledTrips = [
        {
            id: 'sch_1',
            passengerName: 'Jordan Pérez',
            passengerPhone: '+58 412-555-0001',
            pickup: 'Basílica de Nuestra Señora de Chiquinquirá',
            destination: 'Aeropuerto Internacional La Chinita',
            dateStr: 'Mañana',
            timeStr: '05:00 AM',
            distance: 14.2,
            fareEUR: 8.50,
            assignedDriverId: null
        },
        {
            id: 'sch_2',
            passengerName: 'Valentina Rojas',
            passengerPhone: '+58 414-555-0002',
            pickup: 'Vereda del Lago Maracaibo',
            destination: 'Centro Comercial Sambil Maracaibo',
            dateStr: 'Hoy',
            timeStr: '05:30 PM',
            distance: 5.4,
            fareEUR: 4.80,
            assignedDriverId: null
        },
        {
            id: 'sch_3',
            passengerName: 'Andrés Ramírez',
            passengerPhone: '+58 424-555-0003',
            pickup: 'Calle 72 5 de Julio',
            destination: 'Hospital Universitario de Maracaibo',
            dateStr: 'Mañana',
            timeStr: '08:15 AM',
            distance: 3.8,
            fareEUR: 3.50,
            assignedDriverId: 'driver_1' // Pre-assigned to current driver demo
        }
    ];

    const render = () => {
        container.innerHTML = `
            <div style="margin-bottom: 20px; text-align: left;">
                <h3 style="color: var(--text-primary); font-size: 1.3rem; font-weight: 900; margin-bottom: 4px;">
                    📅 Viajes Programados Disponibles
                </h3>
                <p style="color: var(--text-secondary); font-size: 0.88rem; margin: 0;">
                    Pre-asígnate a servicios reservados en Maracaibo con anticipación y asegura tus ingresos
                </p>
            </div>

            <div style="display:flex; flex-direction:column; gap: 14px;">
                ${scheduledTrips.map(trip => {
                    const isAssignedToMe = trip.assignedDriverId === 'driver_1';
                    const isTaken = trip.assignedDriverId && !isAssignedToMe;

                    return `
                        <div class="diorama-card-3d" style="
                            padding: 18px; border-radius: 22px; background: var(--surface-card);
                            border: ${isAssignedToMe ? '2px solid var(--success)' : '1px solid var(--border-color)'};
                        ">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                                <div style="display:flex; align-items:center; gap: 8px;">
                                    <span class="badge badge-warning" style="font-size:0.8rem; font-weight:800;">
                                        📅 ${trip.dateStr} · ${trip.timeStr}
                                    </span>
                                </div>
                                <span style="font-weight:900; font-size:1.2rem; color:var(--accent-primary); font-family:'JetBrains Mono', monospace;">
                                    €${trip.fareEUR.toFixed(2)} EUR
                                </span>
                            </div>

                            <div style="background: var(--surface-elevated); padding: 12px; border-radius: 14px; border: 1px solid var(--border-color); margin-bottom: 12px; font-size: 0.85rem; display:flex; flex-direction:column; gap: 6px;">
                                <div style="display:flex; align-items:center; gap: 8px;">
                                    <span>🟢</span>
                                    <span><strong>Origen:</strong> ${trip.pickup}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap: 8px;">
                                    <span>🚩</span>
                                    <span><strong>Destino:</strong> ${trip.destination}</span>
                                </div>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <small style="color:var(--text-secondary);">
                                    👤 Pasajero: <strong>${trip.passengerName}</strong> (${trip.distance} km)
                                </small>

                                ${isAssignedToMe ? `
                                    <span class="badge badge-success" style="padding: 8px 14px; font-weight: 800;">
                                        ✓ Pre-asignado a ti
                                    </span>
                                ` : isTaken ? `
                                    <span class="badge badge-secondary" style="padding: 8px 14px;">
                                        Reservado por otro conductor
                                    </span>
                                ` : `
                                    <button class="btn btn-3d claim-scheduled-btn" data-id="${trip.id}" style="
                                        padding: 8px 16px; border-radius: 14px; font-weight: 900; font-size: 0.82rem;
                                        background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color: #121824;
                                    ">
                                        📌 PRE-ASIGNARME
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        container.querySelectorAll('.claim-scheduled-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tripId = btn.dataset.id;
                const trip = scheduledTrips.find(t => t.id === tripId);
                if (trip) {
                    trip.assignedDriverId = 'driver_1';
                    showToast(`¡Te has pre-asignado al viaje reservado de ${trip.passengerName}!`, 'success');
                    render();
                }
            });
        });
    };

    render();
    return container;
}
