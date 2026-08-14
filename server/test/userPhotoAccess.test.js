import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fixtures sintéticos: cabecera real del formato + relleno. Ninguna imagen real. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(96).fill(0x20)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(96).fill(0x20)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
const TEXTO = Buffer.from('esto no es una imagen aunque lo diga la cabecera');

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-photo-'));
  const port = 9500 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'photo-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', code => reject(new Error(`Servidor finalizó con código ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}` };
}

const asJson = (url, token, options = {}) => fetch(url, {
  ...options,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
});

async function registrar(url, { email, phone, role = 'passenger', firstName = 'Nombre' }) {
  const response = await asJson(`${url}/api/auth/register`, null, {
    method: 'POST',
    body: JSON.stringify({ email, phone, password: 'ClaveSegura123', role, firstName, lastName: 'Apellido' })
  });
  assert.equal(response.status, 201, 'el registro debía completarse');
  return response.json();
}

async function login(url, identifier, password, role) {
  const r = await asJson(`${url}/api/auth/login`, null, { method: 'POST', body: JSON.stringify({ identifier, password, role }) });
  assert.equal(r.status, 200);
  return (await r.json()).token;
}

/** Sube una fotografía y devuelve la respuesta cruda. */
async function subirFoto(url, token, buffer, mimeType, filename = 'foto.png') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  return fetch(`${url}/api/auth/me/photo`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form
  });
}

const pedirFoto = (url, id, token) => fetch(`${url}/api/users/${id}/photo`, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

/** El registro directo solo admite pasajeros: al conductor lo crea administración. */
async function crearConductor(url, adminToken, { email, phone, plate }) {
  const response = await asJson(`${url}/api/admin/drivers`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ email, phone, firstName: 'Conductor', lastName: 'Prueba', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: plate })
  });
  assert.equal(response.status, 201, 'administración debía crear el conductor');
  const account = await response.json();
  return { ...account, token: await login(url, email, account.temporaryPassword, 'driver') };
}

/**
 * Lleva un viaje hasta DRIVER_ASSIGNED por el camino real: el pasajero lo pide,
 * el despacho ofrece y el conductor acepta por Socket.IO. No hay ruta HTTP para
 * aceptar, así que no se puede atajar sin dejar de probar el flujo verdadero.
 */
async function viajeActivo(url, t, pasajero, conductor) {
  const pasajeroSocket = io(url, { auth: { token: pasajero.token } });
  const conductorSocket = io(url, { auth: { token: conductor.token } });
  t.after(() => [pasajeroSocket, conductorSocket].forEach(s => s.close()));

  conductorSocket.on('connect', () => conductorSocket.emit('driver:connect', { userId: conductor.user.id, status: 'AVAILABLE' }));
  conductorSocket.on('driver:connected', () => conductorSocket.emit('driver:location', { latitude: 10.6428, longitude: -71.6126, heading: 0 }));
  conductorSocket.on('rideRequested', trip => conductorSocket.emit('rideAccepted', { tripId: trip.id }));

  await Promise.all([
    new Promise(resolve => pasajeroSocket.on('connect', resolve)),
    new Promise(resolve => conductorSocket.on('driver:connected', resolve))
  ]);
  await new Promise(resolve => setTimeout(resolve, 150));

  const asignado = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El conductor no fue asignado')), 8000);
    // El evento publica el alias heredado en `status` y el valor canónico en
    // `canonicalStatus`: la asignación se reconoce por el segundo.
    pasajeroSocket.on('tripStatusUpdated', update => {
      const canonical = update?.canonicalStatus || update?.status;
      if (canonical === 'DRIVER_ASSIGNED') { clearTimeout(timer); resolve(update); }
    });
  });

  const creado = await asJson(`${url}/api/trips/create`, pasajero.token, {
    method: 'POST',
    body: JSON.stringify({
      pickup: { lat: 10.6428, lng: -71.6126, address: 'Origen de prueba' },
      destination: { lat: 10.68, lng: -71.63, address: 'Destino de prueba' },
      fareUSD: 3.5,
      paymentMethod: 'CASH'
    })
  });
  const cuerpoCreado = await creado.json();
  assert.equal(creado.status, 200, `el viaje debía crearse: ${JSON.stringify(cuerpoCreado)}`);
  assert.equal(cuerpoCreado.status, 'created');
  const trip = cuerpoCreado.trip;
  await asignado;
  return { trip, pasajeroSocket, conductorSocket };
}

test('el titular obtiene su propia fotografía con cabeceras privadas', async (t) => {
  const { url } = await startServer(t);
  const titular = await registrar(url, { email: 'titular@ejemplo.test', phone: '+584141110001' });
  assert.equal((await subirFoto(url, titular.token, PNG, 'image/png')).status, 200);

  const respuesta = await pedirFoto(url, titular.user.id, titular.token);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'image/png');
  assert.equal(respuesta.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  assert.ok(bytes.subarray(0, 8).equals(PNG.subarray(0, 8)), 'devuelve la imagen almacenada');

  // La respuesta no filtra rutas internas ni nombres originales.
  const cabeceras = JSON.stringify([...respuesta.headers]);
  for (const marca of ['storageKey', 'foto.png', 'private-uploads', '/data/']) {
    assert.ok(!cabeceras.includes(marca), `las cabeceras no debían contener: ${marca}`);
  }
});

test('administración obtiene la fotografía sin ningún viaje activo', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const persona = await registrar(url, { email: 'gestion@ejemplo.test', phone: '+584141110002' });
  assert.equal((await subirFoto(url, persona.token, PNG, 'image/png')).status, 200);

  const respuesta = await pedirFoto(url, persona.user.id, adminToken);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('la contraparte accede durante el viaje y deja de acceder al completarlo', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const pasajero = await registrar(url, { email: 'p3003@ejemplo.test', phone: '+584141003003' });
  const conductor = await crearConductor(url, adminToken, { email: 'c3003@ejemplo.test', phone: '+584142003003', plate: 'FOT003' });
  assert.equal((await subirFoto(url, pasajero.token, PNG, 'image/png')).status, 200);
  assert.equal((await subirFoto(url, conductor.token, JPEG, 'image/jpeg', 'foto.jpg')).status, 200);

  const { trip, conductorSocket } = await viajeActivo(url, t, pasajero, conductor);

  // Durante el viaje, ambos participantes se ven.
  assert.equal((await pedirFoto(url, conductor.user.id, pasajero.token)).status, 200, 'el pasajero ve al conductor');
  assert.equal((await pedirFoto(url, pasajero.user.id, conductor.token)).status, 200, 'el conductor ve al pasajero');

  // El conductor cierra el viaje por el mismo canal que usa la aplicación.
  // La máquina de estados no admite saltos: ARRIVED antes de IN_PROGRESS.
  for (const estado of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    conductorSocket.emit('tripStatusUpdated', { tripId: trip.id, status: estado });
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const trasCerrar = await pedirFoto(url, conductor.user.id, pasajero.token);
  assert.equal(trasCerrar.status, 403, 'completado el viaje, el acceso desaparece');
  assert.deepEqual(await trasCerrar.json(), { error: 'PHOTO_FORBIDDEN' });
  assert.equal((await pedirFoto(url, pasajero.user.id, conductor.token)).status, 403);

  // Y cada uno sigue viendo la suya.
  assert.equal((await pedirFoto(url, pasajero.user.id, pasajero.token)).status, 200);
});

test('tras cancelar el viaje la contraparte tampoco accede', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const pasajero = await registrar(url, { email: 'p4004@ejemplo.test', phone: '+584141004004' });
  const conductor = await crearConductor(url, adminToken, { email: 'c4004@ejemplo.test', phone: '+584142004004', plate: 'FOT004' });
  assert.equal((await subirFoto(url, pasajero.token, PNG, 'image/png')).status, 200);
  assert.equal((await subirFoto(url, conductor.token, JPEG, 'image/jpeg', 'foto.jpg')).status, 200);

  const { trip, pasajeroSocket } = await viajeActivo(url, t, pasajero, conductor);
  assert.equal((await pedirFoto(url, conductor.user.id, pasajero.token)).status, 200);

  pasajeroSocket.emit('rideCancelled', { tripId: trip.id, reason: 'Cambio de planes' });
  await new Promise(resolve => setTimeout(resolve, 250));

  assert.equal((await pedirFoto(url, conductor.user.id, pasajero.token)).status, 403);
  assert.equal((await pedirFoto(url, pasajero.user.id, conductor.token)).status, 403);
});

test('un usuario autenticado sin relación recibe 403', async (t) => {
  const { url } = await startServer(t);
  const titular = await registrar(url, { email: 'objetivo@ejemplo.test', phone: '+584141110005' });
  assert.equal((await subirFoto(url, titular.token, PNG, 'image/png')).status, 200);
  const ajeno = await registrar(url, { email: 'ajeno@ejemplo.test', phone: '+584141110006' });

  const respuesta = await pedirFoto(url, titular.user.id, ajeno.token);
  assert.equal(respuesta.status, 403);
  assert.deepEqual(await respuesta.json(), { error: 'PHOTO_FORBIDDEN' });
});

test('sin token y con token inválido se responde 401 y nunca contenido', async (t) => {
  const { url } = await startServer(t);
  const titular = await registrar(url, { email: 'sesion@ejemplo.test', phone: '+584141110007' });
  assert.equal((await subirFoto(url, titular.token, PNG, 'image/png')).status, 200);

  const sinSesion = await pedirFoto(url, titular.user.id, null);
  assert.equal(sinSesion.status, 401);
  assert.ok(!(sinSesion.headers.get('content-type') || '').startsWith('image/'));

  const tokenInvalido = await pedirFoto(url, titular.user.id, 'token.completamente.invalido');
  assert.equal(tokenInvalido.status, 401);

  const tokenVacio = await fetch(`${url}/api/users/${titular.user.id}/photo`, { headers: { authorization: 'Bearer ' } });
  assert.equal(tokenVacio.status, 401);
});

test('inexistente, malformado y sin fotografía no se distinguen para un tercero', async (t) => {
  const { url } = await startServer(t);
  const conFoto = await registrar(url, { email: 'confoto@ejemplo.test', phone: '+584141110008' });
  assert.equal((await subirFoto(url, conFoto.token, PNG, 'image/png')).status, 200);
  const sinFoto = await registrar(url, { email: 'sinfoto@ejemplo.test', phone: '+584141110009' });
  const observador = await registrar(url, { email: 'observador@ejemplo.test', phone: '+584141110010' });

  const casos = {
    'existe con foto': conFoto.user.id,
    'existe sin foto': sinFoto.user.id,
    'no existe': 'user_00000000-0000-0000-0000-000000000000',
    'malformado': '..%2F..%2Fetc',
    'vacío tras normalizar': '%20'
  };

  const respuestas = {};
  for (const [nombre, id] of Object.entries(casos)) {
    const r = await pedirFoto(url, id, observador.token);
    respuestas[nombre] = { status: r.status, body: await r.text(), tipo: r.headers.get('content-type') };
  }

  const referencia = respuestas['existe con foto'];
  assert.equal(referencia.status, 403);
  for (const [nombre, r] of Object.entries(respuestas)) {
    assert.equal(r.status, referencia.status, `${nombre}: el estado debía ser idéntico`);
    assert.equal(r.body, referencia.body, `${nombre}: el cuerpo debía ser idéntico`);
    assert.equal(r.tipo, referencia.tipo, `${nombre}: el tipo debía ser idéntico`);
  }
  assert.equal(JSON.parse(referencia.body).error, 'PHOTO_FORBIDDEN');
  assert.equal(Object.keys(JSON.parse(referencia.body)).length, 1, 'solo el código de error');
});

test('el titular sí distingue no tener fotografía', async (t) => {
  const { url } = await startServer(t);
  const sinFoto = await registrar(url, { email: 'propio-sinfoto@ejemplo.test', phone: '+584141110011' });

  const respuesta = await pedirFoto(url, sinFoto.user.id, sinFoto.token);
  assert.equal(respuesta.status, 404, 'quien está autorizado puede saber que no hay foto');
  assert.deepEqual(await respuesta.json(), { error: 'PHOTO_NOT_FOUND' });
});

test('solo se aceptan MIME de imagen con firma binaria coincidente', async (t) => {
  const { url } = await startServer(t);
  const persona = await registrar(url, { email: 'formatos@ejemplo.test', phone: '+584141110012' });

  // Aceptados: firma correcta para el MIME declarado.
  assert.equal((await subirFoto(url, persona.token, PNG, 'image/png')).status, 200);
  assert.equal((await subirFoto(url, persona.token, JPEG, 'image/jpeg', 'f.jpg')).status, 200);

  // Rechazado: MIME de imagen pero contenido que no lo es.
  const falso = await subirFoto(url, persona.token, TEXTO, 'image/png');
  assert.equal(falso.status, 400);
  assert.equal((await falso.json()).error, 'INVALID_FILE_TYPE');

  // Rechazado: firma de un formato distinto al declarado (polyglot).
  const cruzado = await subirFoto(url, persona.token, JPEG, 'image/png');
  assert.equal(cruzado.status, 400);
});

test('el SVG se rechaza por no ser un formato de imagen admitido', async (t) => {
  const { url } = await startServer(t);
  const persona = await registrar(url, { email: 'svg@ejemplo.test', phone: '+584141110013' });

  const svg = await subirFoto(url, persona.token, SVG, 'image/svg+xml', 'activo.svg');
  assert.equal(svg.status, 400, 'un SVG es contenido activo y no puede ser una fotografía');

  // Ni disfrazado de PNG en el MIME.
  const disfrazado = await subirFoto(url, persona.token, SVG, 'image/png', 'activo.png');
  assert.equal(disfrazado.status, 400);

  // Y la persona sigue sin fotografía: nada se almacenó.
  assert.equal((await pedirFoto(url, persona.user.id, persona.token)).status, 404);
});

test('ninguna proyección publica bytes, base64 ni URL pública de fotografía', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const persona = await registrar(url, { email: 'proyeccion@ejemplo.test', phone: '+584141110014' });
  const subida = await subirFoto(url, persona.token, PNG, 'image/png');
  assert.equal(subida.status, 200);

  const cuerpos = {
    'respuesta de subida': await subida.text(),
    'perfil propio': await (await asJson(`${url}/api/auth/me`, persona.token)).text(),
    'listado de usuarios (admin)': await (await asJson(`${url}/api/users`, adminToken)).text(),
    'conductores cercanos': await (await asJson(`${url}/api/drivers/nearby?lat=10.66&lng=-71.61`, persona.token)).text()
  };

  for (const [nombre, cuerpo] of Object.entries(cuerpos)) {
    assert.ok(!cuerpo.includes('data:image'), `${nombre}: no debe llevar data URL`);
    assert.ok(!cuerpo.includes('base64'), `${nombre}: no debe llevar base64`);
    assert.ok(!cuerpo.includes('photoStorageKey'), `${nombre}: no debe revelar el almacenamiento`);
    assert.ok(!cuerpo.includes('\\ufffd') && !cuerpo.includes('PNG'), `${nombre}: no debe llevar bytes`);
    // Si aparece una ruta de fotografía, debe ser la autenticada con /api.
    for (const ruta of cuerpo.match(/"[^"]*\/users\/[^"]*\/photo"/g) || []) {
      assert.ok(ruta.startsWith('"/api/'), `${nombre}: ruta sin prefijo /api -> ${ruta}`);
    }
  }
});

test('la ruta publicada lleva el prefijo /api y responde JSON, nunca HTML', async (t) => {
  const { url } = await startServer(t);
  const persona = await registrar(url, { email: 'ruta@ejemplo.test', phone: '+584141110015' });
  const subida = await subirFoto(url, persona.token, PNG, 'image/png');
  const perfil = await subida.json();

  assert.equal(perfil.photoUrl, `/api/users/${persona.user.id}/photo`);

  // La ruta publicada funciona tal cual, sin recomposición en el cliente.
  const directa = await fetch(`${url}${perfil.photoUrl}`, { headers: { authorization: `Bearer ${persona.token}` } });
  assert.equal(directa.status, 200);
  assert.equal(directa.headers.get('content-type'), 'image/png');

  // La ruta antigua sin /api no existe en el backend: 404 JSON, jamás HTML 200.
  const antigua = await fetch(`${url}/users/${persona.user.id}/photo`, {
    headers: { authorization: `Bearer ${persona.token}` }
  });
  // El riesgo real es el rewrite de la SPA: HTML con estado 200. Da igual que
  // el 404 propio de Express sea HTML; lo que no puede ocurrir es un 200.
  assert.notEqual(antigua.status, 200, 'una ruta sin /api no puede responder 200');
  assert.equal(antigua.status, 404);
  const cuerpoAntiguo = await antigua.text();
  assert.ok(!cuerpoAntiguo.includes('PNG'), 'y jamás devuelve la imagen');
});

test('el viaje no guarda ninguna copia de la fotografía del pasajero', async (t) => {
  const { url } = await startServer(t);
  const pasajero = await registrar(url, { email: 'viaje-foto@ejemplo.test', phone: '+584141110016' });
  assert.equal((await subirFoto(url, pasajero.token, PNG, 'image/png')).status, 200);

  const creado = await asJson(`${url}/api/trips/create`, pasajero.token, {
    method: 'POST',
    body: JSON.stringify({
      pickup: { lat: 10.66, lng: -71.61, address: 'Origen' },
      destination: { lat: 10.68, lng: -71.63, address: 'Destino' },
      fareUSD: 3.5,
      paymentMethod: 'CASH'
    })
  });
  const cuerpo = await creado.json();
  assert.equal(creado.status, 200, `el viaje debía crearse: ${JSON.stringify(cuerpo)}`);
  const trip = cuerpo.trip;

  // El recibo histórico no puede arrastrar una instantánea de la fotografía.
  assert.equal(trip.passengerAvatar, null, 'el viaje no conserva la ruta de la foto');
  assert.ok(!JSON.stringify(trip).includes('/photo'), 'ninguna ruta de fotografía en el viaje');
});
