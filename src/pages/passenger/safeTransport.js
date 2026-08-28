import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';
import { apiService } from '../../services/apiService.js';
import { createDestinationSearch } from '../../services/destinationSearch.js';
import { getPlacesProvider } from '../../services/placesService.js';
import { safeCoordinate } from '../../utils/safeDom.js';
import { localAvatarHtml } from '../../utils/localAvatar.js';
import { createPrivatePhotoLoader } from '../../utils/privatePhoto.js';
import {
  crearSuscripcion,
  listarSuscripciones,
  editarSuscripcion,
  pausarSuscripcion,
  reanudarSuscripcion,
  cancelarSuscripcion,
  listarTrasladosProgramados,
  obtenerPreciosDelPlan,
  estadoDeCoberturaEnHumano,
  mensajeDeError,
  ESTADOS_SUSCRIPCION,
  DIAS_SEMANA
} from '../../services/safeTransportService.js';

/**
 * Transporte Seguro del PASAJERO — SAFE-TRANSPORT-1F.
 *
 * Página superpuesta (overlay) dentro de la experiencia existente. Lenguaje
 * HONESTO en todo: el conductor preferido es una SOLICITUD que él debe
 * aceptar; sin «garantizado», sin créditos, sin renovaciones — nada que el
 * producto no ofrezca hoy. Cuando una ocurrencia se vuelve viaje real, se
 * REUSA la pantalla de viaje activo de siempre: aquí no existe una segunda
 * tarjeta de viaje. Estado transitorio en memoria: nada en localStorage.
 */

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[c]));

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const fechaHumana = ride => {
  const fecha = new Date(`${ride.localDate}T12:00:00`);
  return Number.isNaN(fecha.getTime())
    ? ride.localDate
    : fecha.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' });
};

export function renderSafeTransport(container, { onClose, onOpenWallet } = {}) {
  let vista = 'cargando';
  let suscripcion = null;
  let traslados = [];
  let conductoresPrevios = [];
  let preciosPlan = null; // tarifas por carrera (2A), si la facturacion esta activa
  let enviando = false;
  let confirmandoCancelacion = false;
  let editando = false;

  // Dueño único de las fotografías privadas de esta pantalla.
  const fotos = createPrivatePhotoLoader({ loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint) });
  const observarCierre = new MutationObserver(() => {
    if (!document.body.contains(container)) { fotos.destroy?.(); observarCierre.disconnect(); }
  });
  observarCierre.observe(document.body, { childList: true, subtree: true });

  const borrador = {
    home: null,
    worksite: null,
    weekdays: [1, 2, 3, 4, 5],
    ida: '07:00',
    regreso: '17:00',
    incluirRegreso: true,
    vehiculo: 'MOTO',
    preferido: null,
    inicio: ''
  };

  // --- Búsqueda canónica de lugares (la MISMA arquitectura de la app) -----

  async function buscarNominatim(query) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Maracaibo, Zulia, Venezuela')}&limit=5`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter(item =>
      safeCoordinate(item?.lat, 'lat') !== null
      && safeCoordinate(item?.lon, 'lng') !== null
      && String(item?.display_name ?? '').trim());
  }

  const buscador = createDestinationSearch({
    placesProvider: getPlacesProvider(),
    nominatimSearch: buscarNominatim
  });

  const lugarComoRuta = canonica => canonica ? {
    lat: canonica.lat,
    lng: canonica.lng,
    address: canonica.formattedAddress || canonica.displayName
  } : null;

  // --- Carga --------------------------------------------------------------

  async function cargar() {
    obtenerPreciosDelPlan().then(p => { preciosPlan = p; }).catch(() => {});
    const respuesta = await listarSuscripciones();
    if (!respuesta) {
      vista = apiService.lastError?.status === 404 ? 'no-disponible'
        : apiService.lastError?.status === 0 ? 'sin-conexion' : 'no-disponible';
      return pintar();
    }
    const lista = Array.isArray(respuesta.subscriptions) ? respuesta.subscriptions : [];
    suscripcion = lista.find(s => s.status !== 'CANCELLED') ?? null;
    if (suscripcion) {
      const agenda = await listarTrasladosProgramados();
      traslados = Array.isArray(agenda?.scheduledRides) ? agenda.scheduledRides : [];
      vista = 'plan';
    } else {
      vista = 'landing';
    }
    pintar();
  }

  async function cargarConductoresPrevios() {
    const historial = await apiService.get('/trips/me/history');
    const vistos = new Map();
    for (const viaje of Array.isArray(historial) ? historial : []) {
      const conductor = viaje?.driver;
      if (viaje?.status === 'COMPLETED' && conductor?.id && !vistos.has(conductor.id)) {
        vistos.set(conductor.id, {
          id: conductor.id,
          nombre: `${conductor.firstName || 'Conductor'} ${conductor.lastName || ''}`.trim()
        });
      }
    }
    conductoresPrevios = [...vistos.values()].slice(0, 8);
  }

  // --- Vistas -------------------------------------------------------------

  const cabecera = subtitulo => `
    <header class="st-heading">
      <button type="button" class="st-back" data-volver aria-label="Volver">${icon('back', 20)}</button>
      <div>
        <small>${icon('shield', 14)} TRANSPORTE SEGURO</small>
        <h2>Traslados programados</h2>
        <p>${escapeHtml(subtitulo)}</p>
      </div>
    </header>`;

  const vistaCargando = () => `
    ${cabecera('Cargando tu información…')}
    <div class="st-loading" role="status" aria-live="polite"><span></span><strong>Cargando…</strong></div>`;

  const vistaNoDisponible = (sinConexion = false) => `
    ${cabecera(sinConexion ? 'Sin conexión' : 'Muy pronto')}
    <div class="st-empty">
      <span>${icon(sinConexion ? 'alertCircle' : 'clock', 40)}</span>
      <h3>${sinConexion ? 'Sin conexión' : 'Esta función no está disponible por ahora'}</h3>
      <p>${sinConexion
        ? 'Revisa tu internet e intenta de nuevo. Crear o editar tu plan requiere conexión.'
        : 'Estamos preparando los traslados programados. Vuelve a intentarlo más adelante.'}</p>
      ${sinConexion ? `<button type="button" class="st-primary" data-reintentar>${icon('history', 16)} Reintentar</button>` : ''}
    </div>`;

  const vistaLanding = () => `
    ${cabecera('Programa tus traslados de ida y vuelta')}
    <section class="st-hero">
      <span class="st-hero-icon">${icon('calendar', 24)}</span>
      <h3>Tu ruta al trabajo, resuelta</h3>
      <p>Configura una vez tus traslados casa y trabajo y nosotros buscamos
      cobertura para cada día.</p>
    </section>
    <ul class="st-benefits">
      <li>${icon('clock', 20)} <div><strong>Recogida programada</strong><small>A la hora que eliges, cada día que eliges.</small></div></li>
      <li>${icon('user', 20)} <div><strong>Conductor preferido</strong><small>Puedes solicitar a un conductor conocido. Él debe aceptar cada traslado.</small></div></li>
      <li>${icon('users', 20)} <div><strong>Cobertura de respaldo</strong><small>Si tu preferido no puede, buscamos otro conductor verificado.</small></div></li>
      <li>${icon('bell', 20)} <div><strong>Estado siempre visible</strong><small>Sabrás con honestidad cómo va la cobertura de cada traslado.</small></div></li>
    </ul>
    <button type="button" class="st-primary" data-crear>${icon('plus', 20)} Crear mi plan de traslados</button>
    <p class="st-fineprint">Cada viaje se paga como un viaje normal. El plan organiza tus traslados; no es una suscripción prepagada.</p>`;

  const selectorLugar = (clave, etiqueta, valor) => `
    <div class="st-field">
      <label for="st-lugar-${clave}">${etiqueta}</label>
      ${valor
        ? `<div class="st-place-chip">
            <span>${icon('mapPin', 16)}</span>
            <strong>${escapeHtml(valor.displayName)}</strong>
            <button type="button" data-cambiar-lugar="${clave}" aria-label="Cambiar ${escapeHtml(etiqueta)}">${icon('edit', 14)}</button>
          </div>`
        : `<div class="st-place-search">
            <input type="text" id="st-lugar-${clave}" data-buscar-lugar="${clave}" placeholder="Busca una dirección o lugar" autocomplete="off">
            <ul class="st-place-results" data-resultados="${clave}" role="listbox" aria-label="Resultados para ${escapeHtml(etiqueta)}"></ul>
          </div>`}
    </div>`;

  const vistaCrear = () => `
    ${cabecera(editando ? 'Ajusta tu horario' : 'Configura tu plan')}
    <form class="st-form" novalidate>
      ${editando ? '' : `
        ${selectorLugar('home', 'Casa', borrador.home)}
        ${selectorLugar('worksite', 'Trabajo', borrador.worksite)}`}
      <div class="st-field">
        <span class="st-field-label" id="st-dias-label">Días de traslado</span>
        <div class="st-weekdays" role="group" aria-labelledby="st-dias-label">
          ${DIAS_SEMANA.map(dia => `
            <button type="button" data-dia="${dia.valor}" aria-label="${dia.nombre}"
              aria-pressed="${borrador.weekdays.includes(dia.valor)}"
              class="${borrador.weekdays.includes(dia.valor) ? 'active' : ''}">${dia.letra}</button>`).join('')}
        </div>
        <button type="button" class="st-quick" data-lv>Lunes a viernes</button>
      </div>
      <div class="st-times">
        <div class="st-field">
          <label for="st-hora-ida">Ida</label>
          <input type="time" id="st-hora-ida" value="${escapeHtml(borrador.ida)}" required>
        </div>
        <div class="st-field">
          <label for="st-hora-regreso">Regreso</label>
          <input type="time" id="st-hora-regreso" value="${escapeHtml(borrador.regreso)}" ${borrador.incluirRegreso ? '' : 'disabled'}>
          <label class="st-check"><input type="checkbox" id="st-incluir-regreso" ${borrador.incluirRegreso ? 'checked' : ''}> Incluir regreso</label>
        </div>
      </div>
      ${editando ? '' : `
      <div class="st-field">
        <span class="st-field-label" id="st-vehiculo-label">Vehículo</span>
        <div class="st-vehicle" role="group" aria-labelledby="st-vehiculo-label">
          <button type="button" data-vehiculo="MOTO" aria-pressed="${borrador.vehiculo === 'MOTO'}" class="${borrador.vehiculo === 'MOTO' ? 'active' : ''}">${icon('motorcycle', 20)} Moto</button>
          <button type="button" data-vehiculo="CAR" aria-pressed="${borrador.vehiculo === 'CAR'}" class="${borrador.vehiculo === 'CAR' ? 'active' : ''}">${icon('car', 20)} Auto</button>
        </div>
      </div>
      ${conductoresPrevios.length ? `
      <div class="st-field">
        <label for="st-preferido">Conductor preferido <em>(opcional)</em></label>
        <select id="st-preferido">
          <option value="">Sin preferencia</option>
          ${conductoresPrevios.map(c => `<option value="${escapeHtml(c.id)}" ${borrador.preferido === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
        </select>
        <small class="st-hint">Es una solicitud: el conductor debe aceptar cada traslado programado.</small>
      </div>` : ''}
      <div class="st-field">
        <label for="st-inicio">Empieza el</label>
        <input type="date" id="st-inicio" value="${escapeHtml(borrador.inicio)}">
        <small class="st-hint">Déjalo vacío para empezar hoy.</small>
      </div>`}
      <button type="submit" class="st-primary" ${enviando ? 'disabled' : ''}>
        ${enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Revisar mi plan'}
      </button>
    </form>`;

  const filaResumen = (etiqueta, valor) => `<div><small>${etiqueta}</small><strong>${valor}</strong></div>`;

  const vistaResumen = () => {
    const dias = DIAS_SEMANA.filter(d => borrador.weekdays.includes(d.valor)).map(d => d.nombre).join(', ');
    const preferido = conductoresPrevios.find(c => c.id === borrador.preferido);
    return `
    ${cabecera('Confirma tu plan')}
    <section class="st-summary">
      <div class="st-summary-route">
        <span class="st-dot casa"></span><strong>${escapeHtml(borrador.home?.displayName ?? '')}</strong>
        <i aria-hidden="true"></i>
        <span class="st-dot trabajo"></span><strong>${escapeHtml(borrador.worksite?.displayName ?? '')}</strong>
      </div>
      <div class="st-summary-grid">
        ${filaResumen('Días', escapeHtml(dias))}
        ${filaResumen('Ida', escapeHtml(borrador.ida))}
        ${borrador.incluirRegreso ? filaResumen('Regreso', escapeHtml(borrador.regreso)) : filaResumen('Regreso', 'Solo ida')}
        ${filaResumen('Vehículo', borrador.vehiculo === 'CAR' ? 'Auto' : 'Moto')}
        ${preferido ? filaResumen('Conductor preferido', escapeHtml(preferido.nombre)) : ''}
        ${borrador.inicio ? filaResumen('Empieza', escapeHtml(borrador.inicio)) : ''}
      </div>
      ${preferido ? `<p class="st-hint">${icon('info', 14)} Tu conductor preferido debe aceptar cada traslado. Si no puede, buscaremos respaldo.</p>` : ''}
      ${resumenDePrecio()}
    </section>
    <button type="button" class="st-primary" data-confirmar ${enviando ? 'disabled' : ''}>${enviando ? 'Creando…' : 'Confirmar plan'}</button>
    <button type="button" class="st-secondary" data-editar-borrador>Volver a editar</button>`;
  };

  /** Precio honesto del plan (2A): tarifa por carrera y quincena ESTIMADA.
   *  Solo se cobra por carrera realizada, desde la Billetera Express. */
  const resumenDePrecio = () => {
    if (!preciosPlan) return '';
    const tarifa = Number(preciosPlan[borrador.vehiculo === 'CAR' ? 'CAR' : 'MOTO'] || 0);
    if (!tarifa) return '';
    const tramos = 1 + (borrador.incluirRegreso ? 1 : 0);
    const quincena = tarifa * borrador.weekdays.length * tramos * 2;
    return `
      <div class="st-summary-grid st-precio">
        ${filaResumen('Tarifa por carrera', `$${tarifa.toFixed(2)}`)}
        ${filaResumen('Quincena estimada', `$${quincena.toFixed(2)}`)}
      </div>
      <p class="st-hint">${icon('info', 14)} Se descuenta de tu Billetera Express solo por carrera realizada.
      Para activar el plan necesitas saldo para una quincena.</p>`;
  };

  const tarjetaConductor = conductor => {
    if (!conductor) return '';
    const nombre = `${conductor.firstName || 'Conductor'} ${conductor.lastName || ''}`.trim();
    return `
      <div class="st-driver">
        <span class="st-driver-avatar">${localAvatarHtml({ name: nombre, role: 'driver', label: nombre })}<img hidden data-foto-privada="${escapeHtml(conductor.photoUrl || '')}" alt="Foto de ${escapeHtml(nombre)}"></span>
        <div>
          <strong>${escapeHtml(nombre)}</strong>
          <small>${escapeHtml([conductor.vehicleBrand, conductor.vehicleModel].filter(Boolean).join(' ') || 'Vehículo verificado')} · ${escapeHtml(conductor.vehiclePlate || '')}</small>
          <small>${icon('starFilled', 14)} ${Number(conductor.rating || 0).toFixed(1)}</small>
        </div>
      </div>`;
  };

  const tarjetaTraslado = ride => {
    const estado = estadoDeCoberturaEnHumano(ride);
    const enCurso = ride.serviceStatus === 'ACTIVE' && ride.tripId;
    return `
      <article class="st-ride ${estado.tono === 'atencion' ? 'st-ride--atencion' : ''}">
        <header>
          <div>
            <strong>${escapeHtml(fechaHumana(ride))}</strong>
            <small>${escapeHtml(ride.localTime)} · ${ride.direction === 'OUTBOUND' ? 'Casa → Trabajo' : 'Trabajo → Casa'}</small>
          </div>
          <span class="st-pill st-pill--${estado.tono}" role="status">${icon(
            estado.tono === 'confirmado' ? 'checkCircle'
              : estado.tono === 'atencion' ? 'alertTriangle'
              : estado.tono === 'activo' ? 'navigation'
              : estado.tono === 'completado' ? 'check'
              : estado.tono === 'cancelado' ? 'close' : 'clock', 13)} ${escapeHtml(estado.texto)}</span>
        </header>
        ${estado.tono === 'atencion' ? `<p class="st-atencion-copy">Seguimos trabajando en la cobertura de este traslado. Te avisaremos.</p>` : ''}
        ${tarjetaConductor(ride.driver)}
        ${enCurso ? `<button type="button" class="st-primary st-ride-go" data-ver-viaje>${icon('navigation', 16)} Ver viaje en curso</button>` : ''}
      </article>`;
  };

  const vistaPlan = () => {
    const patron = suscripcion.pattern ?? {};
    const dias = DIAS_SEMANA.filter(d => (patron.weekdays ?? []).includes(d.valor));
    const estadoPlan = ESTADOS_SUSCRIPCION[suscripcion.status] ?? 'Activo';
    const pausado = suscripcion.status === 'PAUSED';
    const suspendido = suscripcion.status === 'SUSPENDED_PAYMENT';
    const proximos = traslados.filter(r => r.serviceStatus === 'PLANNED' || r.serviceStatus === 'ACTIVE');
    const historicos = traslados.filter(r => r.serviceStatus === 'COMPLETED');
    return `
    ${cabecera('Tu plan de traslados')}
    <section class="st-plan ${pausado ? 'st-plan--pausado' : ''}">
      <header>
        <span class="st-pill ${suspendido ? 'st-pill--atencion' : pausado ? 'st-pill--buscando' : 'st-pill--confirmado'}">${escapeHtml(estadoPlan)}</span>
      </header>
      ${suspendido ? `
      <p class="st-atencion-copy">${icon('alertTriangle', 14)} Tu plan está en pausa por saldo:
      tu Billetera Express no cubre la próxima carrera. Recarga y reanuda cuando quieras.</p>` : ''}
      <div class="st-summary-route">
        <span class="st-dot casa"></span><strong>${escapeHtml(suscripcion.route?.home?.address ?? 'Casa')}</strong>
        <i aria-hidden="true"></i>
        <span class="st-dot trabajo"></span><strong>${escapeHtml(suscripcion.route?.worksite?.address ?? 'Trabajo')}</strong>
      </div>
      <div class="st-summary-grid">
        ${filaResumen('Días', escapeHtml(dias.map(d => d.letra).join(' · ') || '—'))}
        ${patron.outbound?.time ? filaResumen('Ida', escapeHtml(patron.outbound.time)) : ''}
        ${patron.return?.time ? filaResumen('Regreso', escapeHtml(patron.return.time)) : ''}
      </div>
      <div class="st-plan-actions">
        <button type="button" class="st-secondary" data-editar>${icon('edit', 16)} Editar horario</button>
        ${suspendido ? `
          <button type="button" class="st-primary" data-recargar>${icon('wallet', 16)} Recargar wallet</button>
          <button type="button" class="st-secondary" data-reanudar>${icon('check', 16)} Reanudar plan</button>`
          : pausado
          ? `<button type="button" class="st-secondary" data-reanudar>${icon('check', 16)} Reanudar</button>`
          : `<button type="button" class="st-secondary" data-pausar>${icon('minus', 16)} Pausar</button>`}
        <button type="button" class="st-danger" data-cancelar aria-live="polite">
          ${confirmandoCancelacion ? '¿Seguro? Toca de nuevo para cancelar' : `${icon('close', 16)} Cancelar plan`}
        </button>
      </div>
    </section>
    <section class="st-rides">
      <h3>Próximos traslados</h3>
      ${proximos.length
        ? proximos.map(tarjetaTraslado).join('')
        : `<div class="st-empty st-empty--mini"><span>${icon('calendar', 24)}</span><p>${(pausado || suspendido)
            ? 'Tu plan está en pausa: no se programarán traslados hasta que lo reanudes.'
            : 'Tus próximos traslados aparecerán aquí a medida que se programen.'}</p></div>`}
      ${historicos.length ? `<h3>Recientes</h3>${historicos.slice(-3).reverse().map(tarjetaTraslado).join('')}` : ''}
    </section>`;
  };

  // --- Interacción --------------------------------------------------------

  function conectarSelectorLugar(clave) {
    const input = container.querySelector(`[data-buscar-lugar="${clave}"]`);
    const resultados = container.querySelector(`[data-resultados="${clave}"]`);
    if (!input || !resultados) return;
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const query = input.value.trim();
      if (query.length <= 2) { buscador.cancel(); resultados.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        let respuesta;
        try { respuesta = await buscador.search(query); } catch { return; }
        if (respuesta.stale) return;
        resultados.innerHTML = '';
        for (const candidato of respuesta.candidates) {
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          const pin = document.createElement('span');
          pin.innerHTML = icon('mapPin', 14);
          const titulo = document.createElement('strong');
          titulo.textContent = candidato.title; // texto del proveedor: JAMÁS innerHTML
          li.append(pin, titulo);
          if (candidato.subtitle) {
            const detalle = document.createElement('small');
            detalle.textContent = candidato.subtitle;
            li.appendChild(detalle);
          }
          li.addEventListener('click', async () => {
            let canonica = null;
            try { canonica = await candidato.resolve(); } catch { canonica = null; }
            if (!canonica) return showToast('No se pudo confirmar ese lugar. Elige otro.', 'error');
            borrador[clave] = canonica;
            pintar();
          });
          resultados.appendChild(li);
        }
      }, 450);
    });
  }

  async function confirmarCreacion() {
    if (enviando) return;
    enviando = true;
    pintar();
    const cuerpo = {
      route: { home: lugarComoRuta(borrador.home), worksite: lugarComoRuta(borrador.worksite) },
      pattern: {
        weekdays: borrador.weekdays,
        outbound: { time: borrador.ida },
        ...(borrador.incluirRegreso ? { return: { time: borrador.regreso } } : {})
      },
      vehiclePreference: borrador.vehiculo,
      ...(borrador.preferido ? { preferredDriverId: borrador.preferido } : {}),
      ...(borrador.inicio ? { effectiveFrom: borrador.inicio } : {})
    };
    const respuesta = await crearSuscripcion(cuerpo);
    enviando = false;
    if (!respuesta) {
      showToast(mensajeDeError('No se pudo crear el plan. Revisa los datos.'), 'error');
      vista = 'crear';
      return pintar();
    }
    showToast('Tu plan de traslados quedó creado.', 'success');
    await cargar();
  }

  function validarFormulario() {
    if (!editando && (!borrador.home || !borrador.worksite)) {
      showToast('Elige tu casa y tu trabajo para continuar.', 'error');
      return false;
    }
    if (!borrador.weekdays.length) {
      showToast('Elige al menos un día de la semana.', 'error');
      return false;
    }
    if (!HORA_RE.test(borrador.ida) || (borrador.incluirRegreso && !HORA_RE.test(borrador.regreso))) {
      showToast('Revisa las horas de ida y regreso.', 'error');
      return false;
    }
    return true;
  }

  function leerFormulario() {
    borrador.ida = container.querySelector('#st-hora-ida')?.value ?? borrador.ida;
    borrador.regreso = container.querySelector('#st-hora-regreso')?.value ?? borrador.regreso;
    borrador.inicio = container.querySelector('#st-inicio')?.value ?? borrador.inicio;
    borrador.preferido = container.querySelector('#st-preferido')?.value || null;
  }

  async function guardarEdicion() {
    if (enviando) return;
    enviando = true;
    pintar();
    const respuesta = await editarSuscripcion(suscripcion.id, {
      pattern: {
        weekdays: borrador.weekdays,
        outbound: { time: borrador.ida },
        return: borrador.incluirRegreso ? { time: borrador.regreso } : { time: null }
      }
    });
    enviando = false;
    if (!respuesta) {
      showToast(mensajeDeError('No se pudo guardar el horario.'), 'error');
      return pintar();
    }
    showToast('Horario actualizado.', 'success');
    editando = false;
    await cargar();
  }

  function pintar() {
    container.innerHTML = `<div class="st-page fade-in">
      ${vista === 'cargando' ? vistaCargando()
        : vista === 'no-disponible' ? vistaNoDisponible(false)
        : vista === 'sin-conexion' ? vistaNoDisponible(true)
        : vista === 'landing' ? vistaLanding()
        : vista === 'crear' ? vistaCrear()
        : vista === 'resumen' ? vistaResumen()
        : vistaPlan()}
    </div>`;

    container.querySelector('[data-volver]')?.addEventListener('click', () => {
      if (vista === 'crear' || vista === 'resumen') {
        vista = suscripcion ? 'plan' : 'landing';
        editando = false;
        pintar();
      } else if (typeof onClose === 'function') onClose();
    });
    container.querySelector('[data-reintentar]')?.addEventListener('click', () => { vista = 'cargando'; pintar(); cargar(); });
    container.querySelector('[data-crear]')?.addEventListener('click', async () => {
      await cargarConductoresPrevios();
      editando = false;
      vista = 'crear';
      pintar();
    });

    if (vista === 'crear') {
      conectarSelectorLugar('home');
      conectarSelectorLugar('worksite');
      container.querySelectorAll('[data-cambiar-lugar]').forEach(btn => btn.addEventListener('click', () => {
        leerFormulario();
        borrador[btn.dataset.cambiarLugar] = null;
        pintar();
      }));
      container.querySelectorAll('[data-dia]').forEach(btn => btn.addEventListener('click', () => {
        leerFormulario();
        const dia = Number(btn.dataset.dia);
        borrador.weekdays = borrador.weekdays.includes(dia)
          ? borrador.weekdays.filter(d => d !== dia)
          : [...borrador.weekdays, dia].sort((a, b) => a - b);
        pintar();
      }));
      container.querySelector('[data-lv]')?.addEventListener('click', () => {
        leerFormulario();
        borrador.weekdays = [1, 2, 3, 4, 5];
        pintar();
      });
      container.querySelectorAll('[data-vehiculo]').forEach(btn => btn.addEventListener('click', () => {
        leerFormulario();
        borrador.vehiculo = btn.dataset.vehiculo;
        pintar();
      }));
      container.querySelector('#st-incluir-regreso')?.addEventListener('change', event => {
        leerFormulario();
        borrador.incluirRegreso = event.target.checked;
        pintar();
      });
      container.querySelector('.st-form')?.addEventListener('submit', event => {
        event.preventDefault();
        leerFormulario();
        if (!validarFormulario()) return;
        if (editando) return guardarEdicion();
        vista = 'resumen';
        pintar();
      });
    }

    if (vista === 'resumen') {
      container.querySelector('[data-confirmar]')?.addEventListener('click', confirmarCreacion);
      container.querySelector('[data-editar-borrador]')?.addEventListener('click', () => { vista = 'crear'; pintar(); });
    }

    if (vista === 'plan') {
      container.querySelector('[data-editar]')?.addEventListener('click', () => {
        const patron = suscripcion.pattern ?? {};
        borrador.weekdays = [...(patron.weekdays ?? [1, 2, 3, 4, 5])];
        borrador.ida = patron.outbound?.time ?? '07:00';
        borrador.incluirRegreso = Boolean(patron.return?.time);
        borrador.regreso = patron.return?.time ?? '17:00';
        editando = true;
        vista = 'crear';
        pintar();
      });
      const accion = (selector, ejecutar, exito) => {
        container.querySelector(selector)?.addEventListener('click', async event => {
          const boton = event.currentTarget;
          boton.disabled = true;
          const respuesta = await ejecutar(suscripcion.id);
          if (!respuesta) {
            boton.disabled = false;
            return showToast(mensajeDeError(), 'error');
          }
          showToast(exito, 'success');
          confirmandoCancelacion = false;
          await cargar();
        });
      };
      container.querySelector('[data-recargar]')?.addEventListener('click', () => {
        if (typeof onOpenWallet === 'function') onOpenWallet();
      });
      accion('[data-pausar]', pausarSuscripcion, 'Plan en pausa. Reanúdalo cuando quieras.');
      accion('[data-reanudar]', reanudarSuscripcion, 'Plan reanudado.');
      container.querySelector('[data-cancelar]')?.addEventListener('click', async event => {
        if (!confirmandoCancelacion) {
          confirmandoCancelacion = true;
          return pintar();
        }
        const boton = event.currentTarget;
        boton.disabled = true;
        const respuesta = await cancelarSuscripcion(suscripcion.id);
        if (!respuesta) {
          boton.disabled = false;
          confirmandoCancelacion = false;
          pintar();
          return showToast(mensajeDeError(), 'error');
        }
        showToast('Tu plan fue cancelado.', 'success');
        confirmandoCancelacion = false;
        await cargar();
      });
      container.querySelectorAll('[data-ver-viaje]').forEach(btn => btn.addEventListener('click', () => {
        // El viaje activo VIVE en la pantalla normal de siempre: aquí no hay
        // una segunda tarjeta de viaje.
        if (typeof onClose === 'function') onClose();
      }));
      // Fotografías privadas de conductores confirmados, con sesión.
      container.querySelectorAll('img[data-foto-privada]').forEach(img => {
        const ruta = img.dataset.fotoPrivada;
        if (ruta) fotos.applyTo(img, ruta, { key: ruta });
      });
    }
  }

  pintar();
  cargar();
}
