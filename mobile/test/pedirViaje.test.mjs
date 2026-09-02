import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios, ficherosDelLaboratorio } from './ayudas.mjs';
import {
  cuerpoParaCrear,
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
  assert.match(codigo, /app\.post\('\/api\/trips\/create', requireAuth, requireRole\('passenger'\)/);

  const cliente = sinComentarios('services/pedido.ts');
  assert.match(cliente, /'\/api\/pricing\/estimate'/);
  assert.match(cliente, /'\/api\/trips\/create'/);
});

test('el servidor pide las métricas que se le mandan', () => {
  // Sin `distanceKm` y `durationMin` responde `INVALID_ROUTE_METRICS`.
  const codigo = servidor();
  const estimador = codigo.slice(codigo.indexOf("app.post('/api/pricing/estimate'"));
  assert.match(estimador.slice(0, 500), /const distanceKm = Number\(req\.body\.distanceKm\)/);
  assert.match(estimador.slice(0, 500), /const durationMin = Number\(req\.body\.durationMin\)/);
  assert.match(estimador.slice(0, 500), /INVALID_ROUTE_METRICS/);
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

test('en la creación NO viaja ningún precio', () => {
  // Con métricas de ruta el servidor calcula y descarta lo que mande el
  // cliente. Mandarlo igualmente no cambiaría el importe hoy, pero dejaría
  // escrito que el teléfono opina del precio.
  const cuerpo = cuerpoParaCrear({
    origen: punto(),
    destino: punto({ lat: enElCentro.lat + 0.01 }),
    tipo: 'MOTO',
    metricas: { distanciaKm: 1.1, minutos: 3 }
  });
  assert.equal('fareUSD' in cuerpo, false, 'se manda un precio en la creación');
  assert.equal('fareEUR' in cuerpo, false);
  assert.equal('fareVES' in cuerpo, false);

  // Y sí van las métricas, que son las que hacen que el servidor calcule.
  assert.equal(cuerpo.distanceKm, 1.1);
  assert.equal(cuerpo.durationMin, 3);
});

test('mandar métricas es lo que pone al servidor al mando', () => {
  // Sin ellas cae en su otro camino, el que su propio código marca como
  // «RIESGO PENDIENTE (alta)»: conservar la estimación del cliente.
  const codigo = servidor();
  assert.match(codigo, /fareSource = 'SERVER_CALCULATED'/);
  assert.match(codigo, /fareSource = 'CLIENT_ESTIMATE'/);
  // El camino del cliente sigue existiendo en el servidor; lo que se garantiza
  // es que este cliente no lo pisa nunca.
  const cuerpo = cuerpoParaCrear({
    origen: punto(), destino: punto({ lat: enElCentro.lat + 0.01 }),
    tipo: 'MOTO', metricas: { distanciaKm: 2, minutos: 5 }
  });
  assert.ok(Number.isFinite(cuerpo.distanceKm) && cuerpo.distanceKm > 0);
  assert.ok(Number.isFinite(cuerpo.durationMin) && cuerpo.durationMin > 0);
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
  assert.match(sinComentarios('domain/pedirViaje.ts'), /paymentMethod: 'CASH'/);
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
