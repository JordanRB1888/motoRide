import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALCANCE_POR_OMISION,
  MAPS_AUTH_ERROR,
  MODO_DE_AUTH,
  crearAuthDeMaps,
  validarCuentaDeServicio
} from '../services/googleMapsAuth.js';
import { createRouteMatrixClient, ROUTE_MATRIX_ERROR } from '../services/routeMatrixClient.js';
import { createRouteGeometryClient, ROUTE_GEOMETRY_ERROR } from '../services/routeGeometryClient.js';

/**
 * LA AUTENTICACIÓN DE GOOGLE MAPS EN EL SERVIDOR
 *
 * QUÉ SE PROTEGE
 *
 * 1. Que las llamadas de servidor NO dependan de la IP pública. Aquí la pone
 *    una VPN y cambia sola; con clave restringida por IP, cada cambio dejaba
 *    el cálculo de distancia y tiempo fuera de juego.
 * 2. Que el token se pida UNA vez y se renueve antes de caducar, no en cada
 *    llamada: el ranking del despacho tiene 1,5 s para responder.
 * 3. Que ni el token, ni la clave privada, ni la clave de API aparezcan jamás
 *    en un registro.
 * 4. Que un fallo de autenticación degrade como cualquier otro fallo del
 *    proveedor, sin colgar el despacho.
 */

const PAR = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CUENTA = Object.freeze({
  type: 'service_account',
  project_id: 'proyecto-de-prueba',
  client_email: 'maps@proyecto-de-prueba.iam.gserviceaccount.com',
  private_key: PAR.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token'
});

const TOKEN = 'ya29.token-de-prueba-que-no-debe-salir-en-ningun-registro';

/** Una red de mentira que contesta al OAuth y a Routes, y recuerda lo que vio. */
function redFalsa({ oauth = { status: 200, expiresIn: 3600 }, api = { status: 200, cuerpo: {} } } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, opciones = {}) => {
    const destino = String(url);
    llamadas.push({ url: destino, opciones });
    if (destino.includes('oauth2.googleapis.com')) {
      return {
        ok: oauth.status === 200,
        status: oauth.status,
        json: async () => (oauth.status === 200
          ? { access_token: TOKEN, expires_in: oauth.expiresIn }
          : { error: 'invalid_grant' })
      };
    }
    return { ok: api.status === 200, status: api.status, json: async () => api.cuerpo };
  };
  return { fetchImpl, llamadas };
}

const alOauth = llamadas => llamadas.filter(l => l.url.includes('oauth2.googleapis.com'));
const aGoogleMaps = llamadas => llamadas.filter(l => !l.url.includes('oauth2.googleapis.com'));

// ---------------------------------------------------------------------------
// El modo
// ---------------------------------------------------------------------------

test('con cuenta de servicio se autentica por OAuth, y eso NO depende de la IP', () => {
  const auth = crearAuthDeMaps({ cuenta: CUENTA, apiKey: 'clave-que-no-deberia-usarse' });
  assert.equal(auth.modo, MODO_DE_AUTH.OAUTH);
  assert.equal(auth.dependeDeLaIp, false, 'con OAuth no puede depender de la IP');
  assert.equal(auth.estaConfigurado(), true);
});

test('sin cuenta de servicio se cae a la clave, y eso SÍ depende de la IP', () => {
  const auth = crearAuthDeMaps({ rutaDeLaCuenta: null, apiKey: 'clave-de-respaldo' });
  assert.equal(auth.modo, MODO_DE_AUTH.API_KEY);
  assert.equal(auth.dependeDeLaIp, true, 'la clave está restringida por IP: hay que decirlo');
  assert.equal(auth.estaConfigurado(), true);
});

test('sin nada, no se finge que hay con qué llamar', () => {
  const auth = crearAuthDeMaps({ rutaDeLaCuenta: null, apiKey: '' });
  assert.equal(auth.modo, MODO_DE_AUTH.SIN_CONFIGURAR);
  assert.equal(auth.estaConfigurado(), false);
});

test('la cuenta de servicio se comprueba entera; media cuenta no vale', () => {
  assert.throws(() => validarCuentaDeServicio({ ...CUENTA, type: 'usuario' }), /MAPS_SERVICE_ACCOUNT_INVALID/);
  assert.throws(() => validarCuentaDeServicio({ ...CUENTA, private_key: 'no-es-una-clave' }), /MAPS_SERVICE_ACCOUNT_INVALID/);
  assert.throws(() => validarCuentaDeServicio({ ...CUENTA, token_uri: 'http://inseguro' }), /MAPS_SERVICE_ACCOUNT_INVALID/);
  assert.throws(() => validarCuentaDeServicio(null), /MAPS_SERVICE_ACCOUNT_INVALID/);
});

// ---------------------------------------------------------------------------
// El token
// ---------------------------------------------------------------------------

test('las cabeceras llevan el token, y con clave llevan la clave', async () => {
  const { fetchImpl } = redFalsa();
  const conOauth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl });
  assert.deepEqual(await conOauth.cabeceras(), { Authorization: `Bearer ${TOKEN}` });

  const conClave = crearAuthDeMaps({ rutaDeLaCuenta: null, apiKey: 'clave-x' });
  assert.deepEqual(await conClave.cabeceras(), { 'X-Goog-Api-Key': 'clave-x' });
});

test('el token se pide UNA vez y se reutiliza', async () => {
  // El ranking del despacho tiene 1,5 s para contestar: pedir un token en cada
  // llamada se comería la ventana.
  const { fetchImpl, llamadas } = redFalsa();
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl });
  await auth.cabeceras();
  await auth.cabeceras();
  await auth.cabeceras();
  assert.equal(alOauth(llamadas).length, 1, 'se pidió más de un token para tres llamadas');
});

test('el token se renueva ANTES de caducar, no cuando ya caducó', async () => {
  // Un token que caduca a mitad de vuelo es una ruta perdida. Se renueva con un
  // minuto de margen, que también cubre un reloj algo adelantado.
  let reloj = 1_000_000;
  const { fetchImpl, llamadas } = redFalsa({ oauth: { status: 200, expiresIn: 3600 } });
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl, now: () => reloj });

  await auth.cabeceras();
  assert.equal(alOauth(llamadas).length, 1);

  // A falta de dos minutos todavía sirve.
  reloj += (3600 - 120) * 1000;
  await auth.cabeceras();
  assert.equal(alOauth(llamadas).length, 1, 'se renovó antes de tiempo');

  // A falta de treinta segundos ya no: se pide uno nuevo.
  reloj += 90 * 1000;
  await auth.cabeceras();
  assert.equal(alOauth(llamadas).length, 2, 'no se renovó dentro del margen');
});

test('el alcance que se firma es el que se configuró', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl });
  await auth.cabeceras();

  const peticion = alOauth(llamadas)[0];
  const asercion = new URLSearchParams(peticion.opciones.body).get('assertion');
  const carga = JSON.parse(Buffer.from(asercion.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(carga.scope, ALCANCE_POR_OMISION);
  assert.equal(carga.iss, CUENTA.client_email);
  assert.equal(carga.aud, CUENTA.token_uri);
});

test('si Google rechaza la cuenta, se falla con un código y sin contar por qué', async () => {
  const errores = [];
  const { fetchImpl } = redFalsa({ oauth: { status: 400 } });
  const auth = crearAuthDeMaps({
    cuenta: CUENTA,
    fetchImpl,
    logger: { error: m => errores.push(String(m)) }
  });
  await assert.rejects(() => auth.cabeceras(), new RegExp(MAPS_AUTH_ERROR.AUTH_FAILED));
  assert.ok(errores.length > 0, 'un fallo de credencial tiene que registrarse');
  for (const linea of errores) {
    assert.equal(linea.includes(CUENTA.private_key.slice(0, 40)), false, 'la clave privada acabó en el registro');
    assert.equal(linea.includes(TOKEN), false, 'el token acabó en el registro');
  }
});

// ---------------------------------------------------------------------------
// Los clientes de Routes
// ---------------------------------------------------------------------------

test('Route Matrix llama con el token y NO manda la clave', async () => {
  const { fetchImpl, llamadas } = redFalsa({
    api: { status: 200, cuerpo: [{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 1200, duration: '300s' }] }
  });
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl, apiKey: 'clave-que-no-debe-viajar' });
  const cliente = createRouteMatrixClient({ auth, fetchImpl });

  assert.equal(cliente.isConfigured(), true);
  assert.equal(cliente.authMode, MODO_DE_AUTH.OAUTH);
  await cliente.computeToPickup([{ lat: 10.64, lng: -71.61 }], { lat: 10.66, lng: -71.60 });

  const llamada = aGoogleMaps(llamadas)[0];
  assert.match(llamada.url, /computeRouteMatrix/);
  assert.equal(llamada.opciones.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(llamada.opciones.headers['X-Goog-Api-Key'], undefined, 'viajó la clave además del token');
  // La máscara de campos no se toca: de ella dependen el ETA y la distancia.
  assert.match(llamada.opciones.headers['X-Goog-FieldMask'], /originIndex/);
});

test('la geometría de la ruta llama con el token y conserva su máscara', async () => {
  const { fetchImpl, llamadas } = redFalsa({
    api: { status: 200, cuerpo: { routes: [{ polyline: { encodedPolyline: 'a~l~Fjk~uOwHJy@P' }, distanceMeters: 900, duration: '240s' }] } }
  });
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl });
  const cliente = createRouteGeometryClient({ auth, fetchImpl });

  assert.equal(cliente.authMode, MODO_DE_AUTH.OAUTH);
  await cliente.computeRoute({ lat: 10.64, lng: -71.61 }, { lat: 10.66, lng: -71.60 });

  const llamada = aGoogleMaps(llamadas)[0];
  assert.match(llamada.url, /computeRoutes/);
  assert.equal(llamada.opciones.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(llamada.opciones.headers['X-Goog-Api-Key'], undefined);
  assert.match(llamada.opciones.headers['X-Goog-FieldMask'], /encodedPolyline/);
});

test('sin cuenta de servicio los dos clientes siguen funcionando con la clave', async () => {
  // El respaldo existe porque quedarse sin rutas es peor que depender de la IP.
  // Lo que no puede es ser silencioso: `authMode` lo dice.
  const { fetchImpl, llamadas } = redFalsa({
    api: { status: 200, cuerpo: [{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 800, duration: '120s' }] }
  });
  const cliente = createRouteMatrixClient({ auth: crearAuthDeMaps({ rutaDeLaCuenta: null, apiKey: 'clave-de-respaldo' }), fetchImpl });

  assert.equal(cliente.authMode, MODO_DE_AUTH.API_KEY);
  await cliente.computeToPickup([{ lat: 10.64, lng: -71.61 }], { lat: 10.66, lng: -71.60 });

  const llamada = aGoogleMaps(llamadas)[0];
  assert.equal(llamada.opciones.headers['X-Goog-Api-Key'], 'clave-de-respaldo');
  assert.equal(llamada.opciones.headers.Authorization, undefined);
  assert.equal(alOauth(llamadas).length, 0, 'sin cuenta no hay token que pedir');
});

test('un fallo de autenticación degrada como el resto: no cuelga el despacho', async () => {
  const { fetchImpl } = redFalsa({ oauth: { status: 401 } });
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl, logger: { error() {} } });

  const matrix = createRouteMatrixClient({ auth, fetchImpl, logger: { warn() {} } });
  await assert.rejects(
    () => matrix.computeToPickup([{ lat: 10.64, lng: -71.61 }], { lat: 10.66, lng: -71.60 }),
    new RegExp(ROUTE_MATRIX_ERROR.PROVIDER_ERROR)
  );

  const geometria = createRouteGeometryClient({ auth, fetchImpl, logger: { warn() {} } });
  await assert.rejects(
    () => geometria.computeRoute({ lat: 10.64, lng: -71.61 }, { lat: 10.66, lng: -71.60 }),
    new RegExp(ROUTE_GEOMETRY_ERROR.PROVIDER_ERROR)
  );
});

// ---------------------------------------------------------------------------
// Nada de esto puede filtrarse
// ---------------------------------------------------------------------------

test('la credencial de Maps no puede entrar en Git', () => {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const raiz = path.resolve(aqui, '..', '..');
  const ignorados = fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8');
  assert.match(ignorados, /^maps-service-account\.json$/m);
});

test('el servidor dice con qué se está autenticando al arrancar', () => {
  // En `api-key` las rutas dependen de una IP que aquí mueve la VPN. Quien vea
  // rutas cayendo sin motivo tiene que poder mirar el registro y entenderlo.
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const indice = fs.readFileSync(path.join(aqui, '..', 'index.js'), 'utf8');
  assert.match(indice, /const authDeMaps = crearAuthDeMaps\(/);
  assert.match(indice, /createRouteMatrixClient\(\{ auth: authDeMaps/);
  assert.match(indice, /createRouteGeometryClient\(\{ auth: authDeMaps/);
  assert.match(indice, /OAuth con cuenta de servicio \(no depende de la IP\)/);
  assert.match(indice, /depende de la IP permitida en Google Cloud/);
});

test('la autoridad de auth es UNA, no una por cliente', () => {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const servicios = path.join(aqui, '..', 'services');
  // Ningún cliente puede volver a poner la cabecera de la clave por su cuenta.
  for (const fichero of ['routeMatrixClient.js', 'routeGeometryClient.js']) {
    const fuente = fs.readFileSync(path.join(servicios, fichero), 'utf8');
    assert.equal(
      /'X-Goog-Api-Key':\s*clave/.test(fuente),
      false,
      `${fichero} volvió a autenticarse por su cuenta`
    );
    assert.match(fuente, /await auth\.cabeceras\(\)/);
  }
});

test('los clientes se construyen sin que nadie les inyecte la autoridad', () => {
  // El servidor les pasa la compartida, pero el valor por omisión tiene que
  // funcionar: si no, el fallo aparece en producción y no en las pruebas.
  const antes = {
    clave: process.env.DISPATCH_ROUTES_API_KEY,
    cuenta: process.env.GOOGLE_MAPS_SERVICE_ACCOUNT_FILE
  };
  process.env.DISPATCH_ROUTES_API_KEY = 'clave-del-entorno';
  // Una ruta que no existe a propósito: la cuenta REAL puede estar en disco y
  // ninguna prueba puede depender de si está o no.
  process.env.GOOGLE_MAPS_SERVICE_ACCOUNT_FILE = path.join(
    path.dirname(fileURLToPath(import.meta.url)), 'no-existe-esta-cuenta.json'
  );
  try {
    assert.equal(createRouteMatrixClient().authMode, MODO_DE_AUTH.API_KEY);
    assert.equal(createRouteGeometryClient().authMode, MODO_DE_AUTH.API_KEY);
  } finally {
    for (const [variable, valor] of [
      ['DISPATCH_ROUTES_API_KEY', antes.clave],
      ['GOOGLE_MAPS_SERVICE_ACCOUNT_FILE', antes.cuenta]
    ]) {
      if (valor === undefined) delete process.env[variable];
      else process.env[variable] = valor;
    }
  }
});

// ---------------------------------------------------------------------------
// La credencial en producción
// ---------------------------------------------------------------------------

test('en producción la cuenta puede venir del entorno en base64', async () => {
  // Railway no monta ficheros y la imagen no copia credenciales: la cuenta
  // llega en una sola línea por variable y se decodifica en memoria.
  const { fetchImpl } = redFalsa();
  const auth = crearAuthDeMaps({
    rutaDeLaCuenta: null,
    cuentaEnBase64: Buffer.from(JSON.stringify(CUENTA), 'utf8').toString('base64'),
    fetchImpl
  });
  assert.equal(auth.modo, MODO_DE_AUTH.OAUTH);
  assert.equal(auth.dependeDeLaIp, false);
  assert.deepEqual(await auth.cabeceras(), { Authorization: `Bearer ${TOKEN}` });
});

test('una variable rota no tumba el servidor ni cuenta lo que traía', () => {
  const errores = [];
  const auth = crearAuthDeMaps({
    rutaDeLaCuenta: null,
    cuentaEnBase64: 'esto-no-es-base64-de-un-json',
    apiKey: 'clave-de-respaldo',
    logger: { error: m => errores.push(String(m)) }
  });
  // Cae al respaldo y lo dice, en vez de arrancar creyendo que tiene OAuth.
  assert.equal(auth.modo, MODO_DE_AUTH.API_KEY);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /MAPS_SERVICE_ACCOUNT_(ENV_UNREADABLE|INVALID)/);
  assert.equal(errores[0].includes('esto-no-es-base64'), false, 'el valor de la variable acabó en el registro');
});

test('el fichero manda sobre la variable', () => {
  // En local hay fichero; si además quedó una variable vieja del entorno, no
  // puede ganar la vieja.
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const ruta = path.join(aqui, 'cuenta-de-maps-de-prueba.json');
  fs.writeFileSync(ruta, JSON.stringify(CUENTA), 'utf8');
  try {
    const auth = crearAuthDeMaps({
      rutaDeLaCuenta: ruta,
      cuentaEnBase64: 'valor-roto-que-no-debe-usarse',
      apiKey: ''
    });
    assert.equal(auth.modo, MODO_DE_AUTH.OAUTH);
  } finally {
    fs.rmSync(ruta, { force: true });
  }
});

test('la imagen del servidor no lleva dentro ninguna credencial', () => {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const dockerfile = fs.readFileSync(path.join(aqui, '..', 'Dockerfile'), 'utf8');
  assert.equal(/service-account/.test(dockerfile), false, 'la imagen copia una credencial');
});
