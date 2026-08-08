import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';

export async function renderFinances(container) {
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Conciliando viajes completados…</div>';
  const data = await apiService.get('/admin/finance');
  if (!data) return container.innerHTML = '<div style="padding:30px;color:var(--danger)">No se pudo cargar el libro financiero.</div>';
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  const draw = () => {
    const pending = data.transactions.filter(t => t.payoutStatus === 'PENDING');
    container.innerHTML = `<div><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Finanzas verificables</h2><small style="color:var(--text-secondary)">Cada movimiento corresponde a un viaje completado.</small></div><span class="badge badge-warning">BCV Bs. ${Number(data.bcvRate).toFixed(2)}</span></div>
    <div class="kpi-grid" style="margin:22px 0"><div class="kpi-card green"><span class="kpi-label">Facturación</span><b class="kpi-value">${money(data.summary.gross)}</b></div><div class="kpi-card cyan"><span class="kpi-label">Comisión plataforma</span><b class="kpi-value">${money(data.summary.commission)}</b></div><div class="kpi-card yellow"><span class="kpi-label">Pendiente conductores</span><b class="kpi-value">${money(data.summary.pending)}</b></div><div class="kpi-card orange"><span class="kpi-label">Liquidado</span><b class="kpi-value">${money(data.summary.paid)}</b></div></div>
    <div class="data-table-container"><table class="data-table"><thead><tr><th>Viaje</th><th>Fecha</th><th>Conductor</th><th>Método</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Liquidación</th></tr></thead><tbody>${data.transactions.map(t=>`<tr><td>#${t.id.slice(-7)}</td><td>${t.date?new Date(t.date).toLocaleString('es-VE'):'—'}</td><td>${t.driver?`${t.driver.firstName} ${t.driver.lastName||''}`:'Sin conductor'}</td><td>${t.paymentMethod}</td><td>${money(t.gross)}</td><td>${money(t.commission)}</td><td>${money(t.driverNet)}</td><td>${t.payoutStatus==='PENDING'?`<button class="btn-pay" data-id="${t.id}" style="border:1px solid var(--accent-primary);color:var(--accent-primary);background:transparent;border-radius:10px;padding:7px 10px;cursor:pointer">Marcar pagado</button>`:`<span class="badge badge-success">${t.payoutStatus}</span>`}</td></tr>`).join('')||'<tr><td colspan="8" style="text-align:center">Aún no hay viajes completados.</td></tr>'}</tbody></table></div></div>`;
    container.querySelectorAll('.btn-pay').forEach(button => button.addEventListener('click', async () => {
      const reference = `ADM-${Date.now().toString().slice(-8)}`;
      const result = await apiService.patch(`/admin/trips/${button.dataset.id}/payout`, { status:'PAID', reference });
      if (!result) return showToast('No se pudo registrar la liquidación','error');
      const transaction = data.transactions.find(t=>t.id===button.dataset.id); transaction.payoutStatus='PAID'; data.summary.pending-=transaction.driverNet; data.summary.paid+=transaction.driverNet; draw(); showToast(`Liquidación registrada: ${reference}`,'success');
    }));
  };
  draw();
}
