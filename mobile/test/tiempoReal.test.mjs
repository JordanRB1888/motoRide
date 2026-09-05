import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  esObjeto,
  EVENTOS_DEL_CLIENTE,
  EVENTOS_DEL_SERVIDOR,
  EVENTOS_PENDIENTES
} from '../realtime/eventos.ts';

/**
 * El transporte en tiempo real — REALTIME-INTEGRATION-1A.
 *
 * QUÉ SE PROTEGE
 *
 * Lo que se rompe en silencio y sólo se nota en producción: dos sockets
 * abiertos, escuchas que se acumulan en cada montaje, una sesión cerrada con la
 * conexión viva, y —la peor— dar por hecho que el socket trae todo lo que pasó
 * mientras el teléfono estaba sin red.
 *
 * También se protege lo que esta fase NO debe hacer todavía: nada de despacho,
 * nada de GPS, nada de chat.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

// ---------------------------------------------------------------------------
// La dependencia
// ---------------------------------------------------------------------------

test('el cliente casa con la versión de socket.io del servidor', () => {
  const servidor = JSON.parse(fs.readFileSync(path.join(raizProyecto, 'server/package.json'), 'utf8'));
  const movil = JSON.parse(leer('package.json'));

  const delServidor = servidor.dependencies['socket.io'];
  const delCliente = movil.dependencies['socket.io-client'];
  assert.ok(delServidor && delCliente, 'falta alguna de las dos');

  // Misma línea mayor y menor. Socket.IO sólo garantiza compatibilidad dentro
  // de la misma mayor, y coincidir también en la menor evita sorpresas.
  const version = valor => valor.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');
  assert.equal(version(delCliente), version(delServidor));

  // Fijada, sin circunflejo: un `npm install` limpio no debe traer una versión
  // distinta a la que se probó contra este servidor.
  assert.match(delCliente, /^\d+\.\d+\.\d+$/, 'la versión del cliente no está fijada');
});

test('socket.io-client NO es una dependencia nativa', () => {
  // Es JavaScript puro: no trae carpetas `android/` ni `ios/`, así que no
  // obliga a reconstruir el binario. (En el informe de HISTORY-INTEGRATION-1
  // se agrupó por error con las nativas.)
  const raiz = path.join(raizMovil, 'node_modules/socket.io-client');
  assert.ok(fs.existsSync(raiz), 'no está instalado');
  for (const nativa of ['android', 'ios', 'cpp']) {
    assert.equal(fs.existsSync(path.join(raiz, nativa)), false, `trae carpeta ${nativa}/`);
  }
});

test('esta fase NO instala nada nativo', () => {
  const dependencias = Object.keys(JSON.parse(leer('package.json')).dependencies ?? {});
  // `expo-location` sale de la lista en LOCATION-INTEGRATION-1A: el dueño
  // lo autorizó y la aplicación ya usa la ubicación en primer plano. El
  // resto sigue prohibido, y `expo-task-manager` en especial: es lo que
  // hace falta para seguir midiendo con la aplicación cerrada.
  // `expo-task-manager` sale de la lista en DRIVER-LOCATION-RESILIENCE-1:
  // el dueno autorizo el seguimiento en segundo plano del conductor en
  // servicio, y esa es la pieza oficial que lo hace posible. Lo que se
  // protege ahora no es que no exista, sino que solo exista trabajando
  // —eso lo vigila `seguimientoEnSegundoPlano.test.mjs`—.
  // `expo-image-picker` sale de la lista en DRIVER-APPLICATION-D1: el dueno
  // autorizo la captura de documentos para la postulacion de conductor. Lo
  // que se vigila ahora es que solo lo importe `media/captura.ts` —eso lo
  // hace `fotoDeDocumento.test.mjs`—.
  for (const prohibida of [
    'expo-maps', '@react-native-community/netinfo',
    'expo-notifications', 'expo-background-fetch'
  ]) {
    assert.equal(dependencias.includes(prohibida), false, `se instaló ${prohibida}`);
  }
});

// ---------------------------------------------------------------------------
// La autenticación
// ---------------------------------------------------------------------------

test('el token viaja donde el servidor lo busca', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(servidor, /socket\.handshake\.auth\?\.token/, 'el servidor cambió de sitio');

  const cliente = sinComentarios('realtime/socket.ts');
  assert.match(cliente, /auth: \{ token \}/, 'el cliente no lo manda ahí');
});

test('la identidad NO viaja en el payload', () => {
  // El servidor la deriva del token firmado. Mandar userId o role daría a
  // entender que sirven, y el día que alguien los leyera del payload en vez de
  // la sesión, la autorización se podría falsificar.
  const cliente = sinComentarios('realtime/socket.ts');
  for (const campo of ['userId', 'role', 'driverId', 'passengerId']) {
    assert.equal(
      new RegExp(`${campo}\\s*:`).test(cliente), false,
      `el cliente manda «${campo}» en la conexión`
    );
  }

  // Y el servidor lo confirma: la identidad sale de `payload.sub`.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(servidor, /socket\.data\.auth = \{ userId: currentUser\.id, role: currentUser\.role \}/);
});

test('el token sale de la abstracción existente, sin segundo almacén', () => {
  const cliente = leer('realtime/socket.ts');
  assert.match(cliente, /from '\.\.\/services\/session'/);
  assert.match(cliente, /await leerToken\(\)/);
  assert.equal(
    /SecureStore|AsyncStorage|localStorage/.test(sinComentarios('realtime/socket.ts')), false,
    'el socket abre su propio almacén de sesión'
  );
});

test('sin sesión no se conecta', () => {
  const cliente = sinComentarios('realtime/socket.ts');
  assert.match(cliente, /if \(!token\) \{[\s\S]{0,120}return;/, 'conecta sin token');

  const proveedor = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.match(proveedor, /sesion\.estado === 'AUTENTICADO'/, 'no espera a la sesión confirmada');
});

// ---------------------------------------------------------------------------
// La configuración
// ---------------------------------------------------------------------------

test('sin configuración se falla CERRADO, sin respaldo a producción', () => {
  const cliente = leer('realtime/socket.ts');
  assert.match(cliente, /from '\.\.\/config\/environment'/, 'no usa la configuración de la aplicación');
  assert.match(sinComentarios('realtime/socket.ts'), /if \(!configuracion\.ok\)/);

  // Ni una dirección escrita a mano. Un teléfono de desarrollo que se conecte
  // solo a producción es una fuga esperando a ocurrir.
  const codigo = sinComentarios('realtime/socket.ts');
  assert.equal(/https?:\/\//.test(codigo), false, 'hay una URL escrita en el transporte');
  assert.equal(/railway|vercel|localhost|127\.0\.0\.1/i.test(codigo), false, 'hay un respaldo de servidor');
});

// ---------------------------------------------------------------------------
// Una sola conexión
// ---------------------------------------------------------------------------

test('una sesión, un socket', () => {
  const cliente = sinComentarios('realtime/socket.ts');
  // La instancia vive fuera de React y la guarda es la primera línea de
  // `conectar`: llamarla dos veces no abre dos conexiones.
  assert.match(cliente, /let socket: Socket \| null = null;/);
  assert.match(cliente, /export async function conectar\(\): Promise<void> \{\s*if \(socket !== null\) return;/);
  // Y otra vez después del `await`, que es donde se cuela la segunda llamada.
  const cuerpo = cliente.slice(cliente.indexOf('export async function conectar'));
  assert.equal(
    (cuerpo.slice(0, 1400).match(/if \(socket !== null\) return;/g) ?? []).length, 2,
    'falta la guarda posterior al await'
  );
});

test('el proveedor se monta UNA vez, en el layout raíz', () => {
  const raiz = leer('app/_layout.tsx');
  assert.equal((raiz.match(/<ProveedorDeTiempoReal>/g) ?? []).length, 1);
  // Dentro de la sesión: necesita saber si hay una.
  assert.ok(
    raiz.indexOf('<ProveedorDeSesion>') < raiz.indexOf('<ProveedorDeTiempoReal>'),
    'el tiempo real está fuera de la sesión'
  );

  // Y ninguna pantalla monta el suyo.
  for (const nombre of fs.readdirSync(path.join(raizMovil, 'app'), { recursive: true })) {
    const completa = path.join(raizMovil, 'app', String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.tsx$/.test(completa)) continue;
    if (completa.endsWith('_layout.tsx') && String(nombre) === '_layout.tsx') continue;
    assert.equal(
      /<ProveedorDeTiempoReal/.test(fs.readFileSync(completa, 'utf8')), false,
      `${nombre} monta su propio proveedor`
    );
  }
});

test('los escuchas se quitan solos', () => {
  // Sin la limpieza, cada montaje añade un escucha y el mismo evento se
  // procesa dos, tres, diez veces.
  const cliente = sinComentarios('realtime/socket.ts');
  const desdeEscuchar = cliente.slice(cliente.indexOf('export function escuchar'));
  const baja = desdeEscuchar.slice(desdeEscuchar.indexOf('return () =>'));

  // Quitarlo del socket ya no basta: desde que el registro de escuchas
  // sobrevive a la conexión, uno que no salga de él se volvería a aplicar al
  // reconectar. Hacen falta las dos cosas, o hay fuga.
  assert.match(baja, /escuchas\.delete\(registro\)/, 'no sale del registro');
  assert.match(baja, /socket\?\.off\(evento, envoltorio\)/, 'no se quita del socket');

  const proveedor = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.match(proveedor, /useEffect\(\s*\(\) => suscribir\(evento/, 'el hook no devuelve la limpieza');
});

// ---------------------------------------------------------------------------
// El ciclo de vida
// ---------------------------------------------------------------------------

test('cerrar sesión desconecta y limpia', () => {
  const cliente = sinComentarios('realtime/socket.ts');
  const cuerpo = cliente.slice(cliente.indexOf('export function desconectar'));
  // Quitar los escuchas ANTES de desconectar: un socket desconectado con
  // escuchas vivos vuelve a dispararlos al reconectar, y si la sesión cambió,
  // los dispara con los datos de la anterior.
  assert.ok(
    cuerpo.indexOf('removeAllListeners') < cuerpo.indexOf('disconnect()'),
    'se desconecta antes de limpiar'
  );
  assert.match(cuerpo, /socket = null;/);

  const proveedor = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.match(proveedor, /if \(!debeConectar\) \{[\s\S]{0,120}desconectar\(\);/);
});

test('un fallo de red NO cierra la sesión', () => {
  const cliente = sinComentarios('realtime/socket.ts');
  assert.equal(/salir\(|borrarToken|SESION_INVALIDA/.test(cliente), false,
    'el transporte toca la sesión');

  const proveedor = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.equal(/salir\(/.test(proveedor), false);
});

test('la reconexión la lleva socket.io, no un bucle propio', () => {
  const cliente = sinComentarios('realtime/socket.ts');
  assert.match(cliente, /reconnection: true/);
  assert.match(cliente, /reconnectionDelayMax: 15_000/, 'sin tope, los reintentos tumban el servidor entre todos');
  assert.equal(/setInterval|while \(/.test(cliente), false, 'hay un bucle de reintentos propio');
});

// ---------------------------------------------------------------------------
// HTTP manda, el socket avisa
// ---------------------------------------------------------------------------

test('tras reconectar se vuelve a preguntar por HTTP', () => {
  // Un socket reconectado NO es una fuente histórica: mientras no había red, el
  // servidor siguió emitiendo y nadie lo oyó.
  const cliente = sinComentarios('realtime/socket.ts');
  assert.match(cliente, /cliente\.io\.on\('reconnect'/);
  assert.match(cliente, /for \(const observador of observadoresDeResync\) observador\(\);/);

  // El resync sigue conectado; lo que cambió es que ahora distingue si toca
  // repartir. Una reconexión es de este teléfono solo: no se reparte.
  const enVivo = sinComentarios('realtime/avisosEnVivo.ts');
  assert.match(enVivo, /useResync\(useCallback\(\(\) => pedirRecarga\(false\)/);
});

test('el aviso en vivo NO se pinta: dispara la carga HTTP', () => {
  // `platform:notification` llega con dos formas y una de ellas NO está
  // guardada en la base —la de liquidación no trae identificador—. Insertarla
  // haría imposible marcarla como leída, y la otra saldría dos veces.
  const enVivo = sinComentarios('realtime/avisosEnVivo.ts');
  assert.match(enVivo, /useEvento\('platform:notification', useCallback\(\(\) => pedirRecarga\(true\)/);
  // El payload no se lee: da igual qué traiga.
  assert.equal(/payload\.|aviso\.title|\.id/.test(enVivo), false, 'el evento se está leyendo');

  // Y las dos pantallas usan la MISMA carga que ya tenían.
  assert.match(sinComentarios('app/avisos.tsx'), /useAvisosEnVivo\(\(\) => \{ void cargar\(\); \}\)/);
  assert.match(sinComentarios('app/perfil.tsx'), /useAvisosEnVivo\(\(\) => \{ void refrescarAvisos\(\); \}\)/);
});

test('las dos formas del evento existen de verdad en el servidor', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  // La difusión manda la notificación entera (con id).
  assert.match(servidor, /emit\('platform:notification', notification\)/);
  // La liquidación manda un objeto suelto, sin id.
  assert.match(servidor, /emit\('platform:notification', \{ title:/);
});

test('una difusión no dispara una petición por evento', () => {
  // Llega a la vez a todos los teléfonos conectados. La primera versión
  // esperaba 400 ms fijos, que MUEVEN el pico en vez de repartirlo;
  // REALTIME-INTEGRATION-2 lo cambió por agrupación más reparto aleatorio.
  // Lo que se protege sigue siendo lo mismo: que no salga una petición por
  // evento.
  const enVivo = sinComentarios('realtime/avisosEnVivo.ts');
  assert.match(enVivo, /clearTimeout\(temporizador\.current\)/, 'no se agrupan');
  assert.match(enVivo, /retrasoDeRecarga\(/, 'no se reparte');
});

// ---------------------------------------------------------------------------
// Eventos malformados
// ---------------------------------------------------------------------------

test('un payload malformado no tumba nada', () => {
  for (const basura of [null, undefined, 'texto', 42, [], true]) {
    assert.equal(esObjeto(basura), false, `${String(basura)} se acepta como objeto`);
  }
  assert.equal(esObjeto({ title: 'ok' }), true);

  // El envoltorio normaliza a objeto y captura lo que falle dentro: un
  // consumidor roto no puede llevarse por delante el transporte.
  const cliente = sinComentarios('realtime/socket.ts');
  assert.match(cliente, /escucha\(esObjeto\(payload\) \? payload : \{\}\)/);
  assert.match(cliente, /catch \(error\) \{/);
});

test('los eventos de error del servidor están declarados', () => {
  for (const evento of ['socket:error', 'socket:rate_limited', 'authorization:error']) {
    assert.ok(EVENTOS_DEL_SERVIDOR.includes(evento), `falta «${evento}»`);
  }
  // Y existen en el servidor.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  for (const evento of EVENTOS_DEL_SERVIDOR) {
    assert.match(servidor, new RegExp(`'${evento}'`), `el servidor no emite «${evento}»`);
  }
});

test('no se registran secretos', () => {
  const cliente = sinComentarios('realtime/socket.ts');
  const registros = [...cliente.matchAll(/anotar\(([^)]*)\)/g)].map(coincidencia => coincidencia[1]);
  for (const registro of registros) {
    assert.equal(/token|auth|payload|Bearer/i.test(registro), false, `se registra «${registro}»`);
  }
});

// ---------------------------------------------------------------------------
// Lo que esta fase NO hace
// ---------------------------------------------------------------------------

test('NO se emite ningún evento de despacho todavía', () => {
  // El transporte ya podría, y por eso hace falta la prueba.
  //
  // Los dos de UBICACION salieron de la lista en LOCATION-INTEGRATION-1B: el
  // dueño los autorizó y ya se emiten, con su regulador y sus reglas de
  // calidad. Lo que sigue vedado es el NEGOCIO — pedir, aceptar, cancelar,
  // cambiar de estado o hablar por el chat—, que necesita sus pantallas y sus
  // confirmaciones antes de poder dispararse desde aquí.
  const carpetas = ['realtime', 'app', 'preview', 'services'];
  //
  // `driver:connect` y `driver:status` salen de la lista en
  // DRIVER-AVAILABILITY-1: el conductor ya puede ponerse en servicio desde
  // su pantalla.
  //
  // `rideAccepted` y `rideRejected` salen en DISPATCH-DRIVER-SURFACES-1, que
  // es la fase que les da su superficie: la oferta con su cuenta atras, el
  // candado del doble toque y la negativa a aceptar una vencida. Siguen vedados
  // los que MUEVEN UN VIAJE sin pantalla propia — pedir, cambiar de estado,
  // calificar y hablar por el chat.
  //
  // `rideCancelled` sale en PASSENGER-TRIP-1: la pasajera ya puede cancelar la
  // busqueda, con la confirmacion del servidor y sin limpiar nada por su
  // cuenta. Siguen vedados los que mueven un viaje sin pantalla propia.
  //
  // `tripStatusUpdated` sale en TRIP-LIFECYCLE-ACTIONS-1, que es la fase que le
  // da su superficie: un boton por estado --llegue, arranco, termino--, con el
  // candado del doble toque y el rechazo del servidor contado en pantalla. El
  // veto era justo eso: no emitirlo hasta que hubiera donde pulsarlo y donde
  // leer que no salio.
  //
  // `chat:send_message` sale en CHAT-PASSENGER-DRIVER-1: la conversacion del
  // viaje ya tiene pantalla, con su acuse por el socket y su clave de intento
  // para que un reintento no salga dos veces.
  //
  // Siguen vedados `rideRequested` --lo emite el servidor, no el telefono-- y
  // la calificacion, que no tiene pantalla todavia.
  const prohibidos = [
    'rideRequested',
    'tripRated'
  ];

  for (const carpeta of carpetas) {
    for (const nombre of fs.readdirSync(path.join(raizMovil, carpeta), { recursive: true })) {
      const completa = path.join(raizMovil, carpeta, String(nombre));
      if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
      // El inventario los NOMBRA a propósito; nombrarlos no es emitirlos.
      if (completa.endsWith(path.join('realtime', 'eventos.ts'))) continue;

      const codigo = despojarComentarios(fs.readFileSync(completa, 'utf8'));
      for (const evento of prohibidos) {
        assert.equal(
          new RegExp(`emit\\(['"\`]${evento}`).test(codigo), false,
          `${nombre} emite «${evento}»`
        );
      }
    }
  }

  // Y el transporte no expone una forma GENERICA de emitir.
  //
  // Esta linea prohibia cualquier `.emit(`. Dejo de valer cuando el dueno
  // autorizo la ubicacion: ahora hay dos emisores, pero siguen siendo dos
  // funciones concretas con su nombre de evento escrito. La defensa que
  // importa es que nadie pueda mandar un evento ARBITRARIO — con un
  // `emitir(evento, payload)` la lista de lo que este cliente es capaz de
  // decir dejaria de poder leerse en ningun sitio.
  const transporte = sinComentarios('realtime/socket.ts');

  assert.equal(/export function emitir\b|export function emit\b/.test(transporte), false,
    'el transporte expone un emisor generico');

  // Cada emision lleva su evento escrito, nunca una variable.
  const emisiones = transporte.match(/\.emit\(([^,)]+)/g) ?? [];
  for (const emision of emisiones) {
    assert.match(emision, /\.emit\('[a-zA-Z:_]+'/,
      `hay una emision con el evento en una variable: ${emision}`);
  }

  // Y son exactamente las autorizadas.
  const eventosEmitidos = emisiones.map(e => e.replace(/\.emit\('/, '').replace(/'$/, ''));
  // `rideCancelled` entra en PASSENGER-TRIP-1: la pasajera cancela su propia
  // busqueda.
  //
  // `rideAccepted` y `rideRejected` entran en DISPATCH-DRIVER-SURFACES-1, cada
  // uno en su funcion concreta --`aceptarCarrera`, `rechazarCarrera`-- con su
  // evento escrito y sin identidad en el payload: el servidor la saca de la
  // sesion firmada.
  //
  // `tripStatusUpdated` entra en TRIP-LIFECYCLE-ACTIONS-1, en
  // `cambiarEstadoDeCarrera`, con el mismo trato: evento escrito, sin identidad
  // en el payload, y con el servidor comprobando que quien lo pide es el
  // conductor asignado y que el salto es legal desde el estado actual.
  //
  // `chat:send_message` entra en CHAT-PASSENGER-DRIVER-1, en
  // `enviarMensajeDeChat`: evento escrito, sin identidad en el payload, y con
  // la clave del intento para que el servidor reconozca un reintento.
  assert.deepEqual(eventosEmitidos.sort(), [
    'chat:send_message',
    'driver:connect', 'driver:location', 'driver:status', 'passenger:location_update',
    'rideAccepted', 'rideCancelled', 'rideRejected', 'tripStatusUpdated'
  ]);
});

test('el inventario separa lo conectado de lo pendiente', () => {
  // Ninguno de los pendientes se escucha todavía. Los cuatro de ubicacion
  // salieron de esa lista en LOCATION-INTEGRATION-1B porque ya tienen
  // consumidor: nombrar un evento no lo activa, conectarlo si.
  for (const pendiente of EVENTOS_PENDIENTES) {
    assert.equal(EVENTOS_DEL_SERVIDOR.includes(pendiente), false, `«${pendiente}» ya se escucha`);
  }
  assert.ok(EVENTOS_DEL_CLIENTE.includes('join:room'), 'falta el único que el servidor acepta sin más');
});

test('el recorrido de diseño NO abre socket', () => {
  // Se comprueba por la RUTA, no sólo por si hay sesión: alguien con sesión
  // abierta puede entrar ahí a mirar el diseño.
  const proveedor = sinComentarios('realtime/ProveedorDeTiempoReal.tsx');
  assert.match(proveedor, /ZONAS_SIN_TIEMPO_REAL = \['diseno', 'preview'\]/);
  assert.match(proveedor, /!enLaMaqueta/);

  // Y ninguna pantalla del recorrido toca el tiempo real.
  for (const nombre of fs.readdirSync(path.join(raizMovil, 'app/diseno'), { recursive: true })) {
    const completa = path.join(raizMovil, 'app/diseno', String(nombre));
    if (!fs.statSync(completa).isFile() || !/\.tsx?$/.test(completa)) continue;
    assert.equal(
      /realtime|socket/i.test(fs.readFileSync(completa, 'utf8')), false,
      `app/diseno/${nombre} toca el tiempo real`
    );
  }
});

test('no se inventan salas', () => {
  // El servidor sólo admite las dos que él mismo asignó.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  assert.match(servidor, /const allowedRooms = \[`\$\{socket\.data\.auth\.role\}s`, `user:\$\{socket\.data\.auth\.userId\}`\]/);

  const cliente = sinComentarios('realtime/socket.ts');
  assert.equal(/join:room|\.join\(/.test(cliente), false, 'el cliente pide salas por su cuenta');
});
