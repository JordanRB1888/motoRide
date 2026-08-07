import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';
import { showToast } from '../../components/toast.js';
import { db } from '../../services/mockDatabase.js';

export function renderFinances(container) {
    const bcvRate = getBcvEuroRate();

    // Mock initial payouts
    let pendingPayouts = [
        { id: 'payout_1', driverName: 'Carlos Mendoza', driverPhone: '+58 414-000-0004', amountEUR: 48.50, bank: '0134 - Banesco', date: new Date().toLocaleTimeString() },
        { id: 'payout_2', driverName: 'José Rodríguez', driverPhone: '+58 412-555-9988', amountEUR: 32.00, bank: '0102 - Banco de Venezuela', date: new Date(Date.now() - 3600000).toLocaleTimeString() }
    ];

    function renderView() {
        const totalIncomeEUR = 4250.00;
        const totalCommissionsEUR = totalIncomeEUR * 0.15;
        const totalPendingPayoutsEUR = pendingPayouts.reduce((acc, p) => acc + p.amountEUR, 0);

        container.innerHTML = `
            <div class="finances-view" style="padding: 10px 0;">
                <div class="header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Finanzas y Liquidaciones</h2>
                        <small style="color: var(--text-secondary);">Control de ingresos, comisiones y pagos a conductores en Maracaibo</small>
                    </div>
                    <span class="badge badge-warning" style="font-size: 0.85rem; padding: 8px 14px; border: 1px solid var(--accent-primary);">
                        🇪🇺 Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}
                    </span>
                </div>

                <!-- KPI Cards Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 28px;">
                    <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 20px; padding: 20px; border-top: 4px solid var(--success);">
                        <span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; display: block; margin-bottom: 6px;">INGRESOS TOTALES (MES)</span>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--success); font-family: 'JetBrains Mono', monospace;">
                            €${totalIncomeEUR.toFixed(2)} EUR
                        </div>
                        <small style="color: var(--text-secondary); font-weight: 600;">~ ${formatVes(totalIncomeEUR)}</small>
                    </div>

                    <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 20px; padding: 20px; border-top: 4px solid var(--accent-secondary);">
                        <span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; display: block; margin-bottom: 6px;">COMISIONES APP (15%)</span>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--accent-secondary); font-family: 'JetBrains Mono', monospace;">
                            €${totalCommissionsEUR.toFixed(2)} EUR
                        </div>
                        <small style="color: var(--text-secondary); font-weight: 600;">~ ${formatVes(totalCommissionsEUR)}</small>
                    </div>

                    <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 20px; padding: 20px; border-top: 4px solid var(--accent-primary);">
                        <span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; display: block; margin-bottom: 6px;">PAGOS PENDIENTES A CONDUCTORES</span>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--accent-primary); font-family: 'JetBrains Mono', monospace;">
                            €${totalPendingPayoutsEUR.toFixed(2)} EUR
                        </div>
                        <small style="color: var(--text-secondary); font-weight: 600;">~ ${formatVes(totalPendingPayoutsEUR)}</small>
                    </div>
                </div>

                <!-- Pending Driver Payouts Approval Section -->
                <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 24px; padding: 24px; border: 1.5px solid var(--border-gold); margin-bottom: 28px;">
                    <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 800; margin-bottom: 16px; display:flex; align-items:center; gap:10px;">
                        💸 Solicitudes de Liquidación por Pago Móvil (${pendingPayouts.length})
                    </h3>

                    ${pendingPayouts.length > 0 ? `
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${pendingPayouts.map(p => `
                                <div style="
                                    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
                                    background: var(--surface-elevated); padding: 16px 20px; border-radius: 18px; border: 1px solid var(--border-color);
                                ">
                                    <div>
                                        <strong style="color: var(--text-primary); font-size: 1rem; display: block;">${p.driverName} (${p.driverPhone})</strong>
                                        <span style="color: var(--text-secondary); font-size: 0.85rem;">Monto a transferir por Pago Móvil:</span>
                                        <strong style="color: var(--accent-primary); font-size: 1.1rem; display: inline-block; margin-left: 6px;">
                                            €${p.amountEUR.toFixed(2)} EUR (~ ${formatVes(p.amountEUR)})
                                        </strong>
                                    </div>
                                    <button class="btn btn-3d primary-btn btn-approve-payout" data-id="${p.id}" style="padding: 12px 20px; font-weight: 800; border-radius: 14px;">
                                        ✓ Aprobar Pago Móvil
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center; padding: 20px; color: var(--success); font-weight: 700;">
                            ✅ No hay solicitudes pendientes de liquidación.
                        </div>
                    `}
                </div>

                <!-- Recent Financial Transactions Table -->
                <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 24px; padding: 24px; border: 1px solid var(--border-color);">
                    <h3 style="color: var(--text-primary); font-size: 1.1rem; font-weight: 800; margin-bottom: 16px;">
                        📝 Historial Reciente de Transacciones
                    </h3>

                    <div style="overflow-x: auto;">
                        <table class="data-table" style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="background: var(--surface-elevated); text-align: left;">
                                    <th style="padding: 12px 16px; color: var(--text-muted); font-size: 0.82rem;">FECHA</th>
                                    <th style="padding: 12px 16px; color: var(--text-muted); font-size: 0.82rem;">TIPO DE OPERACIÓN</th>
                                    <th style="padding: 12px 16px; color: var(--text-muted); font-size: 0.82rem;">MONTO (€ EUR)</th>
                                    <th style="padding: 12px 16px; color: var(--text-muted); font-size: 0.82rem;">EQUIVALENTE VES (BCV)</th>
                                    <th style="padding: 12px 16px; color: var(--text-muted); font-size: 0.82rem;">USUARIO</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 14px 16px; color: var(--text-primary);">${new Date().toLocaleDateString('es-VE')}</td>
                                    <td style="padding: 14px 16px;"><span class="badge badge-success">Cobro de Viaje</span></td>
                                    <td style="padding: 14px 16px; font-weight: 800; color: var(--success);">€4.50 EUR</td>
                                    <td style="padding: 14px 16px; color: var(--text-secondary);">${formatVes(4.50)}</td>
                                    <td style="padding: 14px 16px; color: var(--text-primary);">Jordan Pérez</td>
                                </tr>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 14px 16px; color: var(--text-primary);">${new Date(Date.now() - 86400000).toLocaleDateString('es-VE')}</td>
                                    <td style="padding: 14px 16px;"><span class="badge badge-warning">Liquidación Conductor</span></td>
                                    <td style="padding: 14px 16px; font-weight: 800; color: var(--accent-primary);">€48.50 EUR</td>
                                    <td style="padding: 14px 16px; color: var(--text-secondary);">${formatVes(48.50)}</td>
                                    <td style="padding: 14px 16px; color: var(--text-primary);">Carlos Mendoza</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Approve Payout Buttons
        container.querySelectorAll('.btn-approve-payout').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const payout = pendingPayouts.find(p => p.id === id);
                if (payout) {
                    showToast(`Liquidación aprobada para ${payout.driverName} por €${payout.amountEUR.toFixed(2)} EUR (${formatVes(payout.amountEUR)})`, 'success');
                    pendingPayouts = pendingPayouts.filter(p => p.id !== id);
                    renderView();
                }
            });
        });
    }

    renderView();
}
