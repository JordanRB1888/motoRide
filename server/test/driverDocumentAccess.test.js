import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0x20)]);
const REQUIRED_DOCS = [
  'identity_front', 'identity_back', 'driver_license', 'vehicle_registration',
  'vehicle_photo', 'plate_photo', 'driver_selfie'
];

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plus58express-docs-'));
  const port = 12100 + Math.floor(Math.random() * 399);
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'database.json'), JWT_SECRET: 'documents-test-secret' },
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
  assert.equal(r.status, 200);
  return (await r.json()).token;
}

async function submitApplication(url, { email, phone, plate, identityNumber }) {
  const form = new FormData();
  const campos = {
    firstName: 'Nombre', lastName: 'Apellido', identityNumber, birthDate: '1990-01-01',
    phone, email, address: 'Dirección de ejemplo 123', city: 'Ciudad', region: 'Región',
    password: 'password123', vehicleType: 'MOTO', vehicleBrand: 'Marca', vehicleModel: 'Modelo',
    vehicleYear: '2020', vehicleColor: 'Color', vehiclePlate: plate, vehicleAdditionalInfo: 'Nota'
  };
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor);
  for (const tipo of REQUIRED_DOCS) form.append(tipo, new Blob([PNG], { type: 'image/png' }), `${tipo}.png`);
  const response = await fetch(`${url}/api/driver-applications`, { method: 'POST', body: form });
  assert.equal(response.status, 201);
  return response.json();
}

/** Recupera un identificador de documento propio a través de la vista del titular. */
async function primerDocumentoPropio(url, token) {
  const vista = await (await asJson(`${url}/api/driver-applications/me`, token)).json();
  assert.ok(vista.documents?.length, 'la vista del titular debía listar documentos');
  return vista.documents[0].id;
}

const contenido = (url, id, token) => fetch(`${url}/api/driver-documents/${id}/content`, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

test('el propietario y un administrador pueden abrir un documento autorizado', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, {
    email: 'titular@ejemplo.test', phone: '+584140030001', plate: 'DOC001', identityNumber: 'V-99999991'
  });
  const documentId = await primerDocumentoPropio(url, creada.token);

  const propio = await contenido(url, documentId, creada.token);
  assert.equal(propio.status, 200, 'el titular abre su documento');
  assert.equal(propio.headers.get('content-type'), 'image/png');
  assert.equal(propio.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(propio.headers.get('x-content-type-options'), 'nosniff');

  const comoAdmin = await contenido(url, documentId, adminToken);
  assert.equal(comoAdmin.status, 200, 'administración abre el documento');
  assert.equal(comoAdmin.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('un documento ajeno responde igual que uno inexistente', async (t) => {
  const { url } = await startServer(t);
  const titular = await submitApplication(url, {
    email: 'titular2@ejemplo.test', phone: '+584140030002', plate: 'DOC002', identityNumber: 'V-99999992'
  });
  const ajeno = await submitApplication(url, {
    email: 'tercero@ejemplo.test', phone: '+584140030003', plate: 'DOC003', identityNumber: 'V-99999993'
  });
  const documentoDelTitular = await primerDocumentoPropio(url, titular.token);

  // El tercero pide un documento que existe pero no es suyo.
  const respuestaAjena = await contenido(url, documentoDelTitular, ajeno.token);
  // Y pide uno que no existe en absoluto.
  const respuestaInexistente = await contenido(url, 'driver_document_00000000-0000-0000-0000-000000000000', ajeno.token);

  assert.equal(respuestaAjena.status, 404, 'un documento ajeno no revela que existe');
  assert.equal(respuestaInexistente.status, 404);

  const cuerpoAjeno = await respuestaAjena.text();
  const cuerpoInexistente = await respuestaInexistente.text();
  assert.equal(cuerpoAjeno, cuerpoInexistente, 'los cuerpos deben ser indistinguibles');
  assert.equal(JSON.parse(cuerpoAjeno).error, 'DOCUMENT_NOT_FOUND');
  assert.equal(Object.keys(JSON.parse(cuerpoAjeno)).length, 1, 'solo el código de error');

  // Ni las cabeceras relevantes permiten distinguir un caso del otro.
  for (const cabecera of ['content-type', 'content-length', 'content-disposition']) {
    assert.equal(
      respuestaAjena.headers.get(cabecera),
      respuestaInexistente.headers.get(cabecera),
      `la cabecera ${cabecera} no debe delatar la existencia`
    );
  }

  // Y nada en la respuesta apunta al propietario ni al almacenamiento.
  for (const marca of ['titular2@ejemplo.test', 'V-99999992', 'storageKey', 'identity_front', '.png']) {
    assert.ok(!cuerpoAjeno.includes(marca), `la respuesta no debía contener: ${marca}`);
  }
});

test('sin sesión se responde 401 y nunca el contenido', async (t) => {
  const { url } = await startServer(t);
  const titular = await submitApplication(url, {
    email: 'titular3@ejemplo.test', phone: '+584140030004', plate: 'DOC004', identityNumber: 'V-99999994'
  });
  const documentId = await primerDocumentoPropio(url, titular.token);

  const sinSesion = await contenido(url, documentId, null);
  assert.equal(sinSesion.status, 401);
  const cuerpo = await sinSesion.text();
  assert.ok(!cuerpo.includes('titular3@ejemplo.test'));
  assert.ok(!cuerpo.includes('storageKey'));

  // Con un token inventado tampoco.
  const tokenFalso = await fetch(`${url}/api/driver-documents/${documentId}/content`, {
    headers: { authorization: 'Bearer token.completamente.invalido' }
  });
  assert.equal(tokenFalso.status, 401);
});

test('ninguna respuesta de solicitudes contiene rutas de almacenamiento', async (t) => {
  const { url } = await startServer(t);
  const adminToken = await login(url, 'admin@58express.com', 'admin', 'admin');
  const creada = await submitApplication(url, {
    email: 'rutas@ejemplo.test', phone: '+584140030005', plate: 'DOC005', identityNumber: 'V-99999995'
  });

  const respuestas = {
    'registro': JSON.stringify(creada),
    'vista del titular': await (await asJson(`${url}/api/driver-applications/me`, creada.token)).text(),
    'listado admin': await (await asJson(`${url}/api/admin/driver-applications`, adminToken)).text(),
    'detalle admin': await (await asJson(`${url}/api/admin/driver-applications/${creada.application.id}`, adminToken)).text()
  };

  for (const [nombre, cuerpo] of Object.entries(respuestas)) {
    for (const marca of ['storageKey', 'contentUrl', '.png', 'private-uploads', 'C:\\', '/data/']) {
      assert.ok(!cuerpo.includes(marca), `${nombre} no debía contener: ${marca}`);
    }
  }
});
