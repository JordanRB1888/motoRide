import { showToast } from '../../components/toast.js';
import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';
import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';

const PAYMENT_DATA = Object.freeze({ bank:'Venezuela', identity:'26242188', phone:'04127844848' });
const paymentLabel = method => ({ wallet:'Wallet', efectivo:'Efectivo', cash_usd:'Efectivo USD', cash_ves:'Efectivo Bs.', pago_movil:'Pago Móvil', zelle:'Zelle', zinli:'Zinli' })[String(method || '').toLowerCase()] || 'Pago directo';

export function renderEarnings() {
  const container = document.createElement('div');
  container.className = 'earnings-page earnings-premium';
  let wallet = { balance:0, transactions:[] };
  let serverTrips = [];
  const completed = () => serverTrips.filter(trip => trip.status === 'COMPLETED');
  const handleWalletUpdate = event => {
    if (!container.isConnected) {
      window.removeEventListener('58express:wallet-updated', handleWalletUpdate);
      return;
    }
    const update = event.detail || {};
    wallet.balance = Number(update.balance || 0);
    if (update.transaction && !(wallet.transactions || []).some(item => item.id === update.transaction.id)) {
      wallet.transactions = [update.transaction, ...(wallet.transactions || [])];
    }
    render();
  };
  window.addEventListener('58express:wallet-updated', handleWalletUpdate);

  const load = async () => {
    const [walletResult, tripResult] = await Promise.all([apiService.get('/wallet/me'), apiService.get('/trips/me/history')]);
    if (walletResult) wallet = walletResult;
    if (Array.isArray(tripResult)) serverTrips = tripResult;
    render();
  };

  const openTopup = () => {
    const modal = document.createElement('div');
    modal.className = 'wallet-topup-backdrop';
    modal.innerHTML = `<form class="wallet-topup-modal">
      <button type="button" data-close aria-label="Cerrar">${icon('close',20)}</button>
      <span>${icon('wallet',20)}</span><small class="wallet-modal-eyebrow">SALDO OPERATIVO DEL CONDUCTOR</small>
      <h3>Recargar Wallet</h3><p>Realiza el Pago Móvil, registra la referencia y administración validará la recarga.</p>
      <div class="wallet-payment-data"><div><small>BANCO</small><strong>${PAYMENT_DATA.bank}</strong></div><div><small>CÉDULA / RIF</small><strong>${PAYMENT_DATA.identity}</strong></div><div><small>TELÉFONO</small><strong>${PAYMENT_DATA.phone}</strong></div><button type="button" data-copy>${icon('copy',14)} Copiar datos</button></div>
      <label>Monto en USD<input name="amount" type="number" min="1" max="1000" step="0.01" required placeholder="Ej. 10.00"></label>
      <label>Referencia de Pago Móvil<input name="reference" inputmode="numeric" minlength="6" maxlength="20" required placeholder="Últimos números de la referencia"></label>
      <button type="submit">${icon('check',16)} Enviar a verificación</button>
    </form>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.querySelector('[data-copy]').onclick = async () => {
      const text = `Banco: ${PAYMENT_DATA.bank}\nCédula/RIF: ${PAYMENT_DATA.identity}\nTeléfono: ${PAYMENT_DATA.phone}`;
      try { await navigator.clipboard.writeText(text); showToast('Datos copiados.', 'success'); }
      catch { showToast(`${PAYMENT_DATA.bank} · ${PAYMENT_DATA.identity} · ${PAYMENT_DATA.phone}`, 'info'); }
    };
    modal.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await apiService.post('/wallet/topups', { amount:Number(values.amount), reference:values.reference });
      if (!result) return showToast(apiService.lastError?.error === 'REFERENCE_EXISTS' ? 'Esa referencia ya fue registrada.' : 'No se pudo registrar la recarga.', 'error');
      modal.remove(); showToast('Recarga enviada a verificación administrativa.', 'success'); await load();
    };
  };

  const render = () => {
    const trips = completed();
    const balance = Number(wallet.balance || 0);
    const debt = balance < 0;
    const bcv = getBcvEuroRate();
    const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate()-6);
    const weekly = Array.from({length:7},(_,index) => { const date=new Date(start); date.setDate(start.getDate()+index); return trips.filter(t=>new Date(t.completedAt||t.updatedAt).toDateString()===date.toDateString()).reduce((sum,t)=>sum+Number(t.driverEarningUSD||0),0); });
    const max = Math.max(1,...weekly);
    const days = Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return date.toLocaleDateString('es-VE',{weekday:'short'}).slice(0,3);});
    const movements = (wallet.transactions || []).filter(item => ['DRIVER_EARNING','PLATFORM_COMMISSION','TOP_UP','PAYOUT','DRIVER_ACCOUNT_MAINTENANCE'].includes(item.type)).slice(0,8);
    // DRIVER-FINANCE-1: la deuda se cuenta con números exactos, no con un
    // «recarga» a secas — quien está bloqueado necesita saber CUÁNTO.
    const LIMITE_DEUDA = 5;
    const bloqueado = balance <= -LIMITE_DEUDA;
    const paraSalir = balance > 0 ? 0 : Math.round((-balance + 0.01) * 100) / 100;
    const avisoDeuda = bloqueado
      ? `<section class="earnings-debt-block"><strong>${icon('alertTriangle',20)} Saldo pendiente</strong>
          <p>Debes pagar tu deuda y dejar tu saldo en positivo para volver a realizar carreras.</p>
          <p class="earnings-debt-amount">Necesitas recargar al menos <strong>$${paraSalir.toFixed(2)}</strong></p></section>`
      : balance < 0
      ? `<section class="earnings-debt-warning">${icon('alertTriangle',16)}
          <span>Tu saldo está en negativo. Al llegar a −$${LIMITE_DEUDA.toFixed(2)} no podrás recibir carreras.</span></section>`
      : '';

    container.innerHTML = `<header class="earnings-title"><h2>Cuenta operativa</h2><span>Tasa referencial BCV: Bs. ${bcv.toFixed(2)}</span></header>
      ${avisoDeuda}
      <section class="earnings-balance-card ${debt?'debt':''}"><div class="earnings-balance-meta"><strong>${debt?'SALDO DEUDOR CON +58EXPRESS':'BALANCE DISPONIBLE REAL'}</strong><span>${trips.length} VIAJES</span></div><div class="earnings-amount">${debt?'−':''}$${Math.abs(balance).toFixed(2)} <small>USD</small></div><div class="earnings-ves">${debt?`Debes recargar ${formatVes(Math.abs(balance))} para quedar al día.`:`≈ ${formatVes(balance)}`}</div><div class="earnings-balance-actions">${balance>0?'<button id="btn-payout-driver">Solicitar liquidación</button>':''}<button id="btn-topup-driver">${debt?'Recargar y pagar deuda':'Recargar saldo operativo'}</button></div></section>
      <section class="earnings-chart-card"><div class="earnings-card-title"><span>${icon('barChart',20)}</span><div><strong>Ganancia económica</strong><small>Lo ganado en viajes, separado del saldo operativo</small></div></div><div class="earnings-chart"><div class="chart-grid"><i></i><i></i><i></i><i></i></div>${weekly.map((value,index)=>`<div class="chart-column ${index===6?'active':''}"><span>$${value.toFixed(1)}</span><div style="height:${Math.round(value/max*100)}%"></div><small>${days[index]}</small></div>`).join('')}</div></section>
      <section class="earnings-activity-card"><div class="earnings-card-title compact"><span>${icon('clock',20)}</span><strong>Movimientos de la cuenta</strong></div><div class="earnings-activity-list">${movements.map(item=>{const debit=Number(item.amount)<0;const labels={DRIVER_EARNING:'Ganancia acreditada',PLATFORM_COMMISSION:'Comisión +58Express',TOP_UP:'Recarga',PAYOUT:'Liquidación',DRIVER_ACCOUNT_MAINTENANCE:'Mantenimiento de cuenta'};return `<div class="earning-row"><span class="earning-bike">${icon(item.type==='PLATFORM_COMMISSION'?'dollarSign':'wallet',17)}</span><div><strong>${labels[item.type]||item.type}</strong><small>${item.tripId?`${paymentLabel(item.paymentMethod)} · Viaje #${item.tripId.slice(-6)}`:new Date(item.createdAt).toLocaleString('es-VE')}</small></div><div class="earning-row-amount ${debit?'debit':''}"><strong>${debit?'−':'+'}$${Math.abs(Number(item.amount||0)).toFixed(2)}</strong></div><span class="earning-status">${item.status}</span></div>`;}).join('')||'<p class="wallet-empty">Todavía no hay movimientos.</p>'}</div></section>`;

    container.querySelector('#btn-topup-driver').onclick = openTopup;
    container.querySelector('#btn-payout-driver')?.addEventListener('click', async () => {
      const result=await apiService.post('/wallet/payouts',{amount:balance});
      if(!result)return showToast(apiService.lastError?.error==='PAYOUT_ALREADY_PENDING'?'Ya tienes una liquidación pendiente.':'No se pudo enviar la solicitud.','error');
      showToast('Liquidación enviada a administración.','success');await load();
    });
  };

  render(); load(); return container;
}
