import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DRIVER-APPLICATION-D1: el expediente con vehículo y servicios separados,
// documentos condicionales, borrador que se completa foto a foto, correcciones
// por documento con su motivo, y todo privado.
//
// Cada prueba levanta su propio servidor. Hay un limitador global de 20
// peticiones por IP cada quince minutos sobre /api/driver-applications, así
// que ninguna prueba pasa de esa cuenta en un mismo servidor.

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const MOTO_DOCS = ['identity_front', 'identity_back', 'rif', 'driver_license', 'medical_certificate', 'vehicle_registration', 'vehicle_front', 'vehicle_rear', 'plate_photo', 'driver_selfie', 'moto_helmets'];
const CAR_DOCS = [...MOTO_DOCS.filter(type => type !== 'moto_helmets'), 'car_rear_interior'];

// El vídeo de presentación, que desde la versión 3 también se exige. Va por su
// propia ruta porque pesa diez veces más que una foto y se valida distinto.
const caja = (tipo, cuerpo) => {
  const c = Buffer.concat([Buffer.alloc(4), Buffer.from(tipo, 'latin1'), cuerpo]);
  c.writeUInt32BE(c.length, 0);
  return c;
};
const mvhd = segundos => {
  const cuerpo = Buffer.alloc(100);
  cuerpo.writeUInt32BE(0, 0);
  cuerpo.writeUInt32BE(600, 12);
  cuerpo.writeUInt32BE(600 * segundos, 16);
  return caja('mvhd', cuerpo);
};
const mp4De = segundos => Buffer.concat([
  caja('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1')),
  caja('moov', mvhd(segundos)),
  caja('mdat', Buffer.alloc(1024))
]);

async function subirVideo(api, token, { segundos = 8, mime = 'video/mp4', cuerpo = null, nombre = 'presentacion.mp4' } = {}) {
  const form = new FormData();
  form.append('file', new Blob([cuerpo ?? mp4De(segundos)], { type: mime }), nombre);
  return fetch(`${api}/driver-applications/me/video`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
}

async function start(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'plus58-d1-'));
  // Bloque propio (20200-20598): testPortRanges.test.js vigila que no se solape.
  const port = 20200 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dir, 'db.sqlite'), UPLOAD_DIR: path.join(dir, 'uploads'), JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    // Con Metro y el emulador abiertos la máquina va lenta: quince segundos.
    const timer = setTimeout(() => reject(new Error('server timeout')), 15000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Running')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => reject(new Error(`exit ${code}`)));
  });
  return { api: `http://127.0.0.1:${port}/api`, uploads: path.join(dir, 'uploads') };
}

const json = (token, body, method = 'POST') => ({ method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const auth = token => ({ headers: { authorization: `Bearer ${token}` } });

function applicantForm(overrides = {}) {
  const form = new FormData();
  Object.entries({
    servicesAppliedFor: 'PASSENGER_TRANSPORT,DELIVERY',
    firstName: 'Luis', lastName: 'Postulante', identityNumber: 'V-19.876.543', rif: 'V-19876543-2',
    birthDate: '1992-03-15', phone: '+584127770001', email: 'luis.d1@example.com', password: 'ClaveSegura123',
    address: 'Calle 72, Maracaibo', city: 'Maracaibo', region: 'Zulia',
    vehicleType: 'MOTO', vehicleBrand: 'Bera', vehicleModel: 'SBR', vehicleYear: '2023', vehicleColor: 'Negro', vehiclePlate: 'D1MOTO1',
    licenseGrade: '2', licenseExpiration: '2028-06-30',
    ...overrides
  }).forEach(([key, value]) => { if (value !== undefined) form.append(key, value); });
  return form;
}

async function login(api, identifier, password) {
  const response = await fetch(`${api}/auth/login`, json(null, { identifier, password }));
  assert.equal(response.status, 200);
  return response.json();
}

async function uploadDocument(api, token, type, body = png, mime = 'image/png', name = `${type}.png`) {
  const form = new FormData();
  form.append('file', new Blob([body], { type: mime }), name);
  return fetch(`${api}/driver-applications/me/documents/${type}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
}

test('un expediente nace como borrador, guarda vehículo y servicios, y sobrevive a la recarga', async t => {
  const { api } = await start(t);

  // 1-4: crear el postulante con MOTO y los dos servicios, sin documentos.
  const created = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm() });
  assert.equal(created.status, 201);
  const creation = await created.json();
  assert.equal(creation.application.status, 'draft');
  assert.deepEqual(creation.application.servicesAppliedFor, ['PASSENGER_TRANSPORT', 'DELIVERY']);
  assert.equal(creation.application.vehicle.type, 'MOTO');
  assert.equal(creation.application.personal.rif, 'V-19876543-2');
  assert.deepEqual(creation.application.license, { grade: 2, expiration: '2028-06-30' });
  assert.equal(creation.application.requirementsVersion, 3);
  assert.deepEqual(creation.application.missingDocuments, [...MOTO_DOCS, 'presentation_video']);
  assert.equal(creation.application.checkpoints.DOCUMENTS_REVIEW, 'PENDING');
  assert.equal(creation.application.checkpoints.ORIENTATION_TUTORIAL, 'NOT_REQUIRED');

  // 5-6: recargar (entrar de nuevo y pedir el expediente): los mismos servicios.
  const session = await login(api, 'luis.d1@example.com', 'ClaveSegura123');
  const me = await fetch(`${api}/driver-applications/me`, auth(session.token));
  assert.equal(me.status, 200);
  const reloaded = await me.json();
  assert.deepEqual(reloaded.servicesAppliedFor, ['PASSENGER_TRANSPORT', 'DELIVERY']);
  assert.equal(reloaded.status, 'draft');

  // No se puede enviar sin documentos, y se dice cuáles faltan.
  const early = await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(session.token) });
  assert.equal(early.status, 400);
  assert.deepEqual((await early.json()).missing, [...MOTO_DOCS, 'presentation_video']);

  // 7-8: cambiar a CAR antes de enviar cambia los documentos condicionales.
  const toCar = await fetch(`${api}/driver-applications/me`, json(session.token, { vehicleType: 'CAR', licenseGrade: '3' }, 'PATCH'));
  assert.equal(toCar.status, 200);
  const asCar = await toCar.json();
  assert.equal(asCar.vehicle.type, 'CAR');
  assert.ok(asCar.missingDocuments.includes('car_rear_interior'));
  assert.equal(asCar.missingDocuments.includes('moto_helmets'), false);
  // Con licencia de segundo grado no se puede declarar carro.
  const badGrade = await fetch(`${api}/driver-applications/me`, json(session.token, { licenseGrade: '2' }, 'PATCH'));
  assert.equal(badGrade.status, 400);
  assert.ok((await badGrade.json()).fields.licenseGrade);

  // Y de vuelta a MOTO para el resto de la prueba.
  const toMoto = await fetch(`${api}/driver-applications/me`, json(session.token, { vehicleType: 'MOTO', licenseGrade: '2' }, 'PATCH'));
  assert.equal(toMoto.status, 200);
  assert.ok((await toMoto.json()).missingDocuments.includes('moto_helmets'));
});

test('el vídeo, los tipos raros, las firmas falsas y los archivos enormes se rechazan', async t => {
  const { api } = await start(t);
  const creation = await (await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm() })).json();
  const token = creation.token;

  // Tipo que no es foto ni PDF.
  const text = await uploadDocument(api, token, 'rif', Buffer.from('hola'), 'text/plain', 'rif.txt');
  assert.notEqual(text.status, 200);
  // Bytes que no son lo que dicen ser.
  const fake = await uploadDocument(api, token, 'rif', Buffer.from('no soy un png'), 'image/png');
  assert.equal(fake.status, 400);
  // El vídeo está en el modelo pero no se puede subir.
  const video = await uploadDocument(api, token, 'presentation_video', png, 'image/png');
  assert.equal(video.status, 400);
  assert.equal((await video.json()).error, 'INVALID_DOCUMENT');
  // Demasiado grande.
  const huge = await uploadDocument(api, token, 'rif', Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), 'image/png');
  assert.notEqual(huge.status, 200);
  // Y nada de eso dejó documento.
  const after = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  assert.equal(after.documents.length, 0);
});

test('los documentos se suben uno a uno, privados, se reemplazan y se envían', async t => {
  const { api, uploads } = await start(t);
  const creation = await (await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm() })).json();
  const token = creation.token;

  // Los once, de uno en uno.
  for (const type of MOTO_DOCS) {
    const response = await uploadDocument(api, token, type);
    assert.equal(response.status, 200, type);
  }
  assert.equal((await subirVideo(api, token)).status, 200);
  const complete = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  assert.deepEqual(complete.missingDocuments, []);
  assert.equal(complete.documents.length, MOTO_DOCS.length + 1, 'los once documentos y el vídeo');

  // Privados: el dueño y administración los ven; un tercero recibe 404, y en
  // disco no hay nada público ni con el nombre original.
  const document = complete.documents.find(item => item.type === 'driver_selfie');
  const own = await fetch(`${api}/driver-documents/${document.id}/content`, auth(token));
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'private, no-store, max-age=0');
  const stranger = await (await fetch(`${api}/auth/register`, json(null, { email: 'otro@example.com', phone: '+584120000002', password: 'ClaveSegura123', role: 'passenger', firstName: 'Otro', lastName: 'Usuario' }))).json();
  const stolen = await fetch(`${api}/driver-documents/${document.id}/content`, auth(stranger.token));
  assert.equal(stolen.status, 404);
  const anonymous = await fetch(`${api}/driver-documents/${document.id}/content`);
  assert.equal(anonymous.status, 401);
  const filesOnDisk = fs.readdirSync(uploads, { recursive: true }).map(String);
  assert.equal(filesOnDisk.some(name => /selfie|driver_selfie/.test(name)), false, 'el nombre original llega al disco');

  // Reemplazar uno.
  const replaced = await uploadDocument(api, token, 'plate_photo');
  assert.equal(replaced.status, 200);
  const afterReplace = await replaced.json();
  assert.equal(afterReplace.documents.filter(item => item.type === 'plate_photo').length, 1, 'reemplazar no duplica');

  // Enviar: ahora sí.
  const submitted = await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) });
  assert.equal(submitted.status, 200);
  assert.equal((await submitted.json()).status, 'pending');
  const locked = await uploadDocument(api, token, 'plate_photo');
  assert.equal(locked.status, 409);
});

test('administración ve vehículo y servicios, pide cambios por documento con motivo, y aprueba', async t => {
  const { api } = await start(t);
  const creation = await (await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ vehicleType: 'CAR', licenseGrade: '4', vehiclePlate: 'D1CAR01' }) })).json();
  const token = creation.token;
  for (const type of CAR_DOCS) assert.equal((await uploadDocument(api, token, type)).status, 200, type);
  assert.equal((await subirVideo(api, token)).status, 200);
  assert.equal((await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) })).status, 200);

  const admin = await login(api, 'admin@58express.com', 'admin');
  // 13: la cola enseña el vehículo y los servicios.
  const list = await (await fetch(`${api}/admin/driver-applications?status=pending`, auth(admin.token))).json();
  const row = list.applications.find(item => item.id === creation.application.id);
  assert.ok(row);
  assert.equal(row.vehicleType, 'CAR');
  assert.deepEqual(row.servicesAppliedFor, ['PASSENGER_TRANSPORT', 'DELIVERY']);
  assert.equal(row.missingDocumentCount, 0);
  // Y se busca por RIF.
  const byRif = await (await fetch(`${api}/admin/driver-applications?q=V-19876543-2`, auth(admin.token))).json();
  assert.equal(byRif.applications.length, 1);

  const detail = await (await fetch(`${api}/admin/driver-applications/${creation.application.id}`, auth(admin.token))).json();
  assert.equal(detail.vehicle.legalDocumentType, 'CIRCULATION_CARD');
  assert.equal(detail.license.grade, 4);
  assert.equal(detail.personal.rif, 'V-19876543-2');

  // Cambios por documento, cada uno con su motivo, y una corrección de texto.
  const changes = await fetch(`${api}/admin/driver-applications/${creation.application.id}/decision`, json(admin.token, {
    action: 'needs_changes',
    reason: 'Revisa dos fotos y la placa declarada.',
    requestedChanges: [{ type: 'plate_photo', reason: 'No se lee el último carácter.' }, 'car_rear_interior'],
    textualCorrections: 'La placa declarada no coincide con la foto.'
  }, 'PATCH'));
  assert.equal(changes.status, 200);
  const owner = await (await fetch(`${api}/driver-applications/me`, auth(token))).json();
  assert.equal(owner.status, 'needs_changes');
  assert.deepEqual(owner.requestedChangeDetails, [
    { type: 'plate_photo', reason: 'No se lee el último carácter.' },
    { type: 'car_rear_interior', reason: 'Revisa dos fotos y la placa declarada.' }
  ]);
  assert.deepEqual(owner.requestedChanges, ['plate_photo', 'car_rear_interior']);
  assert.equal(owner.textualCorrections, 'La placa declarada no coincide con la foto.');

  // Repetir un documento atiende SU corrección: la otra sigue pendiente, y el
  // motivo global y la corrección de texto se conservan hasta el reenvío.
  const afterPlate = await (await uploadDocument(api, token, 'plate_photo')).json();
  assert.equal(afterPlate.status, 'draft');
  assert.deepEqual(afterPlate.requestedChangeDetails, [{ type: 'car_rear_interior', reason: 'Revisa dos fotos y la placa declarada.' }]);
  assert.deepEqual(afterPlate.requestedChanges, ['car_rear_interior']);
  assert.equal(afterPlate.textualCorrections, 'La placa declarada no coincide con la foto.');
  // Corregir y reenviar limpia lo pedido.
  assert.equal((await uploadDocument(api, token, 'car_rear_interior')).status, 200);
  const resubmitted = await (await fetch(`${api}/driver-applications/me/submit`, { method: 'POST', ...auth(token) })).json();
  assert.equal(resubmitted.status, 'pending');
  assert.deepEqual(resubmitted.requestedChangeDetails, []);
  assert.equal(resubmitted.textualCorrections, null);

  // Aprobar: el control de documentos pasa, el usuario es conductor con su RIF.
  const approval = await (await fetch(`${api}/admin/driver-applications/${creation.application.id}/decision`, json(admin.token, { action: 'approve' }, 'PATCH'))).json();
  assert.equal(approval.application.status, 'approved');
  assert.equal(approval.application.checkpoints.DOCUMENTS_REVIEW, 'PASSED');
  assert.equal(approval.application.checkpoints.VEHICLE_INSPECTION, 'NOT_REQUIRED');
  assert.equal(approval.user.role, 'driver');
  assert.equal(approval.user.vehicleType, 'CAR');
});

test('sin servicio no hay expediente, y las reglas se validan en el servidor', async t => {
  const { api } = await start(t);
  const none = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ servicesAppliedFor: '' }) });
  assert.equal(none.status, 400);
  assert.ok((await none.json()).fields.servicesAppliedFor);
  const unknown = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ servicesAppliedFor: 'TELETRANSPORTE' }) });
  assert.equal(unknown.status, 400);
  const wrongGrade = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ licenseGrade: '3' }) });
  assert.equal(wrongGrade.status, 400);
  assert.ok((await wrongGrade.json()).fields.licenseGrade);
  const badRif = await fetch(`${api}/driver-applications`, { method: 'POST', body: applicantForm({ rif: 'V-19876543' }) });
  assert.equal(badRif.status, 400);
  assert.ok((await badRif.json()).fields.rif);
});

test('un cliente antiguo que no declara servicios crea un expediente de versión 1 y sigue funcionando', async t => {
  const { api } = await start(t);
  const form = applicantForm({ servicesAppliedFor: undefined, rif: undefined, licenseGrade: undefined, licenseExpiration: undefined, email: 'viejo@example.com', phone: '+584127770009', vehiclePlate: 'VIEJO01' });
  for (const type of ['identity_front', 'identity_back', 'driver_license', 'vehicle_registration', 'vehicle_photo', 'plate_photo', 'driver_selfie']) {
    form.append(type, new Blob([png], { type: 'image/png' }), `${type}.png`);
  }
  const created = await fetch(`${api}/driver-applications`, { method: 'POST', body: form });
  assert.equal(created.status, 201);
  const creation = await created.json();
  assert.equal(creation.application.requirementsVersion, 1);
  assert.equal(creation.application.status, 'pending', 'con los siete documentos de antes queda pendiente, como siempre');
  assert.deepEqual(creation.application.servicesAppliedFor, ['PASSENGER_TRANSPORT']);
  assert.deepEqual(creation.application.missingDocuments, []);
});

test('el despacho de delivery NO existe todavía', () => {
  // Esta fase solo registra a qué se postula. Nadie despacha paquetes.
  const dispatch = fs.readFileSync(path.join(serverDir, 'domain', 'dispatchEligibility.js'), 'utf8');
  assert.equal(/DELIVERY/.test(dispatch), false);
  const pricing = fs.readFileSync(path.join(serverDir, 'domain', 'pricingService.js'), 'utf8');
  assert.equal(/DELIVERY|parcel|package/i.test(pricing), false);
});

// ---------------------------------------------------------------------------
// Postularse desde la aplicación, con la sesión ya abierta
// ---------------------------------------------------------------------------

test('la sesion vale como prueba de identidad: quien ya entro no repite su contrasena', async t => {
  const { api } = await start(t);

  // Una cuenta de pasajera cualquiera, creada por el camino normal.
  const registro = await fetch(`${api}/auth/register`, json(null, {
    email: 'con.sesion@example.com', phone: '04141900011', password: 'ClaveSegura123',
    firstName: 'Rosa', lastName: 'Pasajera'
  }));
  assert.equal(registro.status, 201);
  const acceso = await fetch(`${api}/auth/login`, json(null, { identifier: 'con.sesion@example.com', password: 'ClaveSegura123' }));
  const { token } = await acceso.json();

  // Se postula desde la aplicación: entró con su contraseña hace un momento y
  // nadie se la volvió a pedir, así que el formulario no la lleva.
  const form = applicantForm({ email: 'con.sesion@example.com', phone: '04141900011', password: undefined, vehiclePlate: 'SES001' });
  const alta = await fetch(`${api}/driver-applications`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form
  });
  assert.equal(alta.status, 201, 'con sesion propia el alta debe pasar sin contrasena');
  const creada = await alta.json();
  assert.equal(creada.application.status, 'draft');

  // Y el expediente es de esa persona: se lee con su misma sesión.
  const mio = await fetch(`${api}/driver-applications/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(mio.status, 200);
  assert.equal((await mio.json()).id, creada.application.id);
});

test('sin sesion sigue haciendo falta la contrasena', async t => {
  const { api } = await start(t);
  const sinNada = await fetch(`${api}/driver-applications`, {
    method: 'POST',
    body: applicantForm({ email: 'nueva.sin.clave@example.com', phone: '04141900022', password: undefined, vehiclePlate: 'SES002' })
  });
  assert.equal(sinNada.status, 400);
  const detalle = await sinNada.json();
  assert.equal(detalle.error, 'VALIDATION_FAILED');
  assert.ok(detalle.fields.password, 'debe decir que falta la contrasena');
});

test('una sesion NO sirve para postularse en nombre de otra persona', async t => {
  const { api } = await start(t);

  // Dos cuentas distintas.
  for (const [email, phone] of [['una@example.com', '04141900033'], ['otra@example.com', '04141900044']]) {
    assert.equal((await fetch(`${api}/auth/register`, json(null, {
      email, phone, password: 'ClaveSegura123', firstName: 'Ana', lastName: 'Prueba'
    }))).status, 201);
  }
  const { token } = await (await fetch(`${api}/auth/login`, json(null, { identifier: 'una@example.com', password: 'ClaveSegura123' }))).json();

  // Con la sesión de la primera, se intenta abrir expediente a nombre de la
  // segunda y sin su contraseña.
  const intruso = await fetch(`${api}/driver-applications`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: applicantForm({ email: 'otra@example.com', phone: '04141900044', password: undefined, vehiclePlate: 'SES003' })
  });
  assert.equal(intruso.status, 400, 'la cuenta ajena sigue exigiendo su contrasena');
  assert.ok((await intruso.json()).fields.password);

  // Y con una contraseña equivocada, tampoco.
  const conClaveMala = await fetch(`${api}/driver-applications`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: applicantForm({ email: 'otra@example.com', phone: '04141900044', password: 'OtraClaveDistinta9', vehiclePlate: 'SES004' })
  });
  assert.equal(conClaveMala.status, 401);
  assert.equal((await conClaveMala.json()).error, 'EXISTING_ACCOUNT_AUTH_REQUIRED');
});

test('un token invalido no abre la puerta: la ruta sigue siendo publica', async t => {
  const { api } = await start(t);
  const conBasura = await fetch(`${api}/driver-applications`, {
    method: 'POST',
    headers: { authorization: 'Bearer esto-no-es-un-token' },
    body: applicantForm({ email: 'token.malo@example.com', phone: '04141900055', password: undefined, vehiclePlate: 'SES005' })
  });
  // Como si no trajera nada: se le pide la contrasena, no se le deja pasar.
  assert.equal(conBasura.status, 400);
  assert.ok((await conBasura.json()).fields.password);
});
