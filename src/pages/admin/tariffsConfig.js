import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

export async function renderTariffsConfig(container) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Cargando tarifas vigentes…</div>';
    const config = await apiService.get('/pricing/config');
    if (!config) return container.innerHTML = '<div class="diorama-card-3d" style="padding:30px;color:var(--danger)">No se pudo consultar la configuración del servidor.</div>';
    const moto = config.vehicleTypes?.MOTO || {};
    const car = config.vehicleTypes?.CAR || {};
    const field = (id, label, value, step = '0.01') => `<label style="display:grid;gap:6px;color:var(--text-secondary);font-size:.85rem">${label}<input id="${id}" type="number" min="0" step="${step}" value="${Number(value || 0)}" required style="padding:12px;border-radius:12px;border:1px solid var(--border-color);background:var(--surface-input);color:var(--text-primary)"></label>`;
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:20px"><div><h2 style="margin:0">Tarifas operativas</h2><small style="color:var(--text-secondary)">Estos valores alimentan las cotizaciones reales de cliente, conductor y administración.</small></div><span class="badge badge-warning">BCV: Bs. ${Number(config.bcvRate || 0).toFixed(2)}</span></div>
      <form id="pricing-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px">
        <section class="diorama-card-3d" style="padding:22px;border-radius:22px;background:var(--surface-card)"><h3 class="pricing-vehicle-heading">${vehicleImage('MOTO', { decorative: true })}<span>Mototaxi</span></h3><div style="display:grid;gap:13px">${field('m-base','Tarifa base USD',moto.baseFareUSD)}${field('m-km','Precio por km',moto.pricePerKmUSD)}${field('m-min','Precio por minuto',moto.pricePerMinuteUSD)}${field('m-minimum','Tarifa mínima',moto.minimumFareUSD)}</div></section>
        <section class="diorama-card-3d" style="padding:22px;border-radius:22px;background:var(--surface-card)"><h3 class="pricing-vehicle-heading">${vehicleImage('CAR', { decorative: true })}<span>Automóvil</span></h3><div style="display:grid;gap:13px">${field('c-base','Tarifa base USD',car.baseFareUSD)}${field('c-km','Precio por km',car.pricePerKmUSD)}${field('c-min','Precio por minuto',car.pricePerMinuteUSD)}${field('c-minimum','Tarifa mínima',car.minimumFareUSD)}</div></section>
        <section class="diorama-card-3d" style="padding:22px;border-radius:22px;background:var(--surface-card)"><h3>Parámetros generales</h3><div style="display:grid;gap:13px">${field('night','Multiplicador nocturno',config.nightMultiplier)}${field('peak','Multiplicador hora pico',config.peakMultiplier)}${field('commission','Comisión de plataforma (%)',Number(config.commissionRate || .15)*100,'1')}${field('bcv','Tasa BCV Bs./USD',config.bcvRate)}${field('parallel','Tasa alternativa Bs./USD',config.parallelRate)}</div><button class="btn btn-3d primary-btn" style="width:100%;margin-top:18px;padding:14px" type="submit">Guardar y aplicar</button></section>
      </form>`;
    // SAFE-2B: tarifas del PLAN de Transporte Seguro (fijas por carrera +
    // comisión propia del plan), con su formulario y guardado independientes.
    const st = await apiService.get('/admin/safe-transport/pricing');
    if (st?.perRide) {
      const seccion = document.createElement('section');
      seccion.className = 'diorama-card-3d';
      seccion.style.cssText = 'padding:22px;border-radius:22px;background:var(--surface-card);margin-top:18px';
      seccion.innerHTML = `
        <h3 style="display:flex;align-items:center;gap:8px;margin-top:0">Transporte Seguro — plan quincenal</h3>
        <small style="color:var(--text-secondary);display:block;margin-bottom:14px">
          Tarifa FIJA por carrera del plan (se descuenta de la wallet de la clienta al completarse;
          el conductor recibe el resto tras la comisión del plan). Rige en caliente para las próximas carreras.
        </small>
        <form id="st-pricing-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:13px">
          ${field('st-moto', 'Carrera en MOTO (USD)', st.perRide.MOTO)}
          ${field('st-car', 'Carrera en AUTO (USD)', st.perRide.CAR)}
          ${field('st-fee', 'Comisión del plan (%)', Number(st.platformFeeRate || 0.2) * 100, '1')}
          <button class="btn btn-3d primary-btn" style="padding:14px;align-self:end" type="submit">Guardar plan</button>
        </form>`;
      container.querySelector('#pricing-form')?.after(seccion);
      seccion.querySelector('#st-pricing-form').addEventListener('submit', async event => {
        event.preventDefault();
        const n = id => Number(seccion.querySelector(`#${id}`).value);
        const guardado = await apiService.patch('/admin/safe-transport/pricing', {
          perRide: { MOTO: n('st-moto'), CAR: n('st-car') },
          platformFeeRate: n('st-fee') / 100
        });
        showToast(guardado
          ? 'Tarifas del Transporte Seguro guardadas y activas'
          : 'No se pudieron guardar las tarifas del plan (revisa los valores)', guardado ? 'success' : 'error');
      });
    }

    container.querySelector('#pricing-form').addEventListener('submit', async event => {
      event.preventDefault();
      const n = id => Number(container.querySelector(`#${id}`).value);
      const saved = await apiService.patch('/admin/pricing', { vehicleTypes: { MOTO: { baseFareUSD:n('m-base'),pricePerKmUSD:n('m-km'),pricePerMinuteUSD:n('m-min'),minimumFareUSD:n('m-minimum') }, CAR: { baseFareUSD:n('c-base'),pricePerKmUSD:n('c-km'),pricePerMinuteUSD:n('c-min'),minimumFareUSD:n('c-minimum') } }, nightMultiplier:n('night'),peakMultiplier:n('peak'),commissionRate:n('commission')/100,bcvRate:n('bcv'),parallelRate:n('parallel') });
      showToast(saved ? 'Tarifas guardadas y activas en toda la plataforma' : 'No se pudieron guardar las tarifas', saved ? 'success' : 'error');
    });
}
