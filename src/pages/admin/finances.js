import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export async function renderFinances(container) {
  container.innerHTML = '<div class="admin-loading">Conciliando movimientos reales…</div>';
  let data = await apiService.get('/admin/finance');
  let walletMode = 'all';
  let tripQuery = '';
  let dateFrom = '';
  let dateTo = '';

  if (!data) {
    container.innerHTML = '<div class="admin-empty">No se pudo cargar el libro financiero.</div>';
    return;
  }

  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const statusLabel = status => status === 'APPROVED' ? 'Aprobado' : status === 'REJECTED' ? 'Rechazado' : 'Pendiente';
  const typeLabel = type => type === 'TOP_UP' ? 'Recarga' : type === 'PAYOUT' ? 'Liquidación' : 'Ganancia';
  const personName = person => person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : 'Usuario';
  const reload = async () => {
    const next = await apiService.get('/admin/finance');
    if (next) {
      data = next;
      draw();
    }
  };

  function chartMarkup() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return date;
    });
    const totals = days.map(date => (data.transactions || [])
      .filter(transaction => new Date(transaction.date).toDateString() === date.toDateString())
      .reduce((sum, transaction) => sum + Number(transaction.gross || 0), 0));
    const commissions = days.map(date => (data.transactions || [])
      .filter(transaction => new Date(transaction.date).toDateString() === date.toDateString())
      .reduce((sum, transaction) => sum + Number(transaction.commission || 0), 0));
    const ceiling = Math.max(10, Math.ceil(Math.max(...totals, ...commissions, 0) / 10) * 10);
    const width = 720;
    const height = 176;
    const left = 44;
    const right = 16;
    const top = 14;
    const bottom = 30;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const point = (value, index) => `${left + (plotWidth / 6) * index},${top + plotHeight - (Number(value) / ceiling) * plotHeight}`;
    const grossPoints = totals.map(point).join(' ');
    const commissionPoints = commissions.map(point).join(' ');
    const areaPoints = `${left},${top + plotHeight} ${grossPoints} ${left + plotWidth},${top + plotHeight}`;

    return `<div class="finance-chart-legend"><span class="gross"><i></i>Facturación</span><span class="commission"><i></i>Comisión</span></div>
      <svg class="finance-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos y comisiones de los últimos siete días">
        <defs>
          <linearGradient id="financeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#20dc8e" stop-opacity=".23"/><stop offset="1" stop-color="#20dc8e" stop-opacity="0"/></linearGradient>
        </defs>
        ${[0, .25, .5, .75, 1].map(step => {
          const y = top + plotHeight * step;
          const label = money(ceiling * (1 - step)).replace('.00', '');
          return `<line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}"/><text x="0" y="${y + 4}">${label}</text>`;
        }).join('')}
        <polygon class="finance-area" points="${areaPoints}"/>
        <polyline class="finance-line gross" points="${grossPoints}"/>
        <polyline class="finance-line commission" points="${commissionPoints}"/>
        ${totals.map((value, index) => `<circle class="finance-point gross" cx="${point(value, index).split(',')[0]}" cy="${point(value, index).split(',')[1]}" r="3.5"><title>${money(value)}</title></circle>`).join('')}
        ${commissions.map((value, index) => `<circle class="finance-point commission" cx="${point(value, index).split(',')[0]}" cy="${point(value, index).split(',')[1]}" r="3"><title>${money(value)}</title></circle>`).join('')}
        ${days.map((date, index) => `<text class="finance-day" x="${left + (plotWidth / 6) * index}" y="${height - 5}" text-anchor="middle">${date.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }).replace('.', '')}</text>`).join('')}
      </svg>`;
  }

  function filteredTrips() {
    return (data.transactions || []).filter(transaction => {
      const haystack = `${transaction.id} ${personName(transaction.driver)} ${transaction.paymentMethod || ''}`.toLowerCase();
      if (tripQuery && !haystack.includes(tripQuery.toLowerCase())) return false;
      const timestamp = new Date(transaction.date || 0).getTime();
      if (dateFrom && timestamp < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
      if (dateTo && timestamp > new Date(`${dateTo}T23:59:59`).getTime()) return false;
      return true;
    });
  }

  const draw = () => {
    const requests = data.walletRequests || [];
    const pendingCount = requests.filter(item => item.status === 'PENDING').length;
    const visibleRequests = requests.filter(item => walletMode === 'payouts' ? item.type === 'PAYOUT' : true).slice(0, 4);
    const trips = filteredTrips();

    container.innerHTML = `<div class="finance-command-view">
      <div class="finance-section-tabs" role="tablist" aria-label="Secciones de finanzas">
        <button class="${walletMode === 'all' ? 'active' : ''}" data-finance-tab="summary">${icon('trending', 16)} Resumen</button>
        <button data-finance-tab="topups">${icon('wallet', 16)} Recargas</button>
        <button class="${walletMode === 'payouts' ? 'active' : ''}" data-finance-tab="payouts">${icon('dollarSign', 16)} Liquidaciones</button>
        <button data-finance-tab="trips">${icon('car', 16)} Viajes</button>
        <span class="finance-bcv-rate">BCV <strong>Bs. ${Number(data.bcvRate || 0).toFixed(2)}</strong></span>
      </div>

      <section class="finance-metric-grid">
        <article class="finance-metric green"><div class="finance-metric-icon">${icon('trending', 20)}</div><div><span>Facturación</span><strong>${money(data.summary.gross)}</strong><small>Total facturado</small></div><i></i></article>
        <article class="finance-metric cyan"><div class="finance-metric-icon">${icon('dollarSign', 20)}</div><div><span>Comisión</span><strong>${money(data.summary.commission)}</strong><small>Total comisiones</small></div><i></i></article>
        <article class="finance-metric amber"><div class="finance-metric-icon">${icon('wallet', 20)}</div><div><span>Retiros pendientes</span><strong>${money(data.summary.pending)}</strong><small>Total por retirar</small></div><i></i></article>
        <article class="finance-metric emerald"><div class="finance-metric-icon">${icon('checkCircle', 20)}</div><div><span>Liquidado</span><strong>${money(data.summary.paid)}</strong><small>Total liquidado</small></div><i></i></article>
        <article class="finance-metric debt"><div class="finance-metric-icon">${icon('alertCircle', 20)}</div><div><span>Deuda conductores</span><strong>${money(data.summary.driverDebt)}</strong><small>${Number(data.summary.driversInDebt || 0)} conductores con saldo deudor</small></div><i></i></article>
      </section>

      <div class="finance-middle-grid">
        <section class="finance-card finance-chart-card">
          <header><div><h3>Evolución de ingresos y comisiones</h3><p>Datos reales acreditados por día.</p></div><span>Últimos 7 días ${icon('chevronDown', 14)}</span></header>
          ${chartMarkup()}
        </section>

        <section class="finance-card finance-wallet-card" id="finance-wallet-card">
          <header><div><h3>${walletMode === 'payouts' ? 'Liquidaciones de conductores' : 'Solicitudes de billetera'}</h3><p>Recargas y retiros sujetos a validación administrativa.</p></div><span>${pendingCount} pendientes</span></header>
          <div class="finance-table-scroll"><table class="finance-table"><thead><tr><th>Usuario</th><th>Tipo</th><th>Monto</th><th>Referencia</th><th>Fecha</th><th>Estado / acción</th></tr></thead><tbody>
            ${visibleRequests.map(item => `<tr><td>${escapeHtml(personName(item.user) || item.userId?.slice(-8))}</td><td>${typeLabel(item.type)}</td><td><strong>${money(item.amount)}</strong></td><td><code>${escapeHtml(item.reference || '—')}</code></td><td>${new Date(item.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${item.status === 'PENDING' ? (item.type === 'TOP_UP' ? `<button class="finance-review" data-open-topups>Revisar</button>` : `<div class="finance-actions"><button class="approve" data-transaction="${item.id}" data-status="APPROVED">Aprobar</button><button class="reject" data-transaction="${item.id}" data-status="REJECTED">Rechazar</button></div>`) : `<span class="finance-status ${item.status.toLowerCase()}">${statusLabel(item.status)}</span>`}</td></tr>`).join('') || '<tr><td colspan="6" class="finance-empty">No existen solicitudes en esta sección.</td></tr>'}
          </tbody></table></div>
          <button class="finance-see-all" data-open-topups>Ver todas las solicitudes ${icon('chevronRight', 16)}</button>
        </section>
      </div>

      <section class="finance-card finance-trips-card" id="finance-trips-card">
        <header><div><h3>Viajes completados</h3><p>Wallet acredita el neto; pagos directos descuentan la comisión al conductor.</p></div>
          <form class="finance-trip-filters" id="finance-trip-filters">
            <label>${icon('search', 16)}<input name="query" value="${escapeHtml(tripQuery)}" placeholder="Buscar movimiento"></label>
            <label class="date">Desde<input type="date" name="from" value="${dateFrom}"></label>
            <label class="date">Hasta<input type="date" name="to" value="${dateTo}"></label>
            <button type="submit">${icon('filter', 15)} Filtrar</button>
          </form>
        </header>
        <div class="finance-table-scroll trips"><table class="finance-table"><thead><tr><th>Viaje</th><th>Conductor</th><th>Pago</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Liquidación</th></tr></thead><tbody>
          ${trips.map(transaction => `<tr><td><code>#${escapeHtml(transaction.id.slice(-7))}</code></td><td>${escapeHtml(personName(transaction.driver) || 'Sin conductor')}</td><td>${escapeHtml(String(transaction.paymentMethod || 'efectivo').replace('_',' '))}</td><td>${money(transaction.gross)}</td><td>${money(transaction.commission)}</td><td><strong>${money(transaction.driverNet)}</strong></td><td><span class="finance-status ${transaction.settlementType==='COMMISSION_DEBIT'?'pending':'approved'}">${transaction.settlementType==='COMMISSION_DEBIT'?'Comisión descontada':'Neto acreditado'}</span></td></tr>`).join('') || '<tr><td colspan="7" class="finance-empty">No hay viajes que coincidan con los filtros.</td></tr>'}
        </tbody></table></div>
        <div class="finance-table-footer"><span>${trips.length} viajes encontrados</span><button data-clear-finance-filters>Ver todos los viajes ${icon('chevronRight', 16)}</button></div>
      </section>
    </div>`;

    container.querySelector('[data-finance-tab="summary"]')?.addEventListener('click', () => {
      walletMode = 'all';
      draw();
    });
    container.querySelector('[data-finance-tab="topups"]')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('58express:admin-tab', { detail: 'topups' })));
    container.querySelector('[data-finance-tab="payouts"]')?.addEventListener('click', () => {
      walletMode = 'payouts';
      draw();
      requestAnimationFrame(() => container.querySelector('#finance-wallet-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    });
    container.querySelector('[data-finance-tab="trips"]')?.addEventListener('click', () => container.querySelector('#finance-trips-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    container.querySelectorAll('[data-open-topups]').forEach(button => button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('58express:admin-tab', { detail: 'topups' }))));
    container.querySelectorAll('[data-transaction]').forEach(button => button.addEventListener('click', async () => {
      const result = await apiService.patch(`/admin/transactions/${button.dataset.transaction}`, { status: button.dataset.status });
      if (!result) return showToast('No se pudo conciliar la solicitud.', 'error');
      showToast(button.dataset.status === 'APPROVED' ? 'Liquidación aprobada.' : 'Liquidación rechazada.', 'success');
      await reload();
    }));
    container.querySelector('#finance-trip-filters')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      tripQuery = String(form.get('query') || '').trim();
      dateFrom = String(form.get('from') || '');
      dateTo = String(form.get('to') || '');
      draw();
    });
    container.querySelector('[data-clear-finance-filters]')?.addEventListener('click', () => {
      tripQuery = '';
      dateFrom = '';
      dateTo = '';
      draw();
    });
  };

  draw();
}
