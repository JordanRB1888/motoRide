import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';
import {
  leerPreferenciasConductor,
  guardarPreferenciasConductor,
  listarOfertasConductor,
  listarCompromisosConductor,
  aceptarTraslado,
  rechazarTraslado,
  retirarseDeTraslado,
  mensajeDeError
} from '../../services/safeTransportService.js';

/**
 * Traslados programados del CONDUCTOR — SAFE-TRANSPORT-1F.
 *
 * Participar es VOLUNTARIO: nada llega sin encender el opt-in, y cada
 * compromiso nace de un «Aceptar» explícito. La oferta pinta SOLO lo que el
 * backend ya sanó (fecha, hora, dirección del trayecto y zona aproximada):
 * esta pantalla jamás reconstruye direcciones exactas ni datos del pasajero
 * desde otra llamada. Nada se confirma en pantalla hasta el ACK del servidor.
 */

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[c]));

const fechaHumana = valor => {
  const fecha = new Date(`${valor}T12:00:00`);
  return Number.isNaN(fecha.getTime())
    ? String(valor ?? '')
    : fecha.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' });
};

const venceEn = expiresAt => {
  const restante = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(restante) || restante <= 0) return 'Vencida';
  const minutos = Math.round(restante / 60000);
  return minutos >= 90 ? `Vence ${new Date(expiresAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}` : `Vence en ${minutos} min`;
};

export function renderSafeTransportDriver() {
  const container = document.createElement('div');
  container.className = 'st-page st-driver-page fade-in';

  let cargando = true;
  let noDisponible = false;
  let preferencias = { acceptsScheduledRides: false };
  let ofertas = [];
  let compromisos = [];
  let retirandoDe = null; // compromiso con confirmación de retiro pendiente

  async function cargar() {
    const prefs = await leerPreferenciasConductor();
    if (!prefs) {
      noDisponible = true;
      cargando = false;
      return pintar();
    }
    preferencias = prefs.preferences ?? { acceptsScheduledRides: false };
    const [respuestaOfertas, respuestaCompromisos] = await Promise.all([
      listarOfertasConductor(),
      listarCompromisosConductor()
    ]);
    ofertas = Array.isArray(respuestaOfertas?.offers) ? respuestaOfertas.offers : [];
    compromisos = Array.isArray(respuestaCompromisos?.commitments) ? respuestaCompromisos.commitments : [];
    cargando = false;
    pintar();
  }

  const tarjetaOferta = oferta => `
    <article class="st-ride">
      <header>
        <div>
          <strong>${escapeHtml(fechaHumana(oferta.localDate))}</strong>
          <small>${escapeHtml(oferta.localTime)} · ${oferta.direction === 'OUTBOUND' ? 'Ida al trabajo' : 'Regreso a casa'}</small>
        </div>
        <span class="st-pill st-pill--buscando">${icon('clock', 14)} ${escapeHtml(venceEn(oferta.expiresAt))}</span>
      </header>
      <div class="st-offer-zones">
        <small>${icon('mapPin', 14)} Zona de recogida aprox.: ${oferta.pickupZone ? `${oferta.pickupZone.approxLat}, ${oferta.pickupZone.approxLng}` : 'por confirmar'}</small>
        <small>${icon('navigation', 14)} Zona de destino aprox.: ${oferta.destinationZone ? `${oferta.destinationZone.approxLat}, ${oferta.destinationZone.approxLng}` : 'por confirmar'}</small>
        ${oferta.vehiclePreference ? `<small>${icon(oferta.vehiclePreference === 'CAR' ? 'car' : 'motorcycle', 14)} Requiere ${oferta.vehiclePreference === 'CAR' ? 'auto' : 'moto'}</small>` : ''}
      </div>
      <p class="st-hint">La dirección exacta se muestra al aceptar el traslado.</p>
      <div class="st-offer-actions">
        <button type="button" class="st-primary" data-aceptar="${escapeHtml(oferta.rideId)}">${icon('check', 16)} Aceptar</button>
        <button type="button" class="st-secondary" data-rechazar="${escapeHtml(oferta.rideId)}">Rechazar</button>
      </div>
    </article>`;

  const tarjetaCompromiso = compromiso => `
    <article class="st-ride st-ride--compromiso">
      <header>
        <div>
          <strong>${escapeHtml(fechaHumana(compromiso.localDate))}</strong>
          <small>${escapeHtml(compromiso.localTime)} · ${compromiso.direction === 'OUTBOUND' ? 'Ida al trabajo' : 'Regreso a casa'}</small>
        </div>
        <span class="st-pill st-pill--confirmado">${icon('checkCircle', 14)} Comprometido</span>
      </header>
      <div class="st-commit-route">
        <small>RECOGIDA</small><strong>${escapeHtml(compromiso.pickup?.address ?? '')}</strong>
        <small>DESTINO</small><strong>${escapeHtml(compromiso.destination?.address ?? '')}</strong>
      </div>
      <button type="button" class="st-danger" data-retirar="${escapeHtml(compromiso.rideId)}" aria-live="polite">
        ${retirandoDe === compromiso.rideId
          ? '¿Seguro? El pasajero necesitará respaldo. Toca de nuevo.'
          : 'No podré cubrir este traslado'}
      </button>
    </article>`;

  function pintar() {
    container.innerHTML = `
      <header class="st-heading">
        <div>
          <small>${icon('shield', 14)} TRANSPORTE SEGURO</small>
          <h2>Traslados programados</h2>
          <p>Compromisos con horario fijo, aceptados por ti.</p>
        </div>
      </header>
      ${cargando ? `<div class="st-loading" role="status" aria-live="polite"><span></span><strong>Cargando…</strong></div>`
        : noDisponible ? `
        <div class="st-empty">
          <span>${icon('clock', 43)}</span>
          <h3>Esta función no está disponible por ahora</h3>
          <p>Estamos preparando los traslados programados para conductores.</p>
        </div>`
        : `
      <section class="st-optin">
        <div>
          <strong id="st-optin-label">Recibir traslados programados</strong>
          <small>Participar es voluntario. Al apagarlo dejas de recibir ofertas
          NUEVAS; los traslados que ya aceptaste siguen en pie hasta que te
          retires de cada uno.</small>
        </div>
        <button type="button" id="st-optin-toggle" role="switch"
          aria-checked="${preferencias.acceptsScheduledRides}" aria-labelledby="st-optin-label"
          class="st-switch ${preferencias.acceptsScheduledRides ? 'on' : ''}"><i></i></button>
      </section>
      <section class="st-rides">
        <h3>Ofertas pendientes</h3>
        ${ofertas.length ? ofertas.map(tarjetaOferta).join('')
          : `<div class="st-empty st-empty--mini"><span>${icon('bell', 24)}</span><p>${preferencias.acceptsScheduledRides
              ? 'Cuando un pasajero necesite un traslado compatible contigo, la oferta aparecerá aquí.'
              : 'Activa el interruptor para empezar a recibir ofertas de traslados programados.'}</p></div>`}
        <h3>Tus compromisos</h3>
        ${compromisos.length ? compromisos.map(tarjetaCompromiso).join('')
          : `<div class="st-empty st-empty--mini"><span>${icon('calendar', 24)}</span><p>Los traslados que aceptes aparecerán aquí con su ruta completa.</p></div>`}
      </section>`}
    `;

    container.querySelector('#st-optin-toggle')?.addEventListener('click', async event => {
      const boton = event.currentTarget;
      boton.disabled = true;
      const destino = !preferencias.acceptsScheduledRides;
      const respuesta = await guardarPreferenciasConductor({ acceptsScheduledRides: destino });
      if (!respuesta) {
        boton.disabled = false;
        return showToast(mensajeDeError('No se pudo guardar tu preferencia.'), 'error');
      }
      preferencias = respuesta.preferences;
      showToast(destino
        ? 'Listo: recibirás ofertas de traslados programados.'
        : 'No recibirás ofertas nuevas. Tus compromisos actuales siguen en pie.', 'success');
      pintar();
    });

    const accionDeOferta = (selector, ejecutar, exito) => {
      container.querySelectorAll(selector).forEach(boton => boton.addEventListener('click', async () => {
        // Bloqueo inmediato: un doble toque no dispara dos solicitudes, y
        // NADA se pinta como confirmado hasta el ACK del servidor.
        container.querySelectorAll('button').forEach(b => { b.disabled = true; });
        const rideId = boton.dataset.aceptar ?? boton.dataset.rechazar;
        const respuesta = await ejecutar(rideId);
        if (!respuesta) showToast(mensajeDeError(), 'error');
        else if (exito) showToast(exito, 'success');
        retirandoDe = null;
        cargando = true;
        pintar();
        await cargar();
      }));
    };
    accionDeOferta('[data-aceptar]', aceptarTraslado, 'Traslado aceptado. Ya está en tus compromisos.');
    accionDeOferta('[data-rechazar]', rechazarTraslado, null);

    container.querySelectorAll('[data-retirar]').forEach(boton => boton.addEventListener('click', async () => {
      const rideId = boton.dataset.retirar;
      if (retirandoDe !== rideId) {
        retirandoDe = rideId;
        return pintar();
      }
      container.querySelectorAll('button').forEach(b => { b.disabled = true; });
      const respuesta = await retirarseDeTraslado(rideId);
      if (!respuesta) showToast(mensajeDeError(), 'error');
      else showToast('Te retiraste del traslado. Buscaremos respaldo para el pasajero.', 'success');
      retirandoDe = null;
      cargando = true;
      pintar();
      await cargar();
    }));
  }

  pintar();
  cargar();
  return container;
}
