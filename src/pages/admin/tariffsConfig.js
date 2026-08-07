import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';
import { showToast } from '../../components/toast.js';

export function renderTariffsConfig(container) {
    const bcvRate = getBcvEuroRate();

    container.innerHTML = `
        <div class="tariffs-view" style="padding: 10px 0;">
            <div class="header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:10px;">
                <div>
                    <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Configuración de Tarifas y BCV</h2>
                    <small style="color: var(--text-secondary);">Ajusta los costos base por km, minuto y la tasa oficial en Maracaibo</small>
                </div>
                <span class="badge badge-warning" style="font-size: 0.85rem; padding: 8px 14px; border: 1px solid var(--accent-primary);">
                    🇪🇺 Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}
                </span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
                <!-- Tariff Settings Form Card -->
                <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 24px; padding: 24px; border: 1px solid var(--border-color);">
                    <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 800; margin-bottom: 18px; display:flex; align-items:center; gap:8px;">
                        ⚙️ Parámetros del Sistema
                    </h3>

                    <form id="tariff-form" style="display:flex; flex-direction:column; gap: 14px;">
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Tarifa Base (€ EUR):</label>
                            <input type="number" id="baseFare" step="0.1" value="1.00" required style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Costo por Kilómetro (€ EUR):</label>
                            <input type="number" id="perKm" step="0.1" value="0.50" required style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Costo por Minuto (€ EUR):</label>
                            <input type="number" id="perMin" step="0.01" value="0.05" required style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Tarifa Mínima por Viaje (€ EUR):</label>
                            <input type="number" id="minFare" step="0.1" value="1.50" required style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Comisión de la App (%):</label>
                            <input type="number" id="commission" step="1" value="15" required style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Tasa BCV Euro (Bs./EUR):</label>
                            <input type="number" id="bcv" step="0.01" value="${bcvRate.toFixed(2)}" required style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-gold);
                                background:var(--surface-input); color:var(--accent-primary); font-weight:800; font-size:1.05rem; outline:none;
                            ">
                        </div>

                        <button type="submit" class="btn btn-3d primary-btn" style="
                            width:100%; padding:16px; font-weight:900; font-size:1rem; margin-top:10px;
                            background: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%); color:#121824;
                        ">
                            ⚡ GUARDAR CONFIGURACIÓN DE TARIFAS
                        </button>
                    </form>
                </div>

                <!-- Fare Simulator Card -->
                <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 24px; padding: 24px; border: 1.5px solid var(--accent-secondary);">
                    <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 800; margin-bottom: 18px; display:flex; align-items:center; gap:8px;">
                        🧮 Simulador de Viaje en Maracaibo
                    </h3>

                    <div style="display:flex; flex-direction:column; gap: 14px;">
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Distancia Estimada (Km):</label>
                            <input type="number" id="sim-dist" value="4.8" step="0.1" style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Tiempo Estimado (Minutos):</label>
                            <input type="number" id="sim-time" value="12" step="1" style="
                                width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
                                background:var(--surface-input); color:white; font-size:1rem; outline:none;
                            ">
                        </div>

                        <div style="
                            margin-top: 16px; padding: 20px; border-radius: 20px;
                            background: var(--surface-elevated); border: 1px solid var(--accent-secondary); text-align: center;
                        ">
                            <small style="color:var(--text-muted); font-size:0.78rem; display:block; margin-bottom:4px;">PRECIO ESTIMADO DEL VIAJE</small>
                            <div style="font-size: 2.2rem; font-weight: 900; color: var(--accent-secondary); font-family: 'JetBrains Mono', monospace;" id="sim-result-eur">
                                €0.00 EUR
                            </div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin-top: 4px;" id="sim-result-ves">
                                Bs. 0.00
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    function calculateSim() {
        const base = parseFloat(container.querySelector('#baseFare').value) || 0;
        const perKm = parseFloat(container.querySelector('#perKm').value) || 0;
        const perMin = parseFloat(container.querySelector('#perMin').value) || 0;
        const minFare = parseFloat(container.querySelector('#minFare').value) || 0;
        const bcv = parseFloat(container.querySelector('#bcv').value) || 1;

        const dist = parseFloat(container.querySelector('#sim-dist').value) || 0;
        const time = parseFloat(container.querySelector('#sim-time').value) || 0;

        let totalEUR = base + (dist * perKm) + (time * perMin);
        if (totalEUR < minFare) totalEUR = minFare;

        const totalVES = totalEUR * bcv;

        container.querySelector('#sim-result-eur').textContent = `€${totalEUR.toFixed(2)} EUR`;
        container.querySelector('#sim-result-ves').textContent = `~ Bs. ${totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    container.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', calculateSim);
    });

    container.querySelector('#tariff-form').addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Configuración de tarifas guardada exitosamente', 'success');
    });

    calculateSim();
}
