import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const statusLabel = status => ({
  PENDING: 'Pendiente', APPROVED: 'Acreditada', REJECTED: 'Rechazada'
}[status] || status);

const formatMoney = amount => `$${Number(amount || 0).toFixed(2)}`;

export async function renderWalletTopups(container) {
  let allTopups = [];
  let filter = 'PENDING';
  let query = '';

  const load = async () => {
    container.innerHTML = '<div class="admin-loading">Cargando recargas registradas…</div>';
    const finance = await apiService.get('/admin/finance');
    if (!finance) {
      container.innerHTML = '<div class="admin-empty">No se pudieron cargar las solicitudes de recarga.</div>';
      return;
    }
    allTopups = (finance.walletRequests || []).filter(item => item.type === 'TOP_UP');
    draw();
  };

  const openReview = topup => {
    const user = topup.user || {};
    const modal = document.createElement('div');
    modal.className = 'topup-review-backdrop';
    modal.innerHTML = `<section class="topup-review-modal" role="dialog" aria-modal="true" aria-labelledby="topup-review-title">
      <header>
        <div><small>VALIDACIÓN BANCARIA</small><h2 id="topup-review-title">Revisar recarga</h2></div>
        <button type="button" data-close aria-label="Cerrar">${icon('close', 18)}</button>
      </header>
      <div class="topup-review-body">
        <section class="topup-review-amount">
          <span>${icon('wallet', 22)}</span>
          <div><small>MONTO A ACREDITAR</small><strong>${formatMoney(topup.amount)} <em>USD</em></strong></div>
          <b class="topup-status ${String(topup.status).toLowerCase()}">${statusLabel(topup.status)}</b>
        </section>
        <div class="topup-review-grid">
          <article><small>Pasajero</small><strong>${escapeHtml(`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Usuario')}</strong><span>${escapeHtml(user.email || 'Sin correo')}</span></article>
          <article><small>Teléfono</small><strong>${escapeHtml(user.phone || 'Sin registrar')}</strong><span>ID ${escapeHtml(String(topup.userId || '').slice(-10))}</span></article>
          <article class="reference"><small>Referencia bancaria declarada</small><strong>${escapeHtml(topup.reference || '—')}</strong><span>Pago Móvil · ${new Date(topup.createdAt).toLocaleString('es-VE')}</span></article>
        </div>
        ${topup.status === 'PENDING' ? `<div class="topup-verification-note">${icon('shield', 19)}<p><strong>Compara esta referencia con el movimiento recibido en tu banco.</strong><span>La plataforma no puede consultar Banesco automáticamente. Aprueba únicamente después de confirmar que el dinero llegó.</span></p></div>
        <label class="topup-confirm-check"><input type="checkbox" id="confirm-topup-reference"><span>${icon('checkCircle', 18)} Confirmé en el banco que la referencia <b>${escapeHtml(topup.reference)}</b> fue recibida por el monto correcto.</span></label>
        <label class="topup-review-note">Nota administrativa (opcional)<textarea id="topup-review-note" maxlength="500" placeholder="Ej.: Referencia verificada en Banesco"></textarea></label>` : `
        <div class="topup-reviewed"><strong>Revisada ${new Date(topup.reviewedAt || topup.createdAt).toLocaleString('es-VE')}</strong><span>${escapeHtml(topup.reviewNote || 'Sin nota administrativa.')}</span></div>`}
      </div>
      <footer>
        ${topup.status === 'PENDING' ? `<button type="button" class="topup-reject">${icon('close', 17)} Rechazar</button><button type="button" class="topup-approve" disabled>${icon('check', 18)} Aprobar y acreditar ${formatMoney(topup.amount)}</button>` : '<button type="button" class="topup-close-secondary" data-close>Cerrar</button>'}
      </footer>
    </section>`;

    const close = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    const checkbox = modal.querySelector('#confirm-topup-reference');
    const approveButton = modal.querySelector('.topup-approve');
    if (checkbox && approveButton) checkbox.onchange = () => { approveButton.disabled = !checkbox.checked; };

    const review = async status => {
      const actionButton = status === 'APPROVED' ? approveButton : modal.querySelector('.topup-reject');
      if (!actionButton) return;
      actionButton.disabled = true;
      const result = await apiService.patch(`/admin/transactions/${topup.id}`, {
        status,
        referenceConfirmed: status === 'APPROVED' && Boolean(checkbox?.checked),
        reviewNote: modal.querySelector('#topup-review-note')?.value?.trim() || ''
      });
      if (!result) {
        actionButton.disabled = false;
        return showToast(apiService.lastError?.error === 'INVALID_TRANSACTION_STATE'
          ? 'Esta recarga ya fue revisada por otro administrador.'
          : 'No fue posible actualizar la recarga.', 'error');
      }
      showToast(status === 'APPROVED'
        ? `Recarga aprobada. Nuevo saldo: ${formatMoney(result.balance)}.`
        : 'Recarga rechazada sin modificar el saldo.', 'success');
      close();
      await load();
    };

    if (approveButton) approveButton.onclick = () => review('APPROVED');
    const rejectButton = modal.querySelector('.topup-reject');
    if (rejectButton) rejectButton.onclick = () => review('REJECTED');
    document.body.appendChild(modal);
  };

  const draw = () => {
    const counts = {
      ALL: allTopups.length,
      PENDING: allTopups.filter(item => item.status === 'PENDING').length,
      APPROVED: allTopups.filter(item => item.status === 'APPROVED').length,
      REJECTED: allTopups.filter(item => item.status === 'REJECTED').length
    };
    const pendingAmount = allTopups.filter(item => item.status === 'PENDING').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const approvedAmount = allTopups.filter(item => item.status === 'APPROVED').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const visible = allTopups.filter(item => (filter === 'ALL' || item.status === filter) && (!query || [
      item.reference, item.user?.firstName, item.user?.lastName, item.user?.email, item.user?.phone
    ].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))));

    container.innerHTML = `<div class="wallet-topups-admin">
      <div class="ops-heading topup-heading"><div><span class="eyebrow"><i></i> CONCILIACIÓN DE PAGO MÓVIL</span><h1>Recargas de billetera</h1><p>Verifica la referencia bancaria antes de acreditar saldo al pasajero.</p></div><span class="topup-live-status">${icon('shield', 16)} Validación administrativa</span></div>
      <section class="topup-kpis">
        <article class="pending"><span>${icon('clock', 21)}</span><div><small>Pendientes</small><strong>${counts.PENDING}</strong><p>${formatMoney(pendingAmount)} por revisar</p></div></article>
        <article class="approved"><span>${icon('checkCircle', 21)}</span><div><small>Acreditadas</small><strong>${counts.APPROVED}</strong><p>${formatMoney(approvedAmount)} aprobados</p></div></article>
        <article class="total"><span>${icon('fileText', 21)}</span><div><small>Total solicitudes</small><strong>${counts.ALL}</strong><p>Historial persistido</p></div></article>
      </section>
      <section class="topup-queue-card">
        <header><div><h3>Solicitudes registradas</h3><p>Selecciona una recarga para comprobar sus datos.</p></div><form id="topup-search"><span>${icon('search', 16)}</span><input value="${escapeHtml(query)}" placeholder="Buscar referencia o pasajero"><button>Buscar</button></form></header>
        <nav class="topup-filters">${[['PENDING','Pendientes'],['APPROVED','Acreditadas'],['REJECTED','Rechazadas'],['ALL','Todas']].map(([id,label]) => `<button class="${filter === id ? 'active' : ''}" data-topup-filter="${id}">${label}<b>${counts[id]}</b></button>`).join('')}</nav>
        <div class="topup-list">${visible.map(item => `<article class="topup-row ${String(item.status).toLowerCase()}">
          <span class="topup-row-icon">${icon(item.status === 'APPROVED' ? 'check' : item.status === 'REJECTED' ? 'close' : 'smartphone', 19)}</span>
          <div class="topup-person"><strong>${escapeHtml(`${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim() || 'Pasajero')}</strong><small>${escapeHtml(item.user?.phone || item.user?.email || item.userId)}</small></div>
          <div class="topup-reference"><small>REFERENCIA</small><strong>${escapeHtml(item.reference || '—')}</strong></div>
          <div class="topup-date"><small>REGISTRADA</small><span>${new Date(item.createdAt).toLocaleString('es-VE')}</span></div>
          <strong class="topup-row-amount">${formatMoney(item.amount)}</strong>
          <span class="topup-status ${String(item.status).toLowerCase()}">${statusLabel(item.status)}</span>
          <button type="button" class="topup-review-button" data-review-topup="${item.id}">${icon('eye', 16)} ${item.status === 'PENDING' ? 'Verificar' : 'Ver detalle'}</button>
        </article>`).join('') || `<div class="topup-empty">${icon('wallet', 36)}<strong>No hay recargas en esta categoría</strong><p>Las nuevas solicitudes aparecerán aquí en tiempo real.</p></div>`}</div>
      </section>
    </div>`;

    container.querySelectorAll('[data-topup-filter]').forEach(button => button.onclick = () => { filter = button.dataset.topupFilter; draw(); });
    container.querySelector('#topup-search').onsubmit = event => { event.preventDefault(); query = event.currentTarget.querySelector('input').value.trim(); draw(); };
    container.querySelectorAll('[data-review-topup]').forEach(button => button.onclick = () => openReview(allTopups.find(item => item.id === button.dataset.reviewTopup)));
  };

  await load();
}
