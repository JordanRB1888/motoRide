import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios, ficherosDelLaboratorio } from './ayudas.mjs';
import {
  claveDeIntento,
  cuerpoParaCrear,
  huellaDelIntento,
  PAGO_DE_ESTA_FASE,
  estadoDelFallo,
  mensajeDelFallo,
  leerEstimacion,
  metricasDelRecorrido,
  puedeEstimar,
  puedePedir,
  queFaltaParaPedir,
  tipoParaElServidor,
  tipoParaLaPantalla,
  VELOCIDAD_URBANA_KMH
} from '../domain/pedirViaje.ts';
import { CENTRO_DE_MARACAIBO } from '../mapa/modelo.ts';

/**
 * PASSENGER-TRIP-1 — pedir una carrera de verdad.
 *
 * QUÉ SE PROTEGE
 *
 * Que el precio lo ponga el SERVIDOR. Ni una fórmula de tarifa en el teléfono,
 * y ninguna cifra en pantalla que el servidor no haya dicho: sin ETA inventado,
 * sin descuento, sin promoción. Enseñar un número que nadie va a cumplir es
 * peor que no enseñar nada.
 *
 * Que un toque nervioso no cree tres viajes. Cualquiera pulsa tres veces cuando
 * algo tarda, y cada viaje de más es un conductor movilizado para nada.
 *
 * Que estar fuera de Maracaibo no se confunda con un fallo del GPS ni con estar
 * sin red: son tres cosas distintas y se responden distinto.
 *
 * Que el viaje NO se dé por cancelado hasta que el servidor lo confirme.
 *
 * Y que «AUTO» —lo que dice la pantalla— llegue al servidor como `CAR`, que es
 * lo único que él entiende.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));
const servidor = () => fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');

const enElCentro = { lat: CENTRO_DE_MARACAIBO.lat, lng: CENTRO_DE_MARACAIBO.lng };
const punto = (extra = {}) => ({
  lat: enElCentro.lat, lng: enElCentro.lng,
  direccion: null, precision: null, fuente: 'gps',
  ...extra
});

// ---------------------------------------------------------------------------
// El contrato, leído del servidor
// ---------------------------------------------------------------------------

test('los dos endpoints existen y son los que se usan', () => {
  const codigo = servidor();
  assert.match(codigo, /app\.post\('\/api\/pricing\/estimate', requireAuth/);
  // Con `requireContactoVerificado` en medio: una cuenta registrada con un
  // correo inventado no puede pedir una carrera de verdad, que mueve a un
  // conductor de verdad.
  assert.match(codigo, /app\.post\('\/api\/trips\/create', requireAuth, requireContactoVerificado, requireRole\('passenger'\)/);

  const cliente = sinComentarios('services/pedido.ts');
  assert.match(cliente, /'\/api\/pricing\/estimate'/);
  assert.match(cliente, /'\/api\/trips\/create'/);
});

test('el servidor pide los PUNTOS y mide él: ya no acepta métricas', () => {
  // El contrato se invirtió en PASSENGER-TRIP-HARDENING-1. Antes el estimador
  // leía `distanceKm` del cuerpo y cobraba con eso; ahora lee los dos puntos.
  const codigo = servidor();
  const estimador = codigo.slice(codigo.indexOf("app.post('/api/pricing/estimate'")).slice(0, 700);

  assert.match(estimador, /normalizeLocation\(req\.body\.pickup/, 'toma el punto de recogida');
  assert.match(estimador, /normalizeLocation\(req\.body\.destination\)/, 'y el destino');
  assert.match(estimador, /medirRecorrido\(pickup, destination\)/, 'y mide él mismo');
  assert.match(estimador, /VALID_GPS_COORDINATES_REQUIRED/, 'sin los dos puntos no hay precio');

  // Y ya NO lee la distancia del cuerpo: ahí estaba la manipulación.
  assert.ok(
    !/Number\(req\.body\.distanceKm\)/.test(estimador),
    'el servidor volvió a leer la distancia que le manda el cliente'
  );
});

test('los tipos de vehículo son los que el servidor conoce', () => {
  const precios = fs.readFileSync(path.join(raizProyecto, 'server/domain/pricingService.js'), 'utf8');
  // `DEFAULT_PRICING.vehicleTypes` tiene exactamente estos dos.
  assert.match(precios, /MOTO: \{ baseFareUSD/);
  assert.match(precios, /CAR: \{ baseFareUSD/);
  // Y `calculateFare` colapsa cualquier otra cosa a MOTO, en silencio.
  assert.match(precios, /rideType === 'CAR' \? 'CAR' : 'MOTO'/);
});

// ---------------------------------------------------------------------------
// El vehículo: dos vocabularios
// ---------------------------------------------------------------------------

test('AUTO viaja como CAR', () => {
  // Mandar «AUTO» no falla ni avisa: `calculateFare` lo leería como MOTO y
  // cobraría tarifa de moto por un carro. El peor tipo de error, el que no
  // se nota.
  assert.equal(tipoParaElServidor('AUTO'), 'CAR');
  assert.equal(tipoParaElServidor('MOTO'), 'MOTO');
});

test('CAR se lee como AUTO', () => {
  assert.equal(tipoParaLaPantalla('CAR'), 'AUTO');
  assert.equal(tipoParaLaPantalla('MOTO'), 'MOTO');
  // Y lo desconocido cae en moto, que es lo que el servidor hace también.
  for (const raro of [null, undefined, '', 'BICI', 42]) {
    assert.equal(tipoParaLaPantalla(raro), 'MOTO');
  }
});

test('el cuerpo que se crea lleva el tipo del SERVIDOR', () => {
  const cuerpo = cuerpoParaCrear({
    origen: punto(),
    destino: punto({ lat: enElCentro.lat + 0.01 }),
    tipo: 'AUTO',
    metricas: { distanciaKm: 1.1, minutos: 3 }
  });
  assert.equal(cuerpo.rideType, 'CAR');
});

// ---------------------------------------------------------------------------
// Origen y destino
// ---------------------------------------------------------------------------

test('sin origen o sin destino no se pide nada', () => {
  assert.equal(queFaltaParaPedir(null, punto()), 'ORIGEN');
  assert.equal(queFaltaParaPedir(punto(), null), 'DESTINO');
  assert.equal(queFaltaParaPedir(punto(), punto({ lat: enElCentro.lat + 0.01 })), 'NADA');
});

test('NO se inventa una dirección', () => {
  // El servidor no la exige —`normalizeLocation` sólo valida coordenadas— así
  // que sin dirección el campo no viaja. «Mi ubicación» llegaría a la pantalla
  // del conductor como si fuera un sitio al que puede ir.
  const cuerpo = cuerpoParaCrear({
    origen: punto(),
    destino: punto({ lat: enElCentro.lat + 0.01, fuente: 'mapa' }),
    tipo: 'MOTO',
    metricas: { distanciaKm: 1.1, minutos: 3 }
  });
  assert.equal('address' in cuerpo.pickup, false, 'se inventó una dirección de origen');
  assert.equal('address' in cuerpo.destination, false, 'se inventó una dirección de destino');

  // Y cuando SÍ la hay, viaja.
  const conNombre = cuerpoParaCrear({
    origen: punto({ direccion: 'Avenida 5 de Julio' }),
    destino: punto({ lat: enElCentro.lat + 0.01 }),
    tipo: 'MOTO',
    metricas: { distanciaKm: 1.1, minutos: 3 }
  });
  assert.equal(conNombre.pickup.address, 'Avenida 5 de Julio');
});

test('la pantalla no fabrica direcciones', () => {
  const pantalla = sinComentarios('app/pedir.tsx');
  assert.match(pantalla, /direccion: null/);
  // Y no hay geocodificación de ninguna clase: ni proveedor nuevo, ni API nueva.
  assert.equal(/geocod|Geocod|reverseGeocode|places|Places/.test(pantalla), false,
    'entró geocodificación en la pantalla de pedir');
});

// ---------------------------------------------------------------------------
// La zona de servicio
// ---------------------------------------------------------------------------

test('fuera de Maracaibo NO se crea la solicitud', () => {
  // Caracas.
  const lejos = punto({ lat: 10.4806, lng: -66.9036 });
  assert.equal(queFaltaParaPedir(lejos, punto()), 'ORIGEN_FUERA_DEL_AREA');
  assert.equal(queFaltaParaPedir(punto(), lejos), 'DESTINO_FUERA_DEL_AREA');

  // Y con eso no se puede ni pedir precio.
  assert.equal(puedeEstimar('ELIGIENDO', 'ORIGEN_FUERA_DEL_AREA'), false);
  assert.equal(puedeEstimar('ELIGIENDO', 'DESTINO_FUERA_DEL_AREA'), false);
});

test('fuera de zona NO se confunde con un fallo del GPS', () => {
  // Son tres cosas distintas —fuera de zona, GPS averiado, sin red— y cada una
  // se responde distinto. Confundirlas hace creer que la aplicación está rota
  // cuando lo que pasa es que alguien está en Cabimas.
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /ORIGEN_FUERA_DEL_AREA/);
  assert.match(pantalla, /DESTINO_FUERA_DEL_AREA/);
  assert.match(pantalla, /Todavía no operamos donde estás/);
  // El aviso de zona no habla de errores ni de reintentar.
  // Sin comentarios: el porque de la regla SI dice que no es un fallo, y esa
  // explicacion no es lo que se pinta.
  const limpio = sinComentarios('app/pedir.tsx');
  const avisos = limpio.slice(limpio.indexOf('const AVISO'), limpio.indexOf('});', limpio.indexOf('const AVISO')));
  assert.equal(/error|fall|reintenta/i.test(avisos), false, 'el aviso de zona suena a avería');
});

// ---------------------------------------------------------------------------
// El precio lo pone el servidor
// ---------------------------------------------------------------------------

test('NO hay ninguna fórmula de tarifa en el teléfono', () => {
  for (const fichero of ['domain/pedirViaje.ts', 'services/pedido.ts', 'app/pedir.tsx']) {
    const codigo = sinComentarios(fichero);
    // Ni tarifas base, ni precio por kilómetro, ni multiplicadores propios.
    assert.equal(/baseFare|pricePerKm|pricePerMinute|minimumFare|nightMultiplier|peakMultiplier/.test(codigo), false,
      `${fichero} duplica la fórmula del servidor`);
    // Ni aritmética sobre el importe.
    assert.equal(/dolares\s*[*+/-]\s*\d|fareUSD\s*[*+/-]/.test(codigo), false,
      `${fichero} hace cuentas con el precio`);
  }
});

test('en la creación no viaja NI precio NI distancia: sólo dónde', () => {
  const cuerpo = cuerpoParaCrear({
    origen: punto(),
    destino: punto({ lat: enElCentro.lat + 0.01 }),
    tipo: 'MOTO',
    clave: 'trip_prueba_clave'
  });

  // Ni el precio, que nunca fue del teléfono...
  assert.equal('fareUSD' in cuerpo, false, 'se manda un precio en la creación');
  assert.equal('fareEUR' in cuerpo, false);
  assert.equal('fareVES' in cuerpo, false);

  // ...ni la distancia, que SÍ lo era y era la vía para inflar el importe.
  assert.equal('distanceKm' in cuerpo, false, 'el teléfono volvió a mandar kilómetros');
  assert.equal('durationMin' in cuerpo, false, 'y minutos');

  // Lo que va es dónde empieza, dónde termina, en qué, y de qué intento es.
  assert.ok(cuerpo.pickup && cuerpo.destination, 'los dos puntos');
  assert.equal(cuerpo.rideType, 'MOTO');
  assert.equal(cuerpo.id, 'trip_prueba_clave', 'la clave del intento');
});

test('la clave del intento tiene la forma que el servidor admite', () => {
  // `normalizeTripId` sólo acepta letras, dígitos, guión y guión bajo, hasta 80.
  const claves = Array.from({ length: 50 }, () => claveDeIntento());
  for (const clave of claves) {
    assert.match(clave, /^[A-Za-z0-9_-]{1,80}$/, clave);
  }
  // Y dos intentos distintos no pueden compartirla: serían el mismo viaje.
  assert.equal(new Set(claves).size, claves.length, 'dos intentos con la misma clave');
});

test('el camino que confiaba en el cliente YA NO EXISTE en el servidor', () => {
  // Habia dos: uno calculaba la tarifa y el otro conservaba la del cliente,
  // marcado en el propio codigo como «RIESGO PENDIENTE (alta)». El segundo se
  // borro, asi que ya no depende de que este cliente evite pisarlo.
  const codigo = servidor();
  assert.match(codigo, /fareSource = 'SERVER_CALCULATED'/, 'queda el del servidor');
  assert.ok(
    !/fareSource = 'CLIENT_ESTIMATE'/.test(codigo),
    'volvió a existir el camino que confía en el precio del cliente'
  );
  assert.ok(
    !/normalizeClientFareEstimate\(/.test(codigo),
    'el servidor volvió a leer la tarifa que le manda el cliente'
  );
});

test('la distancia es una medida, y los minutos salen de ella', () => {
  // Un kilómetro largo por el centro de Maracaibo.
  const metricas = metricasDelRecorrido(punto(), punto({ lat: enElCentro.lat + 0.01 }));
  assert.ok(metricas.distanciaKm > 1 && metricas.distanciaKm < 1.3, `${metricas.distanciaKm} km`);
  // Los minutos son la distancia a la velocidad urbana declarada, no un número
  // suelto: se comprueba la relación, no el valor.
  assert.equal(metricas.minutos, Math.max(1, Math.round((metricas.distanciaKm / VELOCIDAD_URBANA_KMH) * 60)));
});

test('nunca cero minutos', () => {
  // Un trayecto de treinta metros daría cero, y `calculateFare` cobraría sólo
  // la base — pero además un cero se lee como «no se sabe».
  const metricas = metricasDelRecorrido(punto(), punto({ lat: enElCentro.lat + 0.0003 }));
  assert.ok(metricas.minutos >= 1);
});

// ---------------------------------------------------------------------------
// Lo que se enseña es lo que el servidor dijo
// ---------------------------------------------------------------------------

test('la estimación se lee tal cual, sin adornos', () => {
  const leida = leerEstimacion({
    fareUSD: 3.42, fareVES: 0, exchangeRate: 0,
    distanceKm: 2.1, durationMin: 6, rideType: 'CAR',
    isNight: true, isPeak: false, multiplier: 1.2
  });
  assert.equal(leida.dolares, 3.42);
  assert.equal(leida.distanciaKm, 2.1);
  assert.equal(leida.minutos, 6);
  assert.equal(leida.tipo, 'AUTO');
  assert.equal(leida.esDeNoche, true);
  assert.equal(leida.esHoraPico, false);
  assert.equal(leida.multiplicador, 1.2);
});

test('sin tasa de cambio NO se enseñan bolívares', () => {
  // Con `FX_BCV_LIVE` apagado el servidor manda `bcvRate: 0`, así que `fareVES`
  // sale cero. «Bs. 0,00» sería una cifra falsa en la pantalla de alguien que
  // va a pagar.
  const sinTasa = leerEstimacion({
    fareUSD: 3, fareVES: 0, exchangeRate: 0, distanceKm: 1, durationMin: 3, rideType: 'MOTO'
  });
  assert.equal(sinTasa.bolivares, null);

  const conTasa = leerEstimacion({
    fareUSD: 3, fareVES: 2623.5, exchangeRate: 874.5, distanceKm: 1, durationMin: 3, rideType: 'MOTO'
  });
  assert.equal(conTasa.bolivares, 2623.5);
});

test('una respuesta ilegible NO se convierte en un precio', () => {
  for (const mala of [null, undefined, 'x', {}, { fareUSD: 0 }, { fareUSD: -1 },
    { fareUSD: 3 }, { fareUSD: 3, distanceKm: 'x', durationMin: 2 }]) {
    assert.equal(leerEstimacion(mala), null, `${JSON.stringify(mala)} pasó por precio`);
  }
});

test('NO se inventa ETA ni descuentos', () => {
  const pantalla = sinComentarios('app/pedir.tsx');
  // El servidor no manda nada de esto, así que no puede aparecer.
  assert.equal(/\bETA\b|minutosDeLlegada|llegaEn|descuento|promocion|precioAnterior|surge/i.test(pantalla), false,
    'la pantalla enseña algo que el servidor no dijo');

  // Y las tarjetas de vehículo se pintan SIN minutos: nadie sabe cuánto tarda
  // en llegar una moto.
  assert.match(pantalla, /<FilaDeVehiculo\s+tipo="MOTO"\s+activa=/);
  assert.equal(/<FilaDeVehiculo[^>]*minutos=/.test(pantalla), false,
    'se pintan minutos de llegada inventados');
});

// ---------------------------------------------------------------------------
// Los dos toques
// ---------------------------------------------------------------------------

test('no se piden dos precios a la vez', () => {
  assert.equal(puedeEstimar('ESTIMANDO', 'NADA'), false);
  assert.equal(puedeEstimar('PIDIENDO', 'NADA'), false);
  assert.equal(puedeEstimar('ELIGIENDO', 'NADA'), true);
  // Tras un rechazo se puede volver a intentar.
  assert.equal(puedeEstimar('RECHAZADO', 'NADA'), true);
});

test('NO se crean dos viajes con dos toques', () => {
  const precio = leerEstimacion({
    fareUSD: 3, fareVES: 0, exchangeRate: 0, distanceKm: 1, durationMin: 3, rideType: 'MOTO'
  });
  // El primero entra.
  assert.equal(puedePedir('CON_PRECIO', precio, false), true);
  // El segundo, mientras el primero está en vuelo, no.
  assert.equal(puedePedir('PIDIENDO', precio, false), false);
});

test('sin precio del servidor no se puede confirmar', () => {
  // Confirmar sin ver el precio no es confirmar.
  assert.equal(puedePedir('CON_PRECIO', null, false), false);
  assert.equal(puedePedir('ELIGIENDO', null, false), false);
});

test('si falta el origen o el destino, el botón NO se ofrece', () => {
  // ESTO SE VIO EN EL EMULADOR, y costó encontrarlo.
  //
  // El origen sale del GPS y puede desaparecer DESPUÉS de haber visto el
  // precio: basta con que el teléfono pierda la posición un momento. `pedir()`
  // se planta si falta, pero el botón no lo miraba y se quedaba encendido. Se
  // pulsaba y no pasaba nada: ni petición, ni error, ni aviso. Nada.
  //
  // Un botón encendido es una promesa.
  const precio = leerEstimacion({
    fareUSD: 3, fareVES: 0, exchangeRate: 0, distanceKm: 1, durationMin: 3, rideType: 'MOTO'
  });
  assert.equal(puedePedir('CON_PRECIO', precio, false, 'NADA'), true);
  for (const falta of ['ORIGEN', 'DESTINO', 'ORIGEN_FUERA_DEL_AREA', 'DESTINO_FUERA_DEL_AREA']) {
    assert.equal(
      puedePedir('CON_PRECIO', precio, false, falta), false,
      `con «${falta}» el botón seguía encendido`
    );
  }
});

test('con un viaje en marcha no se pide otro', () => {
  const precio = leerEstimacion({
    fareUSD: 3, fareVES: 0, exchangeRate: 0, distanceKm: 1, durationMin: 3, rideType: 'MOTO'
  });
  assert.equal(puedePedir('CON_PRECIO', precio, true), false);

  // Y la pantalla ni siquiera se enseña.
  assert.match(sinComentarios('app/pedir.tsx'),
    /viajeActivo\.fase === 'CON_VIAJE'\) return <Redirect href="\/viaje-activo" \/>/);
});

// ---------------------------------------------------------------------------
// Después de crear manda el almacén
// ---------------------------------------------------------------------------

test('la pantalla NO se queda con el viaje: refresca el almacén', () => {
  // Un segundo almacén del viaje acabaría discrepando del primero. La autoridad
  // es `GET /api/trips/active/me`, que consulta el proveedor de siempre.
  const pantalla = sinComentarios('app/pedir.tsx');
  assert.match(pantalla, /refrescarViaje\(\)/);
  assert.match(pantalla, /router\.replace\('\/viaje-activo'\)/);
  assert.equal(/useState<DetalleReal|setViaje\(/.test(pantalla), false,
    'la pantalla guarda el viaje por su cuenta');
});

test('la superficie de SEARCHING es la que ya estaba', () => {
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.match(ruta, /viaje\.estado === 'SEARCHING'/);
  assert.match(ruta, /<C2BuscandoVehiculo/);
});

// ---------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------

test('cancelar usa el contrato real del servidor', () => {
  const codigo = servidor();
  assert.match(codigo, /on\('rideCancelled', async \(data = \{\}\) => \{/);
  assert.match(codigo, /socket\.emit\('rideCancellationRejected'/);
  // La identidad sale de la sesión firmada, no del mensaje.
  assert.match(codigo, /const passengerId = socket\.data\.auth\.userId;/);

  const transporte = sinComentarios('realtime/socket.ts');
  assert.match(transporte, /socket\.emit\('rideCancelled', \{ tripId: viajeId \}\)/);
  // Y no se manda el identificador de la pasajera.
  const emisor = transporte.slice(transporte.indexOf('export function cancelarViaje'));
  assert.equal(/passengerId|userId/.test(emisor.slice(0, 300)), false);
});

test('el viaje NO se limpia hasta que el servidor confirme', () => {
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.match(ruta, /escuchar\('rideCancelled'/);
  assert.match(ruta, /escuchar\('rideCancellationRejected'/);
  // Nada de limpiar el viaje en la pantalla.
  assert.equal(/setViaje\(null\)|estado.*SIN_VIAJE.*=/.test(ruta), false);
});

test('no se cancela dos veces', () => {
  const ruta = sinComentarios('app/viaje-activo.tsx');
  assert.match(ruta, /if \(viajeId === null \|\| cancelando\) return;/);
  assert.match(ruta, /onCancelar=\{cancelando \? undefined : cancelar\}/);
});

test('el servidor permite cancelar también con conductor asignado', () => {
  // Contrato auditado, NO conectado en esta fase: la superficie de esos estados
  // es otra. Se documenta para que la fase que lo conecte no lo suponga.
  const maquina = fs.readFileSync(
    path.join(raizProyecto, 'server/domain/tripStateMachine.js'), 'utf8');
  assert.match(maquina, /\[TRIP_STATUS\.DRIVER_ASSIGNED\]: new Set\(\[TRIP_STATUS\.ARRIVED, TRIP_STATUS\.CANCELLED\]\)/);
  // Y no hay penalización económica en el camino de cancelación.
  const codigo = servidor();
  const cancelacion = codigo.slice(codigo.indexOf("on('rideCancelled'"), codigo.indexOf("on('chat:send_message'"));
  assert.equal(/fee|penalt|charge|cobr/i.test(cancelacion), false,
    'hay un cobro por cancelar que no está documentado');
});

// ---------------------------------------------------------------------------
// Lo que esta fase NO trae
// ---------------------------------------------------------------------------

test('NO se dibuja la ruta todavía', () => {
  const pantalla = sinComentarios('app/pedir.tsx');
  assert.match(pantalla, /ruta: \[\]/);
  // Y cuando llegue, no será amarilla: verde o teal, decisión del dueño.
  assert.equal(/polyline|Polyline/.test(pantalla), false);
});

test('NO entra ninguna superficie del conductor', () => {
  const pantalla = sinComentarios('app/pedir.tsx');
  for (const prohibido of ['rideRequested', 'rideAccepted', 'rideRejected', 'Llegué', 'countdown']) {
    assert.equal(pantalla.includes(prohibido), false, `entró «${prohibido}»`);
  }
});

test('las banderas de negocio siguen apagadas', () => {
  const codigo = sinComentarios('app/pedir.tsx') + sinComentarios('domain/pedirViaje.ts')
    + sinComentarios('services/pedido.ts');
  for (const bandera of [
    'SAFE_TRANSPORT', 'WALLET_PAYOUTS', 'DRIVER_WITHDRAWALS', 'LEGACY_PAYOUTS',
    'DISPATCH_ROUTE_MATRIX', 'FX_BCV_LIVE'
  ]) {
    assert.equal(codigo.includes(bandera), false, `esta fase toca ${bandera}`);
  }
  // El pago es en efectivo: la cartera tiene su propio camino y sus banderas.
  // Se comprueba el VALOR que sale, no como esta escrito: la constante se
  // extrajo para que la compartan el cuerpo y la huella del intento.
  assert.equal(PAGO_DE_ESTA_FASE, 'CASH');
  assert.equal(
    cuerpoParaCrear({
      origen: punto(), destino: punto({ lat: enElCentro.lat + 0.01 }),
      tipo: 'MOTO', clave: 'trip_pago'
    }).paymentMethod,
    'CASH'
  );
});

test('el laboratorio visual sigue aislado', () => {
  for (const relativa of ficherosDelLaboratorio(raizMovil)) {
    const codigo = despojarComentarios(fs.readFileSync(path.join(raizMovil, relativa), 'utf8'));
    assert.equal(/services\/pedido|crearViaje|pedirEstimacion/.test(codigo), false,
      `${relativa} pide viajes de verdad`);
  }
});

test('la pantalla aprobada no se rediseñó', () => {
  // Las tarjetas de moto y auto que el dueño puso en lugar de los destinos
  // recientes son las MISMAS: se importan del recorrido de diseño.
  const pantalla = sinComentarios('app/pedir.tsx');
  assert.match(pantalla, /import \{ FilaDeVehiculo, type PrecioDeTarjeta \} from '\.\.\/preview\/pantallasC2'/);
  assert.match(pantalla, /CÓMO QUIERES IR/);
  // Y el resto de piezas también son las aprobadas, no copias.
  for (const pieza of ['HojaInferior', 'LienzoDeMapa', 'Trayecto', 'BarraDeNavegacion', 'ControlDePedido']) {
    assert.ok(pantalla.includes(pieza), `falta la pieza aprobada ${pieza}`);
  }
  // Sin hoja de estilos propia: usa el tema.
  assert.equal(/StyleSheet\.create/.test(pantalla), false, 'la pantalla estrena estilos');
});

// ---------------------------------------------------------------------------
// Los estados de la pantalla cuando algo sale mal
// ---------------------------------------------------------------------------

test('cada fallo deja la pantalla en el estado que le corresponde', () => {
  // Un tunel sin cobertura, un servidor caido y haber tocado el boton veinte
  // veces piden cosas distintas. Con un solo estado de error la persona tiene
  // que adivinar cual de las tres le toca.
  const casos = [
    [{ motivo: 'SIN_RED', codigo: null }, 'OFFLINE'],
    [{ motivo: 'TIEMPO_AGOTADO', codigo: null }, 'OFFLINE'],
    [{ motivo: 'ERROR_DEL_SERVIDOR', codigo: null, estadoHttp: 429 }, 'RATE_LIMITED'],
    [{ motivo: 'ERROR_DEL_SERVIDOR', codigo: 'ACTIVE_TRIP_EXISTS', estadoHttp: 409 }, 'ACTIVE_TRIP_EXISTS'],
    [{ motivo: 'NO_AUTENTICADO', codigo: null, estadoHttp: 401 }, 'SESION_CADUCADA'],
    [{ motivo: 'ERROR_DEL_SERVIDOR', codigo: 'VALID_GPS_COORDINATES_REQUIRED', estadoHttp: 400 }, 'ROUTE_ERROR'],
    [{ motivo: 'ERROR_DEL_SERVIDOR', codigo: 'INVALID_ROUTE_METRICS', estadoHttp: 400 }, 'ROUTE_ERROR'],
    [{ motivo: 'ERROR_DEL_SERVIDOR', codigo: 'DATABASE_WRITE_FAILED', estadoHttp: 503 }, 'PRICING_ERROR']
  ];
  for (const [fallo, esperado] of casos) {
    assert.equal(estadoDelFallo(fallo), esperado, JSON.stringify(fallo));
  }
});

test('estar sin red se dice como sin red, y se promete que no se creo nada', () => {
  const texto = mensajeDelFallo('OFFLINE', 'algo salio mal');
  assert.match(texto, /[Ss]in conexi/, 'dice qué pasó de verdad');
  assert.match(texto, /no se cre/i, 'y promete que no quedó un viaje a medias');

  // El limitador se explica como espera, no como fallo.
  assert.match(mensajeDelFallo('RATE_LIMITED', 'x'), /[Ee]spera/);

  // Y lo que no se sabe clasificar conserva el mensaje del servidor en vez de
  // taparlo con una frase generica.
  assert.equal(mensajeDelFallo('PRICING_ERROR', 'No hay tarifa para esa zona'), 'No hay tarifa para esa zona');
});

test('la pantalla de pedir usa esos estados y NO crea viajes locales', () => {
  const codigo = leer('app/pedir.tsx');

  assert.match(codigo, /estadoDelFallo\(respuesta\)/, 'clasifica el fallo');
  assert.match(codigo, /mensajeDelFallo\(/, 'y lo cuenta en su idioma');
  assert.match(codigo, /estado === 'ACTIVE_TRIP_EXISTS'/, 'el 409 lleva al viaje que ya existe');

  // Un solo intento en vuelo: la fase cierra la puerta hasta que responda.
  assert.match(codigo, /setFase\('PIDIENDO'\)/);
  assert.match(codigo, /claveDelIntento\.current \?\?= claveDeIntento\(\)/, 'la clave se genera UNA vez');

  // Sin red no se guarda un viaje en el telefono esperando a subir.
  assert.ok(!/AsyncStorage|colaDeViajes|pendienteDeSubir/.test(codigo), 'no hay cola optimista de viajes');
});

// ---------------------------------------------------------------------------
// El doble toque conserva la clave
// ---------------------------------------------------------------------------

test('el temblor del GPS NO convierte el segundo toque en otro intento', () => {
  // Un teléfono quieto encima de una mesa mueve su posición unos metros cada
  // segundo. Si eso contara como intento nuevo, dos toques seguidos llevarían
  // claves distintas y el servidor crearía dos viajes: exactamente el fallo
  // que la idempotencia viene a evitar.
  const origen = punto();
  const destino = punto({ lat: enElCentro.lat + 0.01 });
  const comun = { destino, tipo: 'MOTO', pago: PAGO_DE_ESTA_FASE };

  const quieto = huellaDelIntento({ origen, ...comun });
  const conTemblor = huellaDelIntento({
    origen: punto({ lat: origen.lat + 0.00002, lng: origen.lng - 0.00003 }),
    ...comun
  });
  assert.equal(conTemblor, quieto, 'unos metros de GPS no son otro viaje');
});

test('cambiar el viaje SÍ es otro intento, y con él otra clave', () => {
  const origen = punto();
  const destino = punto({ lat: enElCentro.lat + 0.01 });
  const base = { origen, destino, tipo: 'MOTO', pago: PAGO_DE_ESTA_FASE };
  const huella = huellaDelIntento(base);

  // Cruzar la calle para que te recojan enfrente es otro viaje, aunque el
  // destino no cambie.
  assert.notEqual(
    huellaDelIntento({ ...base, origen: punto({ lat: origen.lat + 0.002 }) }), huella,
    'mover el ORIGEN de verdad es otro intento'
  );
  assert.notEqual(
    huellaDelIntento({ ...base, destino: punto({ lat: enElCentro.lat + 0.05 }) }), huella,
    'otro destino, otro intento'
  );
  assert.notEqual(
    huellaDelIntento({ ...base, tipo: 'AUTO' }), huella,
    'moto y carro no son el mismo viaje'
  );
  assert.notEqual(
    huellaDelIntento({ ...base, pago: 'WALLET' }), huella,
    'cambiar la forma de pago es otro intento'
  );
});

test('la pantalla ata la clave a la huella, no sólo al destino', () => {
  const codigo = leer('app/pedir.tsx');

  // El borrado por [tipo, destino] dejaba el ORIGEN fuera: cambiarlo conservaba
  // la clave y el servidor devolvía el viaje anterior.
  assert.match(codigo, /huellaDelIntento\(\{ origen, destino, tipo, pago: PAGO_DE_ESTA_FASE \}\)/);
  assert.match(codigo, /\}, \[huella\]\);/, 'la clave se invalida con la huella entera');
  assert.match(codigo, /claveDelIntento\.current \?\?= claveDeIntento\(\)/, 'y se genera UNA sola vez');

  // La forma de pago sale del dominio, no escrita a mano aquí: si se separaran,
  // cambiarla dejaría de contar como intento nuevo.
  assert.ok(!/paymentMethod: 'CASH'/.test(codigo), 'la forma de pago no se escribe a mano en la pantalla');
});

// ---------------------------------------------------------------------------
// El backend, alcanzable desde el emulador
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Que los controles lleven a alguna parte
// ---------------------------------------------------------------------------

test('los tres controles del trayecto tienen manejador', () => {
  // El componente aceptaba `onTocarOrigen`, `onTocarDestino` y `onElegirEnMapa`
  // desde el principio y la pantalla no le pasaba ninguno: se veian tres
  // controles y no respondia ninguno.
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /onTocarOrigen=\{actualizarMiUbicacion\}/);
  assert.match(pantalla, /onTocarDestino=\{abrirElMapa\}/);
  assert.match(pantalla, /onElegirEnMapa=\{abrirElMapa\}/);
  // Y tocar el origen vuelve a preguntarle al telefono donde esta.
  assert.match(pantalla, /const actualizarMiUbicacion = useCallback\(\(\) => \{ void pedirUbicacion\(\); \}/);
});

test('el destino NO se elige solo: hace falta confirmarlo', () => {
  // Antes bastaba con que el mapa se moviera para que la pantalla diera por
  // elegido un sitio que nadie eligio, y dijera «el punto que elegiste».
  const pantalla = leer('app/pedir.tsx');
  // El centro sólo se apunta como candidato, y sólo mientras se elige.
  assert.match(pantalla, /if \(!eligiendoEnMapa\) return;/);
  assert.match(pantalla, /setCandidato\(\{/);
  // El destino se fija al confirmar, y en ningún otro sitio.
  assert.match(pantalla, /const confirmarElPunto = useCallback\(\(\) => \{[\s\S]{0,200}?setDestino\(candidato\)/);
  // Una sola llamada en toda la pantalla, y es la de confirmar.
  assert.equal(
    (pantalla.match(/setDestino\(/g) ?? []).length,
    1,
    'el destino se fija en más de un sitio: alguno no será una confirmación'
  );
  assert.match(pantalla, /titulo="Confirmar este destino"/);
});

test('el punto de mira sólo aparece cuando se está eligiendo, y donde apunta', () => {
  // Un punto de mira permanente promete una interacción que no existe; y con
  // la hoja encima, el centro que el mapa reporta no es el centro de la vista.
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /eligiendoPunto: eligiendoEnMapa/);
  assert.match(pantalla, /aireInferior: eligiendoEnMapa \? altoDeLaHoja : 0/);
  const reticula = leer('mapa/Marcadores.tsx');
  assert.match(reticula, /marginBottom: aireInferior/, 'la retícula no respeta el hueco de la hoja');
});

test('«Ver precio» NO crea el viaje', () => {
  // Son dos botones y dos acciones distintas: uno pregunta el precio y el otro
  // pide la carrera. Estimar nunca puede acabar en un viaje creado.
  const pantalla = leer('app/pedir.tsx');
  const estimar = pantalla.slice(
    pantalla.indexOf('const estimar = useCallback'),
    pantalla.indexOf('const pedir = useCallback')
  );
  assert.ok(estimar.length > 0, 'no se encontró la función de estimar');
  assert.equal(/crearViaje\(/.test(estimar), false, '«Ver precio» llama a crearViaje');
  assert.match(estimar, /pedirEstimacion\(/);
  // Y quien crea es sólo `pedir`.
  assert.equal((pantalla.match(/await crearViaje\(/g) ?? []).length, 1);
  assert.match(pantalla, /titulo=\{fase === 'PIDIENDO' \? 'Pidiendo…' : 'Pedir viaje'\}/);
});

test('el precio viene con su distancia y su tiempo', () => {
  // Los tres salen de la MISMA respuesta del servidor --que los mide con
  // Google Routes-- y los minutos llegaban sin que nadie los enseñara.
  const pantalla = leer('app/pedir.tsx');
  assert.match(pantalla, /estimacion\.distanciaKm\.toFixed\(1\)\} km · \{Math\.max\(1, Math\.round\(estimacion\.minutos\)\)\} min/);
});

test('cuando no hay conductores se dice, y se puede volver a pedir', () => {
  // El despacho cancela con `NO_DRIVERS_AVAILABLE` y avisa por
  // `dispatch:no_drivers`. Sin ningún conductor elegible eso ocurre en el
  // mismo instante de crear, antes de que la pantalla del viaje exista: por
  // eso lo recuerda el proveedor y no ella.
  const proveedor = leer('realtime/ViajeActivo.tsx');
  assert.match(proveedor, /useEvento\('dispatch:no_drivers', useCallback\(\(\) => setSinConductores\(true\)/);
  assert.match(proveedor, /readonly sinConductores: boolean;/);

  const pantalla = leer('app/viaje-activo.tsx');
  assert.match(pantalla, /No encontramos conductores disponibles/);
  assert.match(pantalla, /titulo="Pedir otra vez"/);
  // Y no se sale al inicio en silencio mientras haya algo que contar.
  assert.match(pantalla, /if \(estado\.fase === 'SIN_VIAJE' && !sinConductores\) router\.replace\('\/pasajero'\)/);
});

test('el emulador de Android traduce localhost al anfitrión, y sólo ahí', async () => {
  const { urlParaEstaPlataforma, ANFITRION_DEL_EMULADOR_ANDROID } =
    await import('../domain/backendDelEntorno');

  const enEmulador = { esAndroid: true, enDesarrollo: true };

  // Dentro del emulador, `localhost` es el propio emulador: el backend del
  // ordenador no está ahí. Android publica 10.0.2.2 justo para esto.
  assert.equal(
    urlParaEstaPlataforma('http://127.0.0.1:4000', enEmulador),
    `http://${ANFITRION_DEL_EMULADOR_ANDROID}:4000`
  );
  assert.equal(
    urlParaEstaPlataforma('http://localhost:4000', enEmulador),
    `http://${ANFITRION_DEL_EMULADOR_ANDROID}:4000`
  );

  // Una IP de la red local es de quien la escribió: se respeta.
  assert.equal(
    urlParaEstaPlataforma('http://192.168.1.50:4000', enEmulador),
    'http://192.168.1.50:4000'
  );

  // Fuera del emulador y fuera de desarrollo, nada se toca.
  assert.equal(
    urlParaEstaPlataforma('http://127.0.0.1:4000', { esAndroid: false, enDesarrollo: true }),
    'http://127.0.0.1:4000'
  );
  assert.equal(
    urlParaEstaPlataforma('https://api.plus58.example', { esAndroid: true, enDesarrollo: false }),
    'https://api.plus58.example'
  );
});

test('un teléfono de verdad NO traduce localhost, aunque sea Android en desarrollo', async () => {
  // Viene de Antigravity, y arregla un caso que la versión anterior no
  // distinguía: `esAndroid && enDesarrollo` era cierto también en un teléfono
  // físico conectado por USB, así que la aplicación reescribía la dirección a
  // 10.0.2.2 —que dentro de un teléfono real no es nada— y decía «no hay
  // conexión» con el backend perfectamente vivo.
  //
  // Quien decide es `esEmulador`, y `services/api.ts` lo saca de las constantes
  // de la plataforma (modelo, marca, huella). Aquí se comprueba la decisión
  // pura, que es lo único que se puede comprobar sin emulador.
  const { urlParaEstaPlataforma, ANFITRION_DEL_EMULADOR_ANDROID } =
    await import('../domain/backendDelEntorno');

  assert.equal(
    urlParaEstaPlataforma('http://127.0.0.1:4000', {
      esAndroid: true,
      enDesarrollo: true,
      esEmulador: false
    }),
    'http://127.0.0.1:4000',
    'en un teléfono real la dirección se respeta'
  );

  // Y el emulador sigue traduciendo, que es lo que no puede romperse: es el
  // runtime con el que se valida todo.
  assert.equal(
    urlParaEstaPlataforma('http://127.0.0.1:4000', {
      esAndroid: true,
      enDesarrollo: true,
      esEmulador: true
    }),
    `http://${ANFITRION_DEL_EMULADOR_ANDROID}:4000`
  );

  // Omitirlo se comporta como el emulador. Es deliberado: quien no sabe dónde
  // está, está en el laboratorio, que es de donde vienen casi todas las
  // llamadas a esta función.
  assert.equal(
    urlParaEstaPlataforma('http://127.0.0.1:4000', { esAndroid: true, enDesarrollo: true }),
    `http://${ANFITRION_DEL_EMULADOR_ANDROID}:4000`
  );
});

test('la detección de emulador mira modelo, marca y huella, no una lista de nombres', async () => {
  // Una lista de modelos concretos envejece mal. Lo que no cambia es que las
  // imágenes del emulador de Android se identifican como `sdk`, `emulator`,
  // `generic` o `sdk_gphone`, y eso es lo que se busca.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.dirname(fileURLToPath(import.meta.url));
  const api = fs.readFileSync(path.join(raiz, '..', 'services', 'api.ts'), 'utf8');

  for (const marca of ['sdk', 'emulator', 'generic', 'sdk_gphone']) {
    assert.ok(api.includes(marca), `la detección ya no reconoce «${marca}»`);
  }
  assert.match(api, /esEmulador/, 'api.ts no le dice a la función dónde está');
});

test('no hay ninguna IP personal escrita en el código', () => {
  // La máquina de cada quien vive en su `.env`, que git ignora. Una IP fija en
  // el código funciona en un ordenador y en ninguno más.
  for (const fichero of ['config/environment.ts', 'domain/backendDelEntorno.ts', 'services/api.ts', 'app/pedir.tsx']) {
    const codigo = despojarComentarios(leer(fichero));
    const ips = codigo.match(/\b192\.168\.\d{1,3}\.\d{1,3}\b|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
    const ajenas = ips.filter(ip => ip !== '10.0.2.2');
    assert.deepEqual(ajenas, [], `${fichero} tiene una IP escrita a mano: ${ajenas.join(', ')}`);
  }
});
