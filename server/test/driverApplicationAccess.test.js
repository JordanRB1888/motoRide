import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Bytes de cabecera válidos para que la validación por firma acepte el archivo.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0x20)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(64).fill(0x20)]);
const PDF = Buffer.from([...Buffer.from('%PDF-1.4\n'), ...Array(64).fill(0x20)]);

// Los siete tipos que exige REQUIRED_DRIVER_DOCUMENTS.
const REQUIRED_DOCS = [
  'identity_front', 'identity_back', 'driver_license', 'vehicle_registration',
  'vehicle_photo', 'plate_photo', 'driver_selfie'
];

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-apps-'));
  const port = 8000 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'applications-test-secret' },
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

async function login(url, identifier, password, role) {
  const r = await asJson(`${url}/api/auth/login`, null, { method: 'POST', body: JSON.stringify({ identifier, password, role }) });
  assert.equal(r.status, 200, `login fallido: ${identifier}`);
  return (await r.json()).token;
}

/** Envía una solicitud completa con documentos válidos. */
async function submitApplication(url, { email, phone, plate = 'PLACA01', identityNumber = 'V-11111111' }) {
  const form = new FormData();
  const campos = {
    firstName: 'Nombre', lastName: 'Apellido', identityNumber, birthDate: '1990-01-01',
    phone, email, address: 'Dirección de ejemplo 123', city: 'Ciudad', region: 'Región',
    password: 'password123', vehicleType: 'MOTO', vehicleBrand: 'Marca', vehicleModel: 'Modelo',
    vehicleYear: '2020', vehicleColor: 'Color', vehiclePlate: plate, vehicleAdditionalInfo: 'Nota'
  };
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor);
  for (const tipo of REQUIRED_DOCS) {
    form.append(tipo, new Blob([PNG], { type: 'image/png' }), `${tipo}.png`);
  }
  const response = await fetch(`${url}/api/driver-applications`, { method: 'POST', body: form });
  assert.equal(response.status, 201, 'la solicitud debía crearse');
  return response.json();
}

const CLAVES_LISTA = ['applicantName', 'createdAt', 'decisionReason', 'documentCount', 'documentsPendingCount',
  'id', 'status', 'submittedAt', 'updatedAt', 'vehiclePlate', 'vehicleType'];

const PROHIBIDOS_LISTA = ['personal', 'vehicle', 'documents', 'contentUrl', 'storageKey', 'originalName', 'userId', 'reviewedBy', 'user'];

test('el listado administrativo no contiene datos personales ni rutas de documentos', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  await submitApplication(url, { email: 'aspirante1@ejemplo.test', phone: '+584140010001', plate: 'LST001' });

  const respuesta = await asJson(`${url}/api/admin/driver-applications`, adminToken);
  assert.equal(respuesta.status, 200);
  const { applications } = await respuesta.json();
  assert.equal(applications.length, 1);

  const fila = applications[0];
  assert.deepEqual(Object.keys(fila).sort(), CLAVES_LISTA.sort());
  for (const campo of PROHIBIDOS_LISTA) {
    assert.equal(fila[campo], undefined, `el listado no debía incluir: ${campo}`);
  }

  const crudo = JSON.stringify(applications);
  assert.ok(!crudo.includes('V-11111111'), 'no debe aparecer la cédula');
  assert.ok(!crudo.includes('1990-01-01'), 'no debe aparecer la fecha de nacimiento');
  assert.ok(!crudo.includes('aspirante1@ejemplo.test'), 'no debe aparecer el correo');
  assert.ok(!crudo.includes('+584140010001'), 'no debe aparecer el teléfono');
  assert.ok(!crudo.includes('Dirección'), 'no debe aparecer la dirección');
  assert.ok(!crudo.includes('contentUrl'), 'no debe aparecer la ruta del contenido');
  assert.ok(!crudo.includes('storageKey'), 'no debe aparecer la clave de almacenamiento');
  assert.ok(!crudo.includes('.png'), 'no debe aparecer un nombre de archivo');

  // Y conserva lo que la cola necesita.
  assert.equal(fila.applicantName, 'Nombre Apellido');
  assert.equal(fila.vehiclePlate, 'LST001');
  assert.equal(fila.documentCount, REQUIRED_DOCS.length);
  assert.equal(fila.documentsPendingCount, REQUIRED_DOCS.length);
});

test('el detalle administrativo entrega el expediente sin contentUrl', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, { email: 'aspirante2@ejemplo.test', phone: '+584140010002', plate: 'DET001' });

  const respuesta = await asJson(`${url}/api/admin/driver-applications/${creada.application.id}`, adminToken);
  assert.equal(respuesta.status, 200);
  const detalle = await respuesta.json();

  assert.deepEqual(
    Object.keys(detalle).sort(),
    ['applicant', 'createdAt', 'decisionReason', 'documents', 'id', 'personal', 'requestedChanges',
     'reviewedAt', 'reviewedBy', 'status', 'submittedAt', 'updatedAt', 'vehicle'].sort()
  );
  // El expediente sí lleva la identificación: es su función.
  assert.equal(detalle.personal.identityNumber, 'V-11111111');
  // Los documentos solo llevan metadatos.
  for (const documento of detalle.documents) {
    assert.deepEqual(Object.keys(documento).sort(), ['id', 'mimeType', 'size', 'status', 'type', 'updatedAt']);
    assert.equal(documento.contentUrl, undefined);
    assert.equal(documento.storageKey, undefined);
    assert.equal(documento.originalName, undefined);
  }
  const crudo = JSON.stringify(detalle);
  assert.ok(!crudo.includes('contentUrl'));
  assert.ok(!crudo.includes('storageKey'));
  assert.ok(!crudo.includes('.png'), 'no debe filtrarse el nombre del archivo');
});

test('un conductor no puede leer el listado ni el detalle administrativo', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const propia = await submitApplication(url, { email: 'propio@ejemplo.test', phone: '+584140010003', plate: 'OWN001' });
  const ajena = await submitApplication(url, { email: 'ajeno@ejemplo.test', phone: '+584140010004', plate: 'OTR001', identityNumber: 'V-22222222' });

  // El solicitante inicia sesión con su cuenta de pasajero.
  const token = await login(url, 'propio@ejemplo.test', 'password123', 'passenger');

  const listado = await asJson(`${url}/api/admin/driver-applications`, token);
  assert.equal(listado.status, 403);
  const cuerpoListado = await listado.json();
  assert.ok(!JSON.stringify(cuerpoListado).includes('V-22222222'), 'el error no filtra expedientes');

  const detalleAjeno = await asJson(`${url}/api/admin/driver-applications/${ajena.application.id}`, token);
  assert.equal(detalleAjeno.status, 403);
  assert.ok(!JSON.stringify(await detalleAjeno.json()).includes('ajeno@ejemplo.test'));

  // Su propia solicitud sí la ve, por la vista del propietario.
  const propiaRespuesta = await asJson(`${url}/api/driver-applications/me`, token);
  assert.equal(propiaRespuesta.status, 200);
  const vista = await propiaRespuesta.json();
  assert.equal(vista.id, propia.application.id);
  assert.deepEqual(
    Object.keys(vista).sort(),
    ['createdAt', 'decisionReason', 'documents', 'id', 'personal', 'requestedChanges',
     'status', 'submittedAt', 'updatedAt', 'vehicle'].sort()
  );
  assert.equal(vista.reviewedBy, undefined, 'quién revisó es información interna');
  assert.equal(vista.applicant, undefined);
  assert.ok(!JSON.stringify(vista).includes('contentUrl'));
  assert.ok(!JSON.stringify(vista).includes('storageKey'));
});

test('la búsqueda administrativa sigue funcionando sin devolver los criterios', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  await submitApplication(url, { email: 'buscable@ejemplo.test', phone: '+584140010005', plate: 'BSQ001', identityNumber: 'V-33333333' });
  await submitApplication(url, { email: 'otra@ejemplo.test', phone: '+584140010006', plate: 'BSQ002', identityNumber: 'V-44444444' });

  for (const criterio of ['V-33333333', 'buscable@ejemplo.test', '+584140010005', 'BSQ001']) {
    const respuesta = await asJson(`${url}/api/admin/driver-applications?q=${encodeURIComponent(criterio)}`, adminToken);
    assert.equal(respuesta.status, 200);
    const { applications } = await respuesta.json();
    assert.equal(applications.length, 1, `la búsqueda por ${criterio} debía encontrar una solicitud`);
    assert.equal(applications[0].vehiclePlate, 'BSQ001');
    // El criterio se usa en el servidor pero no vuelve en la respuesta.
    const crudo = JSON.stringify(applications);
    assert.ok(!crudo.includes('V-33333333'));
    assert.ok(!crudo.includes('buscable@ejemplo.test'));
    assert.ok(!crudo.includes('+584140010005'));
  }

  // El filtro por estado también sigue operativo.
  const pendientes = await asJson(`${url}/api/admin/driver-applications?status=pending`, adminToken);
  assert.equal((await pendientes.json()).applications.length, 2);
});

test('registro, sustitución, cambios solicitados y aprobación siguen funcionando', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, { email: 'flujo@ejemplo.test', phone: '+584140010008', plate: 'FLW001', identityNumber: 'V-66666666' });
  const token = creada.token;

  // Solicitar cambios.
  const cambios = await asJson(`${url}/api/admin/driver-applications/${creada.application.id}/decision`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'needs_changes', reason: 'Reenvía el reverso', requestedChanges: ['identity_back'] })
  });
  assert.equal(cambios.status, 200);
  const trasCambios = await cambios.json();
  assert.equal(trasCambios.application.status, 'needs_changes');
  assert.deepEqual(trasCambios.application.requestedChanges, ['identity_back']);

  // El solicitante ve la observación en su propia vista.
  const suya = await (await asJson(`${url}/api/driver-applications/me`, token)).json();
  assert.equal(suya.status, 'needs_changes');
  assert.equal(suya.decisionReason, 'Reenvía el reverso');

  // Sustituir un documento.
  const form = new FormData();
  form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'identity_back.jpg');
  const sustitucion = await fetch(`${url}/api/driver-applications/me/documents/identity_back`, {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form
  });
  assert.equal(sustitucion.status, 200);
  const trasSustituir = await sustitucion.json();
  assert.equal(trasSustituir.documents.length, REQUIRED_DOCS.length);
  assert.ok(!JSON.stringify(trasSustituir).includes('storageKey'));
  assert.ok(!JSON.stringify(trasSustituir).includes('identity_back.jpg'), 'el nombre original no vuelve');

  // Reenviar y aprobar.
  const reenvio = await asJson(`${url}/api/driver-applications/me/submit`, token, { method: 'POST' });
  assert.equal(reenvio.status, 200);
  assert.equal((await reenvio.json()).status, 'pending');

  const aprobacion = await asJson(`${url}/api/admin/driver-applications/${creada.application.id}/decision`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ action: 'approve' })
  });
  assert.equal(aprobacion.status, 200);
  const aprobada = await aprobacion.json();
  assert.equal(aprobada.application.status, 'approved');
  assert.equal(aprobada.user.role, 'driver');

  // Y el conductor aprobado puede iniciar sesión como tal.
  await login(url, 'flujo@ejemplo.test', 'password123', 'driver');
});

test('un documento con extensión permitida pero firma inválida se rechaza', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, { email: 'firma@ejemplo.test', phone: '+584140010009', plate: 'FRM001', identityNumber: 'V-77777777' });

  // Una solicitud enviada queda bloqueada; se piden cambios para poder
  // sustituir documentos, que es el flujo real de corrección.
  const cambios = await asJson(`${url}/api/admin/driver-applications/${creada.application.id}/decision`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'needs_changes', reason: 'Reenvía los documentos', requestedChanges: ['identity_front'] })
  });
  assert.equal(cambios.status, 200);

  const casos = [
    { nombre: 'SVG', tipo: 'image/svg+xml', datos: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), archivo: 'documento.svg' },
    { nombre: 'HTML', tipo: 'text/html', datos: Buffer.from('<html><body>x</body></html>'), archivo: 'documento.html' },
    { nombre: 'JavaScript', tipo: 'application/javascript', datos: Buffer.from('alert(1)'), archivo: 'documento.js' },
    { nombre: 'firma falsa', tipo: 'image/png', datos: Buffer.from('esto no es un PNG aunque lo diga el MIME'), archivo: 'falso.png' },
    { nombre: 'SVG disfrazado de PNG', tipo: 'image/png', datos: Buffer.from('<svg onload="alert(1)"></svg>'), archivo: 'disfraz.png' }
  ];

  for (const caso of casos) {
    const form = new FormData();
    form.append('file', new Blob([caso.datos], { type: caso.tipo }), caso.archivo);
    const respuesta = await fetch(`${url}/api/driver-applications/me/documents/identity_front`, {
      method: 'PUT', headers: { authorization: `Bearer ${creada.token}` }, body: form
    });
    assert.equal(respuesta.status, 400, `debía rechazarse: ${caso.nombre}`);
    const error = (await respuesta.json()).error;
    assert.ok(['INVALID_FILE_TYPE', 'INVALID_DOCUMENT', 'UPLOAD_FAILED'].includes(error), `error inesperado para ${caso.nombre}: ${error}`);
  }

  // Un PDF legítimo sí se acepta.
  const formValido = new FormData();
  formValido.append('file', new Blob([PDF], { type: 'application/pdf' }), 'valido.pdf');
  const valido = await fetch(`${url}/api/driver-applications/me/documents/identity_front`, {
    method: 'PUT', headers: { authorization: `Bearer ${creada.token}` }, body: formValido
  });
  assert.equal(valido.status, 200);
});
