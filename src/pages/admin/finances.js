import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';

export async function renderFinances(container) {
  container.innerHTML = '<div class="admin-loading">Conciliando movimientos reales…</div>';
  let data = await apiService.get('/admin/finance');
  if (!data) return container.innerHTML = '<div class="admin-empty">No se pudo cargar el libro financiero.</div>';
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const reload = async () => { const next = await apiService.get('/admin/finance'); if (next) { data = next; draw(); } };
  const draw = () => {
    const requests = data.walletRequests || [];
    container.innerHTML = `<div class="finance-real-view">
      <div class="ops-heading"><div><span class="eyebrow"><i></i> CONTABILIDAD REAL</span><h1>Finanzas verificables</h1><p>Viajes, recargas y liquidaciones con estado persistente.</p></div><span class="ops-rate">BCV <strong>Bs. ${Number(data.bcvRate).toFixed(2)}</strong></span></div>
      <div class="kpi-grid"><div class="kpi-card green"><span class="kpi-label">Facturación</span><b class="kpi-value">${money(data.summary.gross)}</b></div><div class="kpi-card cyan"><span class="kpi-label">Comisión</span><b class="kpi-value">${money(data.summary.commission)}</b></div><div class="kpi-card yellow"><span class="kpi-label">Retiros pendientes</span><b class="kpi-value">${money(data.summary.pending)}</b></div><div class="kpi-card orange"><span class="kpi-label">Liquidado</span><b class="kpi-value">${money(data.summary.paid)}</b></div></div>
      <section class="ops-panel"><header><div><h3>Solicitudes de billetera</h3><p>Recargas y retiros sujetos a validación administrativa</p></div><span>${requests.filter(item => item.status === 'PENDING').length} pendientes</span></header><div class="ops-table-wrap"><table class="data-table"><thead><tr><th>Usuario</th><th>Tipo</th><th>Monto</th><th>Referencia</th><th>Fecha</th><th>Estado / acción</th></tr></thead><tbody>${requests.map(item => `<tr><td>${item.user ? `${item.user.firstName} ${item.user.lastName || ''}` : item.userId.slice(-8)}</td><td>${item.type === 'TOP_UP' ? 'Recarga' : item.type === 'PAYOUT' ? 'Liquidación' : 'Ganancia'}</td><td><strong>${money(item.amount)}</strong></td><td>${item.reference || '—'}</td><td>${new Date(item.createdAt).toLocaleString('es-VE')}</td><td>${item.status === 'PENDING' ? `<button class="finance-approve" data-transaction="${item.id}" data-status="APPROVED">Aprobar</button><button class="finance-reject" data-transaction="${item.id}" data-status="REJECTED">Rechazar</button>` : `<span class="application-status-badge ${item.status === 'APPROVED' ? 'approved' : 'rejected'}">${item.status}</span>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">No existen solicitudes.</td></tr>'}</tbody></table></div></section>
      <section class="ops-panel"><header><div><h3>Viajes completados</h3><p>El neto se acredita automáticamente a la billetera del conductor</p></div></header><div class="ops-table-wrap"><table class="data-table"><thead><tr><th>Viaje</th><th>Conductor</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Estado</th></tr></thead><tbody>${data.transactions.map(t => `<tr><td>#${t.id.slice(-7)}</td><td>${t.driver ? `${t.driver.firstName} ${t.driver.lastName || ''}` : 'Sin conductor'}</td><td>${money(t.gross)}</td><td>${money(t.commission)}</td><td>${money(t.driverNet)}</td><td><span class="application-status-badge approved">${t.payoutStatus}</span></td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">Aún no hay viajes completados.</td></tr>'}</tbody></table></div></section>
    </div>`;
    container.querySelectorAll('[data-transaction]').forEach(button => button.onclick = async () => {
      const result = await apiService.patch(`/admin/transactions/${button.dataset.transaction}`, { status: button.dataset.status });
      if (!result) return showToast('No se pudo conciliar la solicitud.', 'error');
      showToast('Movimiento conciliado.', 'success'); await reload();
    });
  };
  draw();
}
