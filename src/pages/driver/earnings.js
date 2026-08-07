import { showToast } from '../../components/toast.js';
import { getBcvEuroRate, eurToVes, formatVes, formatEur } from '../../utils/bcvRates.js';

export function renderEarnings() {
    const container = document.createElement('div');
    container.className = 'earnings-page';
    container.style.cssText = 'padding: 20px 16px 100px; max-width: 480px; margin: 0 auto;';
    
    const bcvRate = getBcvEuroRate();
    const netEarningsEUR = 48.50;
    const formattedVES = formatVes(netEarningsEUR);

    container.innerHTML = `
        <div class="page-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:10px;">
            <h2 style="color: var(--text-primary); font-size: 1.4rem; font-weight: 800; margin: 0;">Ganancias Mototaxista</h2>
            <span class="badge badge-warning" style="font-size: 0.8rem; padding: 6px 12px; border: 1px solid var(--accent-primary);">
                🇪🇺 Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}
            </span>
        </div>
        
        <!-- Gold Balance Card -->
        <div class="diorama-card-3d" style="
            background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%);
            border-radius: 24px; padding: 24px; color: #121824;
            box-shadow: 0 15px 35px rgba(255, 193, 7, 0.35); margin-bottom: 24px;
        ">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <span style="font-weight: 900; font-size: 0.85rem;">BALANCE ACUMULADO HOY</span>
                <span style="background: rgba(18,24,36,0.15); padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.8rem;">12 VIAJES</span>
            </div>

            <div style="font-size: 2.6rem; font-weight: 900; font-family: 'JetBrains Mono', monospace; line-height: 1; margin-bottom: 4px;">
                €${netEarningsEUR.toFixed(2)} <span style="font-size: 1.1rem;">EUR</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; opacity: 0.9; margin-bottom: 20px;">
                ~ ${formattedVES}
            </div>

            <button id="btn-payout-driver" class="btn" style="
                width: 100%; padding: 14px; background: #121824; color: #FFC107;
                border: none; border-radius: 16px; font-weight: 900; font-size: 0.95rem; cursor: pointer;
            ">
                ⚡ Solicitar Liquidación por Pago Móvil
            </button>
        </div>

        <!-- Weekly Activity Bar Chart -->
        <div class="diorama-card-3d" style="padding: 20px; border-radius: 20px; background: var(--surface-card); border: 1px solid var(--border-color); margin-bottom: 24px;">
            <h3 style="color:var(--text-primary); font-size: 1rem; font-weight: 800; margin-bottom: 16px;">
                📊 Historial de Ganancias en Euros (Semana)
            </h3>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; height: 120px; padding-top: 10px;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 50%; background: var(--accent-secondary); border-radius: 6px;"></div>
                    <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Lun</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 70%; background: var(--accent-secondary); border-radius: 6px;"></div>
                    <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Mar</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 40%; background: var(--accent-secondary); border-radius: 6px;"></div>
                    <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Mié</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 85%; background: var(--accent-primary); border-radius: 6px; box-shadow: 0 0 10px rgba(255,193,7,0.4);"></div>
                    <span style="color:var(--accent-primary); font-size:0.75rem; font-weight:800;">Jue</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 95%; background: var(--success); border-radius: 6px;"></div>
                    <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Vie</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 100%; background: var(--success); border-radius: 6px;"></div>
                    <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Sáb</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
                    <div style="width: 24px; height: 75%; background: var(--accent-secondary); border-radius: 6px;"></div>
                    <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Dom</span>
                </div>
            </div>
        </div>
    `;
    
    container.querySelector('#btn-payout-driver').addEventListener('click', () => {
        showToast(`Solicitud de liquidación Pago Móvil procesada (€${netEarningsEUR.toFixed(2)} EUR / ${formattedVES})`, 'success');
    });

    return container;
}
