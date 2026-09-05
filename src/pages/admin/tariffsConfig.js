import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { vehicleImage } from '../../utils/vehicleMedia.js';

export async function renderTariffsConfig(container) {
    container.innerHTML = '<div class="admin-loading">Cargando tarifas vigentes…</div>';
    const config = await apiService.get('/pricing/config');
    if (!config) return container.innerHTML = '<div class="admin-empty">No se pudo consultar la configuración del servidor.</div>';
    const moto = config.vehicleTypes?.MOTO || {};
    const car = config.vehicleTypes?.CAR || {};
    const field = (id, label, value, step = '0.01') => `<label class="tariff-field">${label}<input id="${id}" type="number" min="0" step="${step}" value="${Number(value || 0)}" required></label>`;
    container.innerHTML = `
      <div class="tariffs-command-view">
        <header class="tariffs-heading"><div><span class="eyebrow"><i></i> CONFIGURACIÓN COMERCIAL</span><h1>Tarifas operativas</h1><p>Valores reales para las cotizaciones de pasajeros, conductores y administración.</p></div><span class="tariffs-bcv">BCV <strong>Bs. ${Number(config.bcvRate || 0).toFixed(2)}</strong></span></header>
        <form id="pricing-form" class="tariffs-grid">
          <section class="tariff-card"><h3 class="pricing-vehicle-heading">${vehicleImage('MOTO', { decorative: true })}<span>Mototaxi</span></h3><div class="tariff-fields">${field('m-base','Tarifa base USD',moto.baseFareUSD)}${field('m-km','Precio por km',moto.pricePerKmUSD)}${field('m-min','Precio por minuto',moto.pricePerMinuteUSD)}${field('m-minimum','Tarifa mínima',moto.minimumFareUSD)}</div></section>
          <section class="tariff-card"><h3 class="pricing-vehicle-heading">${vehicleImage('CAR', { decorative: true })}<span>Automóvil</span></h3><div class="tariff-fields">${field('c-base','Tarifa base USD',car.baseFareUSD)}${field('c-km','Precio por km',car.pricePerKmUSD)}${field('c-min','Precio por minuto',car.pricePerMinuteUSD)}${field('c-minimum','Tarifa mínima',car.minimumFareUSD)}</div></section>
          <section class="tariff-card tariff-general"><h3>Parámetros generales</h3><div class="tariff-fields">${field('night','Multiplicador nocturno',config.nightMultiplier)}${field('peak','Multiplicador hora pico',config.peakMultiplier)}${field('commission','Comisión de plataforma (%)',Number(config.commissionRate || .15)*100,'1')}${field('bcv','Tasa BCV Bs./USD',config.bcvRate)}${field('parallel','Tasa alternativa Bs./USD',config.parallelRate)}</div><button class="tariff-save" type="submit">Guardar y aplicar</button></section>
        </form>
      </div>`;
    // SAFE-2B: tarifas del PLAN de Transporte Seguro (fijas por carrera +
    // comisión propia del plan), con su formulario y guardado independientes.
    const st = await apiService.get('/admin/safe-transport/pricing');
    if (st?.perRide) {
      const seccion = document.createElement('section');
      seccion.className = 'tariff-safe-card';
      seccion.innerHTML = `
        <header><h3>Transporte Seguro — plan quincenal</h3><small>
          Tarifa FIJA por carrera del plan (se descuenta de la wallet de la clienta al completarse;
          el conductor recibe el resto tras la comisión del plan). Rige en caliente para las próximas carreras.
        </small></header>
        <form id="st-pricing-form" class="tariff-safe-form">
          ${field('st-moto', 'Carrera en MOTO (USD)', st.perRide.MOTO)}
          ${field('st-car', 'Carrera en AUTO (USD)', st.perRide.CAR)}
          ${field('st-fee', 'Comisión del plan (%)', Number(st.platformFeeRate || 0.2) * 100, '1')}
          <button class="tariff-save" type="submit">Guardar plan</button>
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
