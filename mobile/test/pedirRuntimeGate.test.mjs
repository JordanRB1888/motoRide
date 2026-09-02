import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios, ficherosDelLaboratorio } from './ayudas.mjs';

/**
 * PASSENGER-PEDIR-RUNTIME-GATE — la puerta a «Pedir» en la aplicación REAL.
 *
 * LO QUE PASÓ
 *
 * `app/pedir.tsx` existía desde PASSENGER-TRIP-1 y sus pruebas pasaban, pero
 * desde el inicio real de la pasajera no se podía llegar: `app/pasajero.tsx`
 * enseñaba una tarjeta de «llega en la siguiente entrega» y ningún botón. El
 * dueño, sin puerta, entró por el laboratorio y vio «Maracaibo · punto de
 * ejemplo», «4 min» y «Bs. 000,00» creyendo que era la aplicación.
 *
 * Las pruebas verdes no lo vieron porque ninguna preguntaba lo único que
 * importaba: desde el inicio real, ¿a dónde lleva Pedir?
 *
 * QUÉ SE PROTEGE
 *
 * Que el recorrido REAL —entrar, inicio, Pedir— acabe en `app/pedir.tsx`. Que
 * ningún dato de ejemplo pueda pintarse en la aplicación con sesión. Y que el
 * laboratorio siga siendo laboratorio: los fixtures viven ahí y sólo ahí.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** Las rutas con sesión de la pasajera: lo que ve alguien de verdad. */
const RUTAS_REALES = ['app/pasajero.tsx', 'app/pedir.tsx', 'app/viaje-activo.tsx'];

// ---------------------------------------------------------------------------
// El recorrido real
// ---------------------------------------------------------------------------

test('entrar como pasajera lleva al inicio real', () => {
  // Las dos puertas de arranque —sesión guardada y acceso recién hecho— van a
  // `/pasajero`, no al laboratorio.
  assert.match(sinComentarios('app/index.tsx'), /'\/pasajero'/);
  assert.match(sinComentarios('app/acceso.tsx'), /'\/pasajero'/);
});

test('el inicio real monta el HUB aprobado, no una tarjeta de espera', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /<C2InicioPasajera datos=\{datos\} \/>/);
  assert.match(inicio, /<ProveedorDeNavegacion ir=\{irA\}>/);
  // La tarjeta que decía que Pedir llegaría después se fue con la entrega.
  assert.equal(/siguiente entrega/.test(inicio), false, 'el inicio sigue prometiendo Pedir para luego');
});

test('Inicio → Pedir resuelve a app/pedir.tsx, no al laboratorio', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  // La clave `pedir` —la que emiten el disco central y el campo de destino—
  // lleva a la ruta REAL.
  assert.match(inicio, /if \(clave === 'pedir'\) \{ router\.push\('\/pedir'\); return; \}/);
  // Y la casilla grande de «Viajes» también.
  assert.match(inicio, /parametros\?\.servicio === 'viajes'\) \{ router\.push\('\/pedir'\); \}/);
  // Nunca a `/diseno`.
  assert.equal(/diseno/.test(inicio), false, 'el inicio real navega al laboratorio');

  // El disco central del HUB emite exactamente esa clave.
  const hub = sinComentarios('preview/pantallaInicioPasajera.tsx');
  assert.match(hub, /<CampoDeDestino onPress=\{\(\) => ir\('pedir'\)\} \/>/);
  assert.match(hub, /control=\{<ControlDePedido abierto=\{false\} \/>\}/);
  const barra = sinComentarios('ui/Navegacion.tsx');
  assert.match(barra, /ir\(abierto \? 'inicio' : 'pedir'\)/);
});

test('la ruta /pedir existe y es la pantalla integrada', () => {
  assert.ok(fs.existsSync(path.join(raizMovil, 'app/pedir.tsx')), 'no existe app/pedir.tsx');
  const pedir = sinComentarios('app/pedir.tsx');
  assert.match(pedir, /export default function PantallaDePedir/);
  // Y vuelve al inicio REAL, no al de diseño.
  assert.match(pedir, /router\.replace\('\/pasajero'\)/);
});

test('el inicio real sigue volviendo al viaje en marcha', () => {
  // Se conserva lo que ya protegía la fase del viaje activo: el HUB no puede
  // costar esa guarda.
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /viajeActivo\.fase === 'CON_VIAJE'/);
  assert.match(inicio, /router\.replace\('\/viaje-activo'\)/);
});

// ---------------------------------------------------------------------------
// Ningún dato de ejemplo en la aplicación real
// ---------------------------------------------------------------------------

test('las rutas reales no importan fixtures', () => {
  for (const ruta of RUTAS_REALES) {
    const codigo = sinComentarios(ruta);
    assert.equal(/preview\/fixtures|_DEMO\b/.test(codigo), false,
      `${ruta} importa datos de ejemplo`);
  }
});

test('los textos de ejemplo que vio el dueño NO existen fuera del laboratorio', () => {
  // Los literales exactos de la captura.
  const prohibidos = ['punto de ejemplo', 'Destino de ejemplo', 'Zona demo', 'Bs. 000,00', 'Cifra de ejemplo'];
  const carpetas = ['app', 'ui', 'domain', 'services', 'realtime', 'ubicacion', 'mapa', 'context', 'components'];
  for (const carpeta of carpetas) {
    const ruta = path.join(raizMovil, carpeta);
    if (!fs.existsSync(ruta)) continue;
    for (const nombre of fs.readdirSync(ruta, { recursive: true })) {
      const completa = path.join(ruta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      const relativa = path.relative(raizMovil, completa).replace(/\\/g, '/');
      // El laboratorio y el visor de diseño son los únicos sitios permitidos.
      if (relativa.startsWith('app/diseno/') || relativa === 'app/preview.tsx') continue;
      const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
      for (const texto of prohibidos) {
        assert.equal(codigo.includes(texto), false, `${relativa} contiene «${texto}»`);
      }
    }
  }
});

test('el inicio real no inventa lo que no tiene', () => {
  // Sin tasa, sin campañas, sin aliados, sin sitios guardados: nada de eso
  // tiene fuente real todavía, y el HUB no lo pinta si no llega.
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /tasa: null/);
  assert.match(inicio, /campanas: \[\]/);
  assert.match(inicio, /lugares: \[\]/);
  assert.match(inicio, /conAliados: false/);
  // Y el nombre es el de la sesión.
  assert.match(inicio, /nombre: usuario\.firstName/);
});

test('el HUB no pinta secciones vacías ni tasa nula', () => {
  const hub = sinComentarios('preview/pantallaInicioPasajera.tsx');
  assert.match(hub, /datos\.tasa !== null && \(/);
  assert.match(hub, /datos\.lugares\.length > 0 && \(/);
  assert.match(hub, /datos\.campanas\.length > 0 && \(/);
  assert.match(hub, /datos\.conAliados && \(/);
  // Los fixtures siguen ahí, pero SÓLO como valor por defecto del laboratorio.
  assert.match(hub, /const DATOS_DEMO: DatosDelInicio/);
  assert.match(hub, /datos = DATOS_DEMO/);
});

// ---------------------------------------------------------------------------
// Ni ETA ni bolívares falsos en la pantalla real de pedir
// ---------------------------------------------------------------------------

test('la pantalla real de pedir no lleva minutos inventados', () => {
  const pedir = sinComentarios('app/pedir.tsx');
  assert.equal(/minutos=\{\d+\}/.test(pedir), false, 'hay un ETA escrito a mano');
  // Las tarjetas se montan sin minutos.
  assert.match(pedir, /<FilaDeVehiculo\s+tipo="MOTO"\s+activa=/);
  assert.match(pedir, /<FilaDeVehiculo\s+tipo="AUTO"\s+activa=/);
});

test('la pantalla real de pedir no pinta bolívares sin tasa', () => {
  const pedir = sinComentarios('app/pedir.tsx');
  // Sólo con `bolivares !== null`, que con el cambio apagado nunca ocurre.
  assert.match(pedir, /estimacion\.bolivares !== null && \(/);
  assert.equal(/TASA_DEMO|Bs\. 0/.test(pedir), false);
});

test('antes de estimar no hay ningún precio en pantalla', () => {
  // El importe sólo se pinta con una estimación del servidor. Un «$0,00»
  // esperando parecería una cotización.
  const pedir = sinComentarios('app/pedir.tsx');
  assert.match(pedir, /\{estimacion !== null && \(/);
  assert.equal(/\$0[.,]00/.test(pedir), false);
});

// ---------------------------------------------------------------------------
// El mapa es el de verdad
// ---------------------------------------------------------------------------

test('Pedir monta el lienzo real, que usa el adaptador de Google Maps', () => {
  const pedir = sinComentarios('app/pedir.tsx');
  assert.match(pedir, /<LienzoDeMapa/);
  assert.match(pedir, /import \{ LienzoDeMapa \} from '\.\.\/ui\/Mapa'/);
  const lienzo = sinComentarios('ui/Mapa.tsx');
  assert.match(lienzo, /import \{ MapaDeMovilidad \} from '\.\.\/mapa\/MapaDeMovilidad'/);
  // El adaptador nativo es Google con el Map ID de la nube.
  const nativo = sinComentarios('mapa/MapaDeMovilidad.native.tsx');
  assert.match(nativo, /PROVIDER_GOOGLE/);
  assert.match(nativo, /googleMapId=/);
});

test('el mapa de pedir no lleva motos de ejemplo', () => {
  // `C2PedirViaje` pinta `MOTOS_CERCA`; la real, ninguna: no hay flota falsa.
  const pedir = sinComentarios('app/pedir.tsx');
  assert.equal(/MOTOS_CERCA|vehiculos=/.test(pedir), false, 'hay motos de ejemplo en el mapa real');
});

// ---------------------------------------------------------------------------
// El laboratorio sigue siendo laboratorio
// ---------------------------------------------------------------------------

test('/diseno sigue montando los fixtures, y sólo él', () => {
  // El recorrido de diseño no cambia: sigue enseñando la pantalla de ejemplo.
  const disenoPedir = sinComentarios('app/diseno/pedir.tsx');
  assert.match(disenoPedir, /<C2PedirViaje \/>/);
  const disenoInicio = sinComentarios('app/diseno/index.tsx');
  assert.match(disenoInicio, /<C2InicioPasajera \/>/);

  // Y nada del laboratorio pide viajes de verdad.
  for (const relativa of ficherosDelLaboratorio(raizMovil)) {
    const codigo = despojarComentarios(fs.readFileSync(path.join(raizMovil, relativa), 'utf8'));
    assert.equal(/services\/pedido|crearViaje|pedirEstimacion/.test(codigo), false,
      `${relativa} pide viajes de verdad`);
  }
});

test('el acceso sigue siendo el real', () => {
  const acceso = sinComentarios('app/acceso.tsx');
  assert.equal(/preview\/fixtures|_DEMO\b|diseno/.test(acceso), false);
  // Sin sesion, la raiz va a la BIENVENIDA oficial, que lleva al acceso real;
  // el selector de rol es solo desarrollo desde REAL-APP-BOOT-GATE.
  assert.match(sinComentarios('app/index.tsx'), /href="\/bienvenida"/);
});

test('el «$0,00» del laboratorio no puede llegar a la pantalla real', () => {
  // Lo que el dueño vio en las tarjetas. Era un hueco de diseño escrito a mano
  // dentro de la tarjeta aprobada; ahora el precio es una prop, el laboratorio
  // pasa su hueco y la aplicación real sólo pasa el importe del servidor.
  const tarjeta = sinComentarios('preview/pantallasC2.tsx');
  assert.match(tarjeta, /readonly precio\?: PrecioDeTarjeta;/);
  assert.match(tarjeta, /\{precio !== undefined && \(/);
  // Sin literal suelto: el hueco vive en una constante con nombre.
  assert.equal(/>\$0,00</.test(tarjeta), false, 'la tarjeta vuelve a escribir $0,00 a mano');
  assert.match(tarjeta, /PRECIO_DE_EJEMPLO: PrecioDeTarjeta/);

  const pedir = sinComentarios('app/pedir.tsx');
  assert.equal(/PRECIO_DE_EJEMPLO|\$0,00|Bs\. 0,00/.test(pedir), false,
    'la pantalla real usa el hueco del laboratorio');
  // El importe de la tarjeta sale de la estimación, y sólo para el vehículo
  // que se estimó.
  assert.match(pedir, /if \(estimacion === null \|\| estimacion\.tipo !== vehiculo\) return undefined;/);
  assert.match(pedir, /precio=\{precioDeTarjeta\('MOTO'\)\}/);
  assert.match(pedir, /precio=\{precioDeTarjeta\('AUTO'\)\}/);
});

test('el destino no existe hasta que el mapa se mueve de donde estás', () => {
  // El retículo arranca centrado en el origen. Sin esto, «El punto que
  // elegiste» aparecía antes de elegir, y la estimación era de un viaje de
  // cero kilómetros a donde ya estás.
  const pedir = sinComentarios('app/pedir.tsx');
  assert.match(pedir, /const DISTANCIA_MINIMA_KM = 0\.05;/);
  assert.match(pedir, /distanciaKm\(origen, centro\) < DISTANCIA_MINIMA_KM\) return;/);
});

test('el modelo del mapa está memorizado: sin bucle mapa↔estado', () => {
  // El mapa nativo mueve la cámara por IDENTIDAD de `modelo.camara`. Un modelo
  // construido inline en cada repintado hacía que cada `setDestino` moviera el
  // mapa, que avisara del centro, que volviera a `setDestino`. React lo corta
  // con «Maximum update depth exceeded»: se vio en el emulador.
  const pedir = sinComentarios('app/pedir.tsx');
  assert.match(pedir, /const modelo = useMemo\(\(\) => \(\{/);
  assert.match(pedir, /modelo=\{modelo\}/);
  assert.equal(/modelo=\{\{/.test(pedir), false, 'el modelo vuelve a construirse inline');
  // Y un centro que ya es el destino no se apunta otra vez.
  assert.match(pedir, /distanciaKm\(destino, centro\) < 0\.001\) return;/);
});
