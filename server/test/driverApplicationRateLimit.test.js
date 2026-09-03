import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LOS LÍMITES DEL EXPEDIENTE, CONTADOS POR CUENTA
 *
 * Lo que se protege aquí es una persona real detrás del NAT de su operador.
 *
 * Postularse cuesta una creación, once subidas, alguna corrección y el envío.
 * Con un tope por dirección que contara todo, la segunda persona del día que
 * comparte salida a internet se quedaba fuera sin haber hecho nada. La regla
 * es: lo autenticado cuenta por CUENTA; la dirección sólo frena lo que ni
 * siquiera llega a autenticarse, y el alta —que no tiene cuenta todavía— tiene
 * su propio techo por dirección.
 *
 * Todas las peticiones de este fichero salen de la misma dirección (127.0.0.1),
 * que es justo el escenario que se quiere probar.
 */

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const MOTO_DOCS = ['identity_front', 'identity_back', 'rif', 'driver_license', 'medical_certificate', 'vehicle_registration', 'vehicle_front', 'vehicle_rear', 'plate_photo', 'driver_selfie', 'moto_helmets'];

async function start(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'plus58-rl-'));
  // Bloque propio (20700-21098): testPortRanges.test.js vigila que no se solape.
  const port = 20700 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dir, 'db.sqlite'), UPLOAD_DIR: path.join(dir, 'uploads'), JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server timeout')), 15000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => reject(new Error(`exit ${code}`)));
  });
  return { api: `http://127.0.0.1:${port}/api` };
}

const json = (token, body, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const auth = token => ({ headers: { authorization: `Bearer ${token}` } });

function applicantForm(overrides = {}) {
  const form = new FormData();
  Object.entries({
    servicesAppliedFor: 'PASSENGER_TRANSPORT',
    firstName: 'Ana', lastName: 'Postulante', identityNumber: 'V-18.111.222', rif: 'V-18111222-3',
    birthDate: '1990-02-10', phone: '+584127771000', email: 'ana.rl@example.com', password: 'ClaveSegura123',
    address: 'Calle 5 de Julio, Maracaibo', city: 'Maracaibo', region: 'Zulia',
    vehicleType: 'MOTO', vehicleBrand: 'Bera', vehicleModel: 'SBR', vehicleYear: '2023', vehicleColor: 'Negro', vehiclePlate: 'RL0001',
    licenseGrade: '2', licenseExpiration: '2028-06-30',
    ...overrides
  }).forEach(([key, value]) => { if (value !== undefined) form.append(key, value); });
  return form;
}

async function uploadDocument(api, token, type) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${type}.png`);
  return fetch(`${api}/driver-applications/me/documents/${type}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
}

/** El recorrido honrado completo: crear, once documentos, corregir y enviar. */
async function recorridoCompleto(api, datos) {
  const creado = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm(datos) });
  assert.equal(creado.status, 201, `alta de ${datos.email}: ${creado.status}`);
  const { token } = await creado.json();
  for (const type of MOTO_DOCS) {
    assert.equal((await uploadDocument(api, token, type)).status, 200, `${datos.email} subiendo ${type}`);
  }
  // Repetir una foto y tocar un dato: parte del uso normal.
  assert.equal((await uploadDocument(api, token, 'plate_photo')).status, 200);
  assert.equal((await fetch(`${api}/driver-applications/me`, json(token, { vehicleColor: 'Azul' }, 'PATCH'))).status, 200);
  assert.equal((await fetch(`${api}/driver-applications/me`, auth(token))).status, 200);
  const enviado = await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) });
  assert.equal(enviado.status, 200, `envío de ${datos.email}`);
  return token;
}

test('dos personas con la misma dirección completan su expediente sin estorbarse', async t => {
  const { api } = await start(t);

  // Quince peticiones cada una, todas desde 127.0.0.1: con el tope viejo de
  // veinte por dirección, la segunda se quedaba fuera a mitad de camino.
  await recorridoCompleto(api, { email: 'ana.rl@example.com', phone: '+584127771000', identityNumber: 'V-18111222', rif: 'V-18111222-3', vehiclePlate: 'RL0001' });
  await recorridoCompleto(api, { email: 'beto.rl@example.com', phone: '+584127771001', identityNumber: 'V-18111333', rif: 'V-18111333-4', vehiclePlate: 'RL0002' });

  // Y una tercera persona sigue pudiendo empezar después de las dos anteriores.
  const tercera = await fetch(`${api}/driver-applications`, {
    method: 'POST',
    body: applicantForm({ email: 'caro.rl@example.com', phone: '+584127771002', identityNumber: 'V-18111444', rif: 'V-18111444-5', vehiclePlate: 'RL0003' })
  });
  assert.equal(tercera.status, 201);
});

test('la misma cuenta abusando de las subidas recibe 429 con Retry-After', async t => {
  const { api } = await start(t);
  const creado = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ email: 'abuso.rl@example.com', phone: '+584127772000', identityNumber: 'V-18222111', rif: 'V-18222111-9', vehiclePlate: 'RL9999' }) });
  const { token } = await creado.json();

  // El techo por cuenta de las subidas es 60 por cuarto de hora. Se pasa de ahí
  // a propósito: lo que se comprueba es que el límite existe y se explica.
  let ultima = null;
  for (let intento = 0; intento < 70; intento += 1) {
    ultima = await uploadDocument(api, token, 'identity_front');
    if (ultima.status === 429) break;
  }
  assert.equal(ultima.status, 429, 'la cuenta abusiva debería tocar el límite');
  assert.ok(Number(ultima.headers.get('retry-after')) > 0, 'el 429 dice cuánto esperar');
  const cuerpo = await ultima.json();
  assert.equal(cuerpo.error, 'RATE_LIMITED');
  assert.equal(cuerpo.scope, 'subidas-documento', 'el 429 dice qué límite se tocó');
});

test('el alta repetida desde una dirección está protegida, y no arrastra a lo autenticado', async t => {
  const { api } = await start(t);

  // Veinte altas por dirección y cuarto de hora. Se fuerzan hasta el tope con
  // cuerpos válidos y distintos; la que hace veintiuna debe recibir 429.
  let bloqueada = null;
  for (let numero = 0; numero < 24; numero += 1) {
    const respuesta = await fetch(`${api}/driver-applications`, {
      method: 'POST',
      body: applicantForm({
        email: `spam${numero}.rl@example.com`,
        phone: `+58412778${String(numero).padStart(4, '0')}`,
        identityNumber: `V-1833${String(numero).padStart(4, '0')}`,
        rif: `V-1833${String(numero).padStart(4, '0')}-1`,
        vehiclePlate: `RLS${String(numero).padStart(3, '0')}`
      })
    });
    if (respuesta.status === 429) { bloqueada = respuesta; break; }
    assert.equal(respuesta.status, 201, `alta ${numero}`);
  }
  assert.ok(bloqueada, 'el alta en masa debería tocar el límite por dirección');
  assert.equal((await bloqueada.json()).scope, 'postulacion-alta');
});

test('la guardia por dirección no cuenta lo que sale bien', async t => {
  const { api } = await start(t);
  const creado = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ email: 'lectura.rl@example.com', phone: '+584127773000', identityNumber: 'V-18444111', rif: 'V-18444111-2', vehiclePlate: 'RL7777' }) });
  const { token } = await creado.json();

  // Cincuenta consultas correctas seguidas: muy por encima del tope viejo de
  // veinte por dirección, y ninguna debe fallar.
  for (let numero = 0; numero < 50; numero += 1) {
    const respuesta = await fetch(`${api}/driver-applications/me`, auth(token));
    assert.equal(respuesta.status, 200, `consulta ${numero}`);
  }
});

test('un usuario no puede terminar con dos expedientes por insistir', async t => {
  const { api } = await start(t);
  const datos = { email: 'doble.rl@example.com', phone: '+584127774000', identityNumber: 'V-18555111', rif: 'V-18555111-3', vehiclePlate: 'RL5555' };
  const primera = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm(datos) });
  assert.equal(primera.status, 201);

  // Segundo toque del mismo botón, con la misma contraseña: 409, no un segundo
  // expediente.
  const segunda = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm(datos) });
  assert.equal(segunda.status, 409);
  assert.equal((await segunda.json()).error, 'DRIVER_APPLICATION_EXISTS');

  // Y administración sigue viendo uno solo.
  const admin = await (await fetch(`${api}/auth/login`, json(null, { identifier: 'admin@58express.com', password: 'admin' }))).json();
  const lista = await (await fetch(`${api}/admin/driver-applications?q=V-18555111-3`, auth(admin.token))).json();
  assert.equal(lista.applications.length, 1);
});
