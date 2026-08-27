import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import webpush from 'web-push';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Contrato de la API de suscripciones de Web Push.
 *
 * La regla que se protege por encima de todas: el propietario de una
 * suscripcion sale SIEMPRE del token, nunca del cuerpo. Varias pruebas de aqui
 * existen solo para demostrar que no hay ninguna forma de suscribir a otra
 * persona, ni siquiera enviando su identificador a proposito.
 *
 * Ninguna prueba contacta con un proveedor real ni necesita claves VAPID: en
 * PUSH-1 el servicio no tiene adaptador de envio.
 */

const ENDPOINT_BASE = 'https://fcm.googleapis.com/fcm/send/token-de-prueba';
const CLAVES = { p256dh: 'BFakeKeyMaterialParaPruebas0123', auth: 'YXV0aC1kZS1wcnVlYmE' };

let puertoSiguiente = 11700;

/**
 * Claves VAPID de usar y tirar, generadas en memoria al arrancar la suite.
 *
 * Desde PUSH-4A, encender `WEB_PUSH_ENABLED` sin una configuracion VAPID
 * valida deja push APAGADO a proposito: aceptar endpoints para una
 * funcionalidad que no puede entregar seria acumular material sensible a
 * cambio de nada. Estas pruebas necesitan push realmente encendido, asi que
 * aportan una configuracion valida.
 *
 * Se generan en el momento y nunca se escriben en disco: no hay ningun
 * material de clave en el repositorio. `generateVAPIDKeys` es criptografia
 * local, sin una sola peticion de red.
 */
const VAPID = webpush.generateVAPIDKeys();
const VAPID_SUBJECT = 'mailto:pruebas@ejemplo.local';

async function startServer(t, { env = {}, dataFile } = {}) {
  const tempDir = dataFile ? null : await mkdtemp(path.join(tmpdir(), 'plus58express-push-'));
  const ruta = dataFile || path.join(tempDir, 'database.sqlite');
  const port = puertoSiguiente++;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: ruta,
      JWT_SECRET: 'push-test-secret',
      WEB_PUSH_ENABLED: 'true',
      WEB_PUSH_VAPID_PUBLIC_KEY: VAPID.publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: VAPID.privateKey,
      WEB_PUSH_VAPID_SUBJECT: VAPID_SUBJECT,
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // La salida se captura UNA sola vez, al lanzar. Comprobar `child.exitCode`
  // para hacer idempotente el cierre no sirve: cuando el proceso muere por una
  // senal, `exitCode` sigue siendo null --lo que se rellena es `signalCode`--,
  // asi que un segundo cierre volveria a esperar un evento `exit` que ya
  // ocurrio y no se repetira. Con la promesa unica, parar dos veces es
  // inofensivo.
  const salida = new Promise(resolve => child.once('exit', resolve));
  const parar = async () => { child.kill(); await salida; };
  t.after(parar);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 15000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, dataFile: ruta, parar };
}

const pedir = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
});

let contadorCuentas = 0;
/** Registra un pasajero nuevo y devuelve su token e identificador. */
async function nuevaCuenta(url) {
  contadorCuentas += 1;
  const sufijo = `${Date.now()}${contadorCuentas}`;
  const respuesta = await pedir(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Persona',
      lastName: 'Prueba',
      email: `push${sufijo}@ejemplo.com`,
      phone: `+58 414${String(sufijo).slice(-7)}`,
      password: 'password123'
    })
  });
  assert.equal(respuesta.status, 201, 'el registro debía funcionar');
  const cuerpo = await respuesta.json();
  return { token: cuerpo.token, id: cuerpo.user.id };
}

const suscribir = (url, token, cuerpo) => pedir(`${url}/api/push/subscriptions`, token, {
  method: 'POST',
  body: JSON.stringify(cuerpo)
});

const suscripcionValida = (sufijo = '') => ({
  endpoint: `${ENDPOINT_BASE}${sufijo}`,
  keys: { ...CLAVES }
});

/** Lee la colección persistida directamente del SQLite del servidor. */
function leerSuscripciones(dataFile) {
  const sqlite = new DatabaseSync(dataFile);
  try {
    return sqlite.prepare('SELECT payload FROM pushSubscriptions').all().map(fila => JSON.parse(fila.payload));
  } finally {
    sqlite.close();
  }
}

// --------------------------------------------------------------------------
// Autenticación
// --------------------------------------------------------------------------

test('sin token no se puede consultar ni suscribir ni darse de baja', async (t) => {
  const { url } = await startServer(t);

  assert.equal((await pedir(`${url}/api/push/public-key`, null)).status, 401);
  assert.equal((await suscribir(url, null, suscripcionValida())).status, 401);
  assert.equal((await pedir(`${url}/api/push/subscriptions/sub_x`, null, { method: 'DELETE' })).status, 401);
});

test('una cuenta deshabilitada no puede suscribirse aunque su token siga siendo válido', async (t) => {
  // El token es un JWT de siete días: sigue verificando. Lo que corta el paso
  // es que `requireAuth` recarga el usuario de la base en cada petición.
  const primero = await startServer(t);
  const cuenta = await nuevaCuenta(primero.url);
  assert.equal((await suscribir(primero.url, cuenta.token, suscripcionValida('-antes'))).status, 201);
  await primero.parar();

  const sqlite = new DatabaseSync(primero.dataFile);
  const fila = sqlite.prepare('SELECT payload FROM users WHERE id = ?').get(cuenta.id);
  const usuario = JSON.parse(fila.payload);
  usuario.accountStatus = 'DISABLED';
  sqlite.prepare('UPDATE users SET payload = ? WHERE id = ?').run(JSON.stringify(usuario), cuenta.id);
  sqlite.close();

  const segundo = await startServer(t, { dataFile: primero.dataFile });
  const respuesta = await suscribir(segundo.url, cuenta.token, suscripcionValida('-despues'));
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).error, 'ACCOUNT_DISABLED');
});

// --------------------------------------------------------------------------
// La bandera
// --------------------------------------------------------------------------

test('con la funcionalidad apagada no se registra, pero sí se puede revocar', async (t) => {
  const encendido = await startServer(t);
  const cuenta = await nuevaCuenta(encendido.url);
  const alta = await suscribir(encendido.url, cuenta.token, suscripcionValida('-flag'));
  assert.equal(alta.status, 201);
  const suscripcionId = (await alta.json()).id;
  await encendido.parar();

  // Sin la variable definida: la ausencia debe comportarse como apagado.
  const apagado = await startServer(t, { dataFile: encendido.dataFile, env: { WEB_PUSH_ENABLED: '' } });

  const clave = await pedir(`${apagado.url}/api/push/public-key`, cuenta.token);
  assert.equal(clave.status, 200);
  assert.deepEqual(await clave.json(), { enabled: false, publicKey: null });

  const rechazada = await suscribir(apagado.url, cuenta.token, suscripcionValida('-flag2'));
  assert.equal(rechazada.status, 503);
  assert.equal((await rechazada.json()).error, 'PUSH_DISABLED');

  // Revocar NO está sujeto a la bandera: retirar el consentimiento no puede
  // depender de que la funcionalidad esté encendida.
  const baja = await pedir(`${apagado.url}/api/push/subscriptions/${suscripcionId}`, cuenta.token, { method: 'DELETE' });
  assert.equal(baja.status, 204, 'darse de baja debe funcionar siempre');
});

// --------------------------------------------------------------------------
// Validación
// --------------------------------------------------------------------------

test('una suscripción malformada se rechaza con 400 y no escribe nada', async (t) => {
  const { url, dataFile } = await startServer(t);
  const cuenta = await nuevaCuenta(url);

  const invalidas = [
    {},
    { keys: CLAVES },                                             // sin endpoint
    { endpoint: '', keys: CLAVES },
    { endpoint: `${ENDPOINT_BASE}`, },                            // sin keys
    { endpoint: `${ENDPOINT_BASE}`, keys: {} },
    { endpoint: `${ENDPOINT_BASE}`, keys: { auth: CLAVES.auth } },   // sin p256dh
    { endpoint: `${ENDPOINT_BASE}`, keys: { p256dh: CLAVES.p256dh } }, // sin auth
    { endpoint: `${ENDPOINT_BASE}`, keys: { p256dh: 'no válido!', auth: CLAVES.auth } },
    { endpoint: 'http://inseguro.example.com/push', keys: CLAVES }, // no https
    { endpoint: 'no-es-una-url', keys: CLAVES },
    { endpoint: `https://ejemplo.com/${'x'.repeat(2100)}`, keys: CLAVES }
  ];

  for (const cuerpo of invalidas) {
    const respuesta = await suscribir(url, cuenta.token, cuerpo);
    assert.equal(respuesta.status, 400, `debía rechazarse: ${JSON.stringify(cuerpo).slice(0, 70)}`);
    assert.equal((await respuesta.json()).error, 'INVALID_SUBSCRIPTION');
  }

  assert.equal(leerSuscripciones(dataFile).length, 0, 'ninguna entrada inválida pudo escribirse');
});

// --------------------------------------------------------------------------
// Propiedad: la regla central
// --------------------------------------------------------------------------

test('el propietario sale del token y un userId del cuerpo se ignora', async (t) => {
  const { url, dataFile } = await startServer(t);
  const victima = await nuevaCuenta(url);
  const atacante = await nuevaCuenta(url);

  const respuesta = await suscribir(url, atacante.token, {
    ...suscripcionValida('-suplantacion'),
    // Intento explícito de suscribir a otra persona.
    userId: victima.id,
    owner: victima.id,
    user: { id: victima.id }
  });
  assert.equal(respuesta.status, 201);

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].userId, atacante.id, 'el dueño debe ser quien presentó el token');
  assert.notEqual(guardadas[0].userId, victima.id);
});

test('la respuesta nunca devuelve el endpoint ni el material de claves', async (t) => {
  const { url } = await startServer(t);
  const cuenta = await nuevaCuenta(url);

  const respuesta = await suscribir(url, cuenta.token, suscripcionValida('-privacidad'));
  const texto = await respuesta.text();

  for (const secreto of [ENDPOINT_BASE, CLAVES.p256dh, CLAVES.auth, 'endpoint', 'p256dh', 'auth']) {
    assert.ok(!texto.includes(secreto), `la respuesta expone: ${secreto}`);
  }
  const cuerpo = JSON.parse(texto);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['active', 'createdAt', 'id', 'lastSeenAt', 'updatedAt']);
});

// --------------------------------------------------------------------------
// Unicidad del endpoint
// --------------------------------------------------------------------------

test('una persona con tres dispositivos tiene tres suscripciones', async (t) => {
  const { url, dataFile } = await startServer(t);
  const cuenta = await nuevaCuenta(url);

  for (const sufijo of ['-movil', '-tablet', '-escritorio']) {
    assert.equal((await suscribir(url, cuenta.token, suscripcionValida(sufijo))).status, 201);
  }

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas.length, 3);
  assert.equal(new Set(guardadas.map(item => item.endpoint)).size, 3);
  assert.ok(guardadas.every(item => item.userId === cuenta.id));
});

test('repetir el mismo endpoint actualiza en vez de duplicar', async (t) => {
  const { url, dataFile } = await startServer(t);
  const cuenta = await nuevaCuenta(url);

  const primera = await suscribir(url, cuenta.token, suscripcionValida('-idempotente'));
  assert.equal(primera.status, 201);
  const idOriginal = (await primera.json()).id;

  const segunda = await suscribir(url, cuenta.token, suscripcionValida('-idempotente'));
  // 200, no 201: no se ha creado nada nuevo.
  assert.equal(segunda.status, 200);
  const cuerpo = await segunda.json();
  assert.equal(cuerpo.id, idOriginal, 'debe conservar el mismo identificador');

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas.length, 1, 'una sola fila lógica');
});

test('un endpoint reutilizado por otra cuenta cambia de dueño y no se duplica', async (t) => {
  // El caso realista: un teléfono que cambia de manos. Si quedaran dos filas
  // vivas con el mismo endpoint, el conductor nuevo recibiría las carreras del
  // anterior.
  const { url, dataFile } = await startServer(t);
  const anterior = await nuevaCuenta(url);
  const nuevo = await nuevaCuenta(url);

  assert.equal((await suscribir(url, anterior.token, suscripcionValida('-telefono'))).status, 201);
  const traspaso = await suscribir(url, nuevo.token, suscripcionValida('-telefono'));
  assert.equal(traspaso.status, 200);

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas.length, 1, 'exactamente una fila lógica para ese endpoint');
  assert.equal(guardadas[0].userId, nuevo.id, 'el dueño es la última cuenta autenticada');
  assert.equal(guardadas[0].disabledAt, null);
});

// --------------------------------------------------------------------------
// Baja
// --------------------------------------------------------------------------

test('darse de baja desactiva de forma lógica y conserva la fila', async (t) => {
  const { url, dataFile } = await startServer(t);
  const cuenta = await nuevaCuenta(url);

  const alta = await suscribir(url, cuenta.token, suscripcionValida('-baja'));
  const suscripcionId = (await alta.json()).id;

  const baja = await pedir(`${url}/api/push/subscriptions/${suscripcionId}`, cuenta.token, { method: 'DELETE' });
  assert.equal(baja.status, 204);

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas.length, 1, 'la fila se conserva: la baja es lógica, no física');
  assert.ok(guardadas[0].disabledAt, 'debe quedar marcada la fecha de baja');
  assert.equal(guardadas[0].disabledReason, 'USER_REVOKED');

  // Ya inactiva: repetir la baja responde como si no existiera.
  const repetida = await pedir(`${url}/api/push/subscriptions/${suscripcionId}`, cuenta.token, { method: 'DELETE' });
  assert.equal(repetida.status, 404);
});

test('nadie puede dar de baja la suscripción de otra persona, y no se filtra su existencia', async (t) => {
  const { url, dataFile } = await startServer(t);
  const duena = await nuevaCuenta(url);
  const ajena = await nuevaCuenta(url);

  const alta = await suscribir(url, duena.token, suscripcionValida('-ajena'));
  const suscripcionId = (await alta.json()).id;

  const intruso = await pedir(`${url}/api/push/subscriptions/${suscripcionId}`, ajena.token, { method: 'DELETE' });
  const inexistente = await pedir(`${url}/api/push/subscriptions/sub_no-existe`, ajena.token, { method: 'DELETE' });

  assert.equal(intruso.status, 404, 'la de otra persona responde 404');
  assert.equal(inexistente.status, 404, 'una inexistente responde igual');
  // Idéntica respuesta: distinguirlas permitiría sondear qué identificadores
  // existen.
  assert.deepEqual(await intruso.json(), await inexistente.json());

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas[0].disabledAt, null, 'la suscripción de la dueña sigue viva');
});

test('volver a registrar un endpoint revocado lo resucita sin crear otra fila', async (t) => {
  const { url, dataFile } = await startServer(t);
  const cuenta = await nuevaCuenta(url);

  const alta = await suscribir(url, cuenta.token, suscripcionValida('-resucita'));
  const suscripcionId = (await alta.json()).id;
  await pedir(`${url}/api/push/subscriptions/${suscripcionId}`, cuenta.token, { method: 'DELETE' });
  assert.ok(leerSuscripciones(dataFile)[0].disabledAt, 'quedó de baja');

  const revivida = await suscribir(url, cuenta.token, suscripcionValida('-resucita'));
  assert.equal(revivida.status, 200);

  const guardadas = leerSuscripciones(dataFile);
  assert.equal(guardadas.length, 1, 'sigue habiendo una sola fila');
  assert.equal(guardadas[0].disabledAt, null, 'el navegador acaba de demostrar que sigue viva');
  assert.equal(guardadas[0].disabledReason, null);
});

// --------------------------------------------------------------------------
// Clave pública
// --------------------------------------------------------------------------

test('la clave pública informa del estado sin exponer configuración privada', async (t) => {
  const { url } = await startServer(t, {
    env: {
      WEB_PUSH_ENABLED: 'true',
      WEB_PUSH_VAPID_PUBLIC_KEY: VAPID.publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: VAPID.privateKey,
      WEB_PUSH_VAPID_SUBJECT: VAPID_SUBJECT
    }
  });
  const cuenta = await nuevaCuenta(url);

  const respuesta = await pedir(`${url}/api/push/public-key`, cuenta.token);
  assert.equal(respuesta.status, 200);
  const texto = await respuesta.text();

  assert.ok(!texto.includes(VAPID.privateKey), 'la clave privada no puede salir jamás');
  const cuerpo = JSON.parse(texto);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['enabled', 'publicKey']);
  assert.equal(cuerpo.enabled, true);
  assert.equal(cuerpo.publicKey, VAPID.publicKey);
});

// --------------------------------------------------------------------------
// Límite de frecuencia
// --------------------------------------------------------------------------

test('el limitador de suscripciones corta a las veinte peticiones por cuenta', async (t) => {
  const { url } = await startServer(t);
  const cuenta = await nuevaCuenta(url);
  const otra = await nuevaCuenta(url);

  let ultima = null;
  for (let intento = 0; intento < 21; intento += 1) {
    ultima = await suscribir(url, cuenta.token, suscripcionValida(`-ritmo${intento}`));
  }

  assert.equal(ultima.status, 429, 'la vigesimoprimera debía cortarse');
  const cuerpo = await ultima.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'suscripciones', 'el límite tocado se identifica en la respuesta');

  // El techo es por cuenta, no global: otra persona no queda castigada.
  const ajena = await suscribir(url, otra.token, suscripcionValida('-otra-cuenta'));
  assert.equal(ajena.status, 201, 'el límite de una cuenta no puede afectar a otra');
});
