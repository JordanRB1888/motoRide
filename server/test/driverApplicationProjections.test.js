import test from 'node:test';
import assert from 'node:assert/strict';
import {
  driverApplicationListItem,
  driverApplicationAdminDetail,
  driverApplicationOwnerView,
  driverDocumentMetadata,
  driverApplicationEvent
} from '../domain/driverApplicationProjections.js';

/** Expediente con todo lo que el modelo puede acumular hoy y mañana. */
function fullApplication() {
  return {
    id: 'application_1',
    userId: 'user_1',
    status: 'pending',
    submittedAt: '2026-08-10T10:00:00.000Z',
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-10T11:00:00.000Z',
    reviewedBy: 'admin_1',
    reviewedAt: '2026-08-11T10:00:00.000Z',
    decisionReason: 'Falta el reverso de la cédula',
    requestedChanges: ['identity_back'],
    personal: {
      firstName: 'Nombre', lastName: 'Apellido',
      identityNumber: 'X-0000000', birthDate: '1990-01-01',
      phone: '+580000000000', email: 'aspirante@ejemplo.test',
      address: 'Dirección de ejemplo 123', city: 'Ciudad', region: 'Región'
    },
    vehicle: {
      type: 'MOTO', brand: 'Marca', model: 'Modelo', year: 2020,
      color: 'Color', plate: 'PLACA01', additionalInfo: 'Nota del vehículo'
    },
    // Campos internos que nunca deben salir.
    internalNotes: 'nota interna de revisión',
    futureSensitiveField: 'campo que alguien añadirá mañana'
  };
}

function fullDocuments() {
  return [
    { id: 'doc_1', applicationId: 'application_1', userId: 'user_1', type: 'identity_front',
      status: 'approved', mimeType: 'image/jpeg', size: 120345, updatedAt: '2026-08-10T10:05:00.000Z',
      storageKey: 'user_1/00000000-0000-0000-0000-000000000001.jpg',
      originalName: 'documento-personal.jpg', futureSensitiveField: 'x' },
    { id: 'doc_2', applicationId: 'application_1', userId: 'user_1', type: 'driver_license',
      status: 'pending', mimeType: 'application/pdf', size: 90210, updatedAt: '2026-08-10T10:06:00.000Z',
      storageKey: 'user_1/00000000-0000-0000-0000-000000000002.pdf',
      originalName: 'licencia.pdf' }
  ];
}

const applicantUser = () => ({
  id: 'user_1', firstName: 'Nombre', lastName: 'Apellido',
  email: 'aspirante@ejemplo.test', phone: '+580000000000',
  accountStatus: 'ACTIVE', passwordHash: '$2b$12$ejemplo', photoStorageKey: 'user_1/foto.jpg',
  walletBalance: 12.5, futureSensitiveField: 'x'
});

/** Nunca pueden aparecer en un listado ni en un evento. */
const PROHIBIDOS_EN_LISTADO = [
  'personal', 'vehicle', 'documents', 'contentUrl', 'storageKey', 'originalName',
  'identityNumber', 'birthDate', 'address', 'city', 'region', 'email', 'phone',
  'userId', 'reviewedBy', 'internalNotes', 'futureSensitiveField'
];

test('driverDocumentMetadata devuelve exactamente las claves permitidas', () => {
  const meta = driverDocumentMetadata(fullDocuments()[0]);
  assert.deepEqual(Object.keys(meta).sort(), ['id', 'mimeType', 'size', 'status', 'type', 'updatedAt']);
});

test('driverDocumentMetadata no expone almacenamiento ni nombre original', () => {
  const meta = driverDocumentMetadata(fullDocuments()[0]);
  for (const campo of ['storageKey', 'originalName', 'contentUrl', 'applicationId', 'userId', 'futureSensitiveField']) {
    assert.equal(meta[campo], undefined, `no debía propagarse: ${campo}`);
  }
  const crudo = JSON.stringify(meta);
  assert.ok(!crudo.includes('00000000-0000'), 'no debe aparecer la clave de almacenamiento');
  assert.ok(!crudo.includes('.jpg'), 'no debe aparecer una ruta de archivo');
});

test('driverApplicationListItem devuelve exactamente las claves permitidas', () => {
  const item = driverApplicationListItem(fullApplication(), fullDocuments(), applicantUser());
  assert.deepEqual(
    Object.keys(item).sort(),
    ['applicantName', 'createdAt', 'decisionReason', 'documentCount', 'documentsPendingCount',
     'id', 'status', 'submittedAt', 'updatedAt', 'vehiclePlate', 'vehicleType'].sort()
  );
});

test('el listado no contiene datos personales ni referencias de almacenamiento', () => {
  const item = driverApplicationListItem(fullApplication(), fullDocuments(), applicantUser());
  for (const campo of PROHIBIDOS_EN_LISTADO) {
    assert.equal(item[campo], undefined, `no debía propagarse: ${campo}`);
  }
  const crudo = JSON.stringify(item);
  assert.ok(!crudo.includes('X-0000000'), 'no debe aparecer la cédula');
  assert.ok(!crudo.includes('1990-01-01'), 'no debe aparecer la fecha de nacimiento');
  assert.ok(!crudo.includes('aspirante@ejemplo.test'), 'no debe aparecer el correo');
  assert.ok(!crudo.includes('+580000000000'), 'no debe aparecer el teléfono');
  assert.ok(!crudo.includes('Dirección'), 'no debe aparecer la dirección');
  assert.ok(!crudo.includes('storageKey'), 'no debe aparecer la clave de almacenamiento');
  assert.ok(!crudo.includes('contentUrl'), 'no debe aparecer la ruta del contenido');
});

test('el listado conserva lo que la cola necesita para operar', () => {
  const item = driverApplicationListItem(fullApplication(), fullDocuments(), applicantUser());
  assert.equal(item.id, 'application_1');
  assert.equal(item.status, 'pending');
  assert.equal(item.applicantName, 'Nombre Apellido');
  assert.equal(item.vehicleType, 'MOTO');
  assert.equal(item.vehiclePlate, 'PLACA01');
  assert.equal(item.documentCount, 2);
  assert.equal(item.documentsPendingCount, 1, 'uno aprobado y uno pendiente');
  assert.equal(item.decisionReason, 'Falta el reverso de la cédula');
});

test('un campo futuro del modelo no llega al listado', () => {
  const item = driverApplicationListItem(
    { ...fullApplication(), futureSensitiveField: 'secreto' },
    [{ ...fullDocuments()[0], futureSensitiveField: 'secreto' }],
    { ...applicantUser(), futureSensitiveField: 'secreto' }
  );
  assert.ok(!JSON.stringify(item).includes('secreto'));
});

test('driverApplicationAdminDetail entrega el expediente con lista blanca', () => {
  const detalle = driverApplicationAdminDetail(fullApplication(), fullDocuments(), applicantUser());
  assert.deepEqual(
    Object.keys(detalle).sort(),
    ['applicant', 'createdAt', 'decisionReason', 'documents', 'id', 'personal', 'requestedChanges',
     'reviewedAt', 'reviewedBy', 'status', 'submittedAt', 'updatedAt', 'vehicle'].sort()
  );
  assert.deepEqual(
    Object.keys(detalle.personal).sort(),
    ['address', 'birthDate', 'city', 'email', 'firstName', 'identityNumber', 'lastName', 'phone', 'region'].sort()
  );
  assert.deepEqual(
    Object.keys(detalle.vehicle).sort(),
    ['additionalInfo', 'brand', 'color', 'model', 'plate', 'type', 'year'].sort()
  );
  assert.deepEqual(Object.keys(detalle.applicant).sort(), ['accountStatus', 'firstName', 'id', 'lastName']);

  // El expediente sí incluye la identificación: es su función.
  assert.equal(detalle.personal.identityNumber, 'X-0000000');
  // Pero nunca datos internos ni del almacén.
  assert.equal(detalle.internalNotes, undefined);
  assert.equal(detalle.userId, undefined);
  assert.equal(detalle.futureSensitiveField, undefined);
  assert.ok(!JSON.stringify(detalle).includes('storageKey'));
  assert.ok(!JSON.stringify(detalle).includes('contentUrl'));
  // Ni credenciales del solicitante.
  assert.ok(!JSON.stringify(detalle.applicant).includes('$2b$'));
  assert.equal(detalle.applicant.walletBalance, undefined);
});

test('driverApplicationOwnerView oculta la trazabilidad interna', () => {
  const vista = driverApplicationOwnerView(fullApplication(), fullDocuments());
  assert.deepEqual(
    Object.keys(vista).sort(),
    ['createdAt', 'decisionReason', 'documents', 'id', 'personal', 'requestedChanges',
     'status', 'submittedAt', 'updatedAt', 'vehicle'].sort()
  );
  assert.equal(vista.reviewedBy, undefined, 'quién revisó es información administrativa');
  assert.equal(vista.reviewedAt, undefined);
  assert.equal(vista.applicant, undefined, 'no incluye datos de usuario ajenos al expediente');
  assert.equal(vista.internalNotes, undefined);
  assert.ok(!JSON.stringify(vista).includes('storageKey'));
  assert.ok(!JSON.stringify(vista).includes('contentUrl'));

  // Sus propios datos sí los recibe: los necesita para corregirlos.
  assert.equal(vista.personal.identityNumber, 'X-0000000');
  assert.equal(vista.decisionReason, 'Falta el reverso de la cédula');
  assert.deepEqual(vista.requestedChanges, ['identity_back']);
  assert.equal(vista.documents.length, 2);
});

test('driverApplicationEvent solo señala que algo cambió', () => {
  const evento = driverApplicationEvent(fullApplication());
  assert.deepEqual(Object.keys(evento).sort(), ['applicationId', 'status', 'updatedAt']);
  const crudo = JSON.stringify(evento);
  for (const marca of ['X-0000000', 'aspirante@ejemplo.test', '+580000000000', 'Dirección', 'storageKey', 'contentUrl', 'personal', 'documents']) {
    assert.ok(!crudo.includes(marca), `el evento no debía contener: ${marca}`);
  }
  // Permite forzar el estado resultante de una decisión.
  assert.equal(driverApplicationEvent(fullApplication(), { status: 'approved' }).status, 'approved');
});

test('las proyecciones toleran datos incompletos sin lanzar', () => {
  assert.equal(driverApplicationListItem(null), null);
  assert.equal(driverApplicationAdminDetail(null), null);
  assert.equal(driverApplicationOwnerView(undefined), null);
  assert.equal(driverDocumentMetadata(null), null);
  assert.equal(driverApplicationEvent(null), null);

  const vacio = driverApplicationListItem({}, null, null);
  assert.equal(vacio.id, null);
  assert.equal(vacio.applicantName, '');
  assert.equal(vacio.vehicleType, 'MOTO');
  assert.equal(vacio.documentCount, 0);
  assert.equal(vacio.documentsPendingCount, 0);

  const detalleVacio = driverApplicationAdminDetail({}, undefined, null);
  assert.equal(detalleVacio.applicant, null);
  assert.deepEqual(detalleVacio.requestedChanges, []);
  assert.equal(detalleVacio.personal.identityNumber, '');
  assert.equal(detalleVacio.vehicle.year, 0);
  assert.deepEqual(detalleVacio.documents, []);
});

test('el nombre del solicitante cae al usuario cuando el expediente no lo trae', () => {
  const item = driverApplicationListItem(
    { id: 'application_2', personal: {}, vehicle: { type: 'CAR', plate: 'PLACA02' } },
    [],
    { firstName: 'Otro', lastName: 'Aspirante' }
  );
  assert.equal(item.applicantName, 'Otro Aspirante');
  assert.equal(item.vehicleType, 'CAR');
});
