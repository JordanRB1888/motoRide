import { showToast } from '../../components/toast.js';
import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';
import { authService } from '../../services/mockAuth.js';
import { db } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';

export function renderEarnings() {
  const container = document.createElement('div');
  container.className = 'earnings-page earnings-premium';
  const user = authService.getCurrentUser() || {};
  const bcvRate = getBcvEuroRate();
  const completedTrips = db.getCollection('trips').filter(trip =>
    trip.status === 'COMPLETED' && (!user.id || !trip.driverId || trip.driverId === user.id)
  );
  const netEarningsEUR = Number(user.walletBalance ?? 48.50);
  const tripCount = completedTrips.length || Number(user.totalTripsToday || 12);
  const formattedVES = formatVes(netEarningsEUR);
  const weekly = [24.30, 31.20, 42.10, 48.50, 35.80, 27.40, 18.90];
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const max = 60;
  const recent = completedTrips.slice(-3).reverse().map((trip, index) => ({
    amount: Number(trip.fareEUR || trip.fareUSD || [4.30, 3.80, 4.20][index]),
    time: new Date(trip.completedAt || trip.updatedAt || Date.now() - index * 37 * 60000)
  }));
  while (recent.length < 3) {
    const index = recent.length;
    recent.push({ amount: [4.30, 3.80, 4.20][index], time: new Date(Date.now() - index * 37 * 60000) });
  }

  container.innerHTML = `
    <header class="earnings-title"><h2>Ganancias Mototaxista</h2><span>€ Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}</span></header>
    <section class="earnings-balance-card">
      <div class="earnings-balance-meta"><strong>BALANCE ACUMULADO HOY</strong><span>${tripCount} VIAJES</span></div>
      <div class="earnings-amount">€${netEarningsEUR.toFixed(2)} <small>EUR</small></div>
      <div class="earnings-ves">~ ${formattedVES}</div>
      <button id="btn-payout-driver">⚡ Solicitar liquidación por Pago Móvil</button>
    </section>
    <section class="earnings-chart-card">
      <div class="earnings-card-title"><span>${icon('barChart', 19)}</span><div><strong>Historial de Ganancias en Euros</strong><small>Esta semana</small></div><button title="Información">${icon('info', 18)}</button></div>
      <div class="earnings-chart" aria-label="Ganancias semanales">
        <div class="chart-grid"><i></i><i></i><i></i><i></i></div>
        ${weekly.map((value, index) => `<div class="chart-column ${index === 3 ? 'active' : ''}"><span>€${value.toFixed(1)}</span><div style="height:${Math.round(value / max * 100)}%"></div><small>${days[index]}</small></div>`).join('')}
      </div>
    </section>
    <section class="earnings-summary-card">
      <div class="earnings-card-title compact"><span>${icon('trending', 19)}</span><strong>Resumen de actividad</strong></div>
      <div class="earnings-summary-grid">
        <div><span>🏍️</span><small>Viajes realizados</small><strong>${tripCount}</strong></div>
        <div><span>${icon('wallet', 18)}</span><small>Ganancia en EUR</small><strong>€${netEarningsEUR.toFixed(2)}</strong></div>
        <div><span>${icon('dollarSign', 18)}</span><small>Equivalente en Bs.</small><strong>${formattedVES.replace('Bs. ', '')}</strong></div>
      </div>
    </section>
    <section class="earnings-activity-card">
      <div class="earnings-card-title compact"><span>${icon('clock', 19)}</span><strong>Actividad reciente</strong><button>Ver todas ${icon('chevronRight', 15)}</button></div>
      <div class="earnings-activity-list">
        ${recent.map(item => `<div class="earning-row"><span class="earning-bike">🏍️</span><div><strong>Cobro por viaje</strong><small>Hoy, ${item.time.toLocaleTimeString('es-VE', { hour:'numeric', minute:'2-digit' })}</small></div><div class="earning-row-amount"><strong>€${item.amount.toFixed(2)}</strong><small>~ ${formatVes(item.amount)}</small></div><span class="earning-status">Completado</span></div>`).join('')}
      </div>
    </section>`;

  container.querySelector('#btn-payout-driver').addEventListener('click', () => {
    showToast(`Solicitud de liquidación procesada (€${netEarningsEUR.toFixed(2)} / ${formattedVES})`, 'success');
  });
  return container;
}
