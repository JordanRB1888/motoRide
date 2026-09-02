import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_CHECKPOINTS,
  CHECKPOINT_STATUS,
  DRIVER_DOCUMENT_CATALOG,
  DRIVER_DOCUMENT_TYPES,
  DRIVER_SERVICES,
  LICENSE_GRADES_BY_VEHICLE,
  REQUIREMENTS_VERSION,
  REQUIRED_DRIVER_DOCUMENTS,
  UPLOADABLE_DOCUMENT_TYPES,
  VEHICLE_LEGAL_DOCUMENT_TYPES,
  VEHICLE_TYPES,
  defaultCheckpoints,
  missingRequiredDocuments,
  normalizeRequestedChanges,
  normalizeStoredApplication,
  requiredDocumentsFor,
  validateApplicationForSubmission,
  validateDriverApplicationInput
} from '../domain/driverApplicationModel.js';

// El contrato canónico del expediente: vehículo y servicio como dos
// dimensiones, documentos condicionales por vehículo, y compatibilidad con lo
// que ya está guardado.

const NOW = new Date('2026-09-02T12:00:00Z');

const valid = (overrides = {}) => ({
  servicesAppliedFor: ['PASSENGER_TRANSPORT'],
  firstName: 'María',
  lastName: 'Conductora',
  identityNumber: 'V-24.680.135',
  rif: 'V-24680135-7',
  birthDate: '1994-05-20',
  phone: '+584120009999',
  email: 'maria@example.com',
  password: 'ClaveSegura123',
  address: 'Avenida principal, Maracaibo',
  city: 'Maracaibo',
  region: 'Zulia',
  vehicleType: 'MOTO',
  vehicleBrand: 'Bera',
  vehicleModel: 'BR200',
  vehicleYear: '2024',
  vehicleColor: 'Amarillo',
  vehiclePlate: 'APP58X',
  licenseGrade: '2',
  licenseExpiration: '2028-01-01',
  ...overrides
});

// ---------------------------------------------------------------------------
// Las dos dimensiones
// ---------------------------------------------------------------------------

test('vehículo y servicio son listas cerradas y separadas', () => {
  assert.deepEqual([...VEHICLE_TYPES], ['MOTO', 'CAR']);
  assert.deepEqual([...DRIVER_SERVICES], ['PASSENGER_TRANSPORT', 'DELIVERY']);
  // Ninguna cadena combinada: las dos dimensiones bastan.
  assert.equal(DRIVER_SERVICES.some(item => item.includes('MOTO') || item.includes('CAR')), false);
});

test('toda combinación de vehículo y servicios es válida', () => {
  for (const vehicleType of VEHICLE_TYPES) {
    for (const services of [['PASSENGER_TRANSPORT'], ['DELIVERY'], ['PASSENGER_TRANSPORT', 'DELIVERY']]) {
      const grade = vehicleType === 'MOTO' ? '2' : '3';
      const result = validateDriverApplicationInput(valid({ vehicleType, servicesAppliedFor: services, licenseGrade: grade }), { now: NOW });
      assert.equal(result.valid, true, `${vehicleType} + ${services.join('+')}: ${JSON.stringify(result.errors)}`);
      assert.deepEqual([...result.normalized.servicesAppliedFor], services);
    }
  }
});

test('sin servicio no hay expediente', () => {
  const result = validateDriverApplicationInput(valid({ servicesAppliedFor: [] }), { now: NOW });
  assert.equal(result.valid, false);
  assert.match(result.errors.servicesAppliedFor, /al menos un servicio/);
});

test('los servicios se normalizan: mayúsculas, sin duplicados, sin desconocidos', () => {
  const result = validateDriverApplicationInput(valid({ servicesAppliedFor: ['delivery', 'DELIVERY', 'TELETRANSPORTE'] }), { now: NOW });
  assert.deepEqual([...result.normalized.servicesAppliedFor], ['DELIVERY']);
  // También llega como cadena separada por comas desde un formulario multipart.
  const fromForm = validateDriverApplicationInput(valid({ servicesAppliedFor: 'PASSENGER_TRANSPORT,DELIVERY' }), { now: NOW });
  assert.deepEqual([...fromForm.normalized.servicesAppliedFor], ['PASSENGER_TRANSPORT', 'DELIVERY']);
});

// ---------------------------------------------------------------------------
// Los documentos, por vehículo
// ---------------------------------------------------------------------------

test('el tronco común es el mismo para moto y carro', () => {
  const comunes = DRIVER_DOCUMENT_CATALOG.filter(item => item.requirement === 'common').map(item => item.type);
  assert.deepEqual(comunes, [
    'identity_front', 'identity_back', 'rif', 'driver_license', 'medical_certificate',
    'vehicle_registration', 'vehicle_front', 'vehicle_rear', 'plate_photo', 'driver_selfie'
  ]);
  for (const vehicleType of VEHICLE_TYPES) {
    for (const type of comunes) assert.ok(requiredDocumentsFor({ vehicleType }).includes(type), `${vehicleType} sin ${type}`);
  }
});

test('la moto exige los cascos; el carro, el interior trasero', () => {
  const moto = requiredDocumentsFor({ vehicleType: 'MOTO' });
  const car = requiredDocumentsFor({ vehicleType: 'CAR' });
  assert.ok(moto.includes('moto_helmets'));
  assert.equal(moto.includes('car_rear_interior'), false);
  assert.ok(car.includes('car_rear_interior'));
  assert.equal(car.includes('moto_helmets'), false);
  assert.equal(moto.length, 11);
  assert.equal(car.length, 11);
});

test('el seguro y el vídeo no se exigen, y el vídeo todavía no se puede subir', () => {
  for (const vehicleType of VEHICLE_TYPES) {
    const required = requiredDocumentsFor({ vehicleType });
    assert.equal(required.includes('vehicle_insurance'), false);
    assert.equal(required.includes('presentation_video'), false);
  }
  assert.ok(DRIVER_DOCUMENT_TYPES.includes('presentation_video'), 'el vídeo está modelado');
  assert.equal(UPLOADABLE_DOCUMENT_TYPES.includes('presentation_video'), false, 'el vídeo se puede subir sin almacenamiento que lo admita');
  assert.ok(UPLOADABLE_DOCUMENT_TYPES.includes('vehicle_insurance'));
});

test('faltan los que faltan, según el vehículo del expediente', () => {
  const docs = ['identity_front', 'identity_back', 'rif', 'driver_license', 'medical_certificate',
    'vehicle_registration', 'vehicle_front', 'vehicle_rear', 'plate_photo', 'driver_selfie'].map(type => ({ type }));
  const moto = { requirementsVersion: 2, vehicle: { type: 'MOTO' } };
  const car = { requirementsVersion: 2, vehicle: { type: 'CAR' } };
  assert.deepEqual(missingRequiredDocuments(docs, moto), ['moto_helmets']);
  assert.deepEqual(missingRequiredDocuments(docs, car), ['car_rear_interior']);
  assert.deepEqual(missingRequiredDocuments([...docs, { type: 'moto_helmets' }], moto), []);
});

// ---------------------------------------------------------------------------
// Los expedientes viejos no se rompen
// ---------------------------------------------------------------------------

test('un expediente sin versión se evalúa con los siete documentos de siempre', () => {
  const legacy = { vehicle: { type: 'MOTO' } };
  assert.deepEqual([...requiredDocumentsFor({ requirementsVersion: 1 })], [...REQUIRED_DRIVER_DOCUMENTS]);
  const docs = REQUIRED_DRIVER_DOCUMENTS.map(type => ({ type }));
  assert.deepEqual(missingRequiredDocuments(docs, legacy), []);
  // Y sin expediente, como antes: versión 1.
  assert.deepEqual(missingRequiredDocuments(docs), []);
  assert.deepEqual(missingRequiredDocuments([]), [...REQUIRED_DRIVER_DOCUMENTS]);
});

test('la foto del vehículo de la versión 1 cuenta como la de frente en la 2', () => {
  const docs = requiredDocumentsFor({ vehicleType: 'MOTO' })
    .filter(type => type !== 'vehicle_front')
    .map(type => ({ type }));
  docs.push({ type: 'vehicle_photo' });
  assert.deepEqual(missingRequiredDocuments(docs, { requirementsVersion: 2, vehicle: { type: 'MOTO' } }), []);
});

test('normalizeStoredApplication rellena lo que no existía, sin mutar', () => {
  const stored = Object.freeze({
    id: 'a1', status: 'pending',
    personal: Object.freeze({ firstName: 'Ana', lastName: 'Pérez' }),
    vehicle: Object.freeze({ type: 'CAR', plate: 'AB123CD' }),
    requestedChanges: ['driver_license'],
    decisionReason: 'Borrosa'
  });
  const normalized = normalizeStoredApplication(stored);
  assert.equal(normalized.requirementsVersion, 1);
  assert.deepEqual([...normalized.servicesAppliedFor], ['PASSENGER_TRANSPORT']);
  assert.equal(normalized.personal.rif, '');
  assert.equal(normalized.vehicle.legalDocumentType, 'CIRCULATION_CARD');
  assert.deepEqual(normalized.license, { grade: null, expiration: null });
  assert.deepEqual(normalized.medicalCertificate, { expiration: null });
  assert.deepEqual(normalized.checkpoints, defaultCheckpoints());
  // Las correcciones viejas —solo tipos— pasan a llevar el motivo global.
  assert.deepEqual(normalized.requestedChangeDetails, [{ type: 'driver_license', reason: 'Borrosa' }]);
  assert.deepEqual(normalized.requestedChanges, ['driver_license']);
  assert.equal(normalized.textualCorrections, null);
  // Sin tocar el original.
  assert.equal('requirementsVersion' in stored, false);
});

test('un expediente de versión 1 no necesita RIF ni licencia para enviarse', () => {
  const legacy = { requirementsVersion: 1, personal: {}, vehicle: { type: 'MOTO' } };
  assert.equal(validateApplicationForSubmission(legacy, { now: NOW }).valid, true);
});

// ---------------------------------------------------------------------------
// La licencia, el RIF y el certificado médico
// ---------------------------------------------------------------------------

test('la regla de grados es la única autoridad y es la que pidió el dueño', () => {
  assert.deepEqual(LICENSE_GRADES_BY_VEHICLE, { MOTO: [2], CAR: [3, 4, 5] });
});

test('el grado de la licencia tiene que servir para el vehículo', () => {
  const motoConTercero = validateDriverApplicationInput(valid({ vehicleType: 'MOTO', licenseGrade: '3' }), { now: NOW });
  assert.match(motoConTercero.errors.licenseGrade, /segundo grado/);
  const carroConSegundo = validateDriverApplicationInput(valid({ vehicleType: 'CAR', licenseGrade: '2' }), { now: NOW });
  assert.match(carroConSegundo.errors.licenseGrade, /tercer, cuarto o quinto/);
  for (const grade of ['3', '4', '5']) {
    assert.equal(validateDriverApplicationInput(valid({ vehicleType: 'CAR', licenseGrade: grade }), { now: NOW }).valid, true);
  }
});

test('la licencia y el RIF pueden faltar en un borrador, no al enviar', () => {
  const draft = validateDriverApplicationInput(valid({ licenseGrade: '', licenseExpiration: '', rif: '' }), { now: NOW });
  assert.equal(draft.valid, true);
  const submission = validateDriverApplicationInput(valid({ licenseGrade: '', licenseExpiration: '', rif: '' }), { now: NOW, forSubmission: true });
  assert.equal(submission.valid, false);
  assert.ok(submission.errors.licenseGrade);
  assert.ok(submission.errors.licenseExpiration);
  assert.ok(submission.errors.rif);
});

test('una licencia vencida no vale, ni un certificado médico vencido', () => {
  const vencida = validateDriverApplicationInput(valid({ licenseExpiration: '2026-09-01' }), { now: NOW });
  assert.match(vencida.errors.licenseExpiration, /vencida/);
  const medico = validateDriverApplicationInput(valid({ medicalCertificateExpiration: '2025-12-31' }), { now: NOW });
  assert.match(medico.errors.medicalCertificateExpiration, /vencido/);
  // Y una fecha que no es fecha no se inventa: se descarta.
  const rara = validateDriverApplicationInput(valid({ medicalCertificateExpiration: 'pronto' }), { now: NOW });
  assert.equal(rara.normalized.medicalCertificate.expiration, null);
});

test('el RIF se normaliza y se valida como RIF', () => {
  const ok = validateDriverApplicationInput(valid({ rif: 'v 24680135 7' }), { now: NOW });
  assert.equal(ok.normalized.personal.rif, 'V-24680135-7');
  const mal = validateDriverApplicationInput(valid({ rif: 'V-24680135' }), { now: NOW });
  assert.match(mal.errors.rif, /RIF válido/);
});

test('el documento legal del vehículo es una de tres opciones, y por omisión el carnet', () => {
  assert.deepEqual([...VEHICLE_LEGAL_DOCUMENT_TYPES], ['CIRCULATION_CARD', 'OWNERSHIP_TITLE', 'ORIGIN_CERTIFICATE']);
  const titulo = validateDriverApplicationInput(valid({ vehicleLegalDocumentType: 'ownership_title' }), { now: NOW });
  assert.equal(titulo.normalized.vehicle.legalDocumentType, 'OWNERSHIP_TITLE');
  const raro = validateDriverApplicationInput(valid({ vehicleLegalDocumentType: 'FACTURA' }), { now: NOW });
  assert.equal(raro.normalized.vehicle.legalDocumentType, 'CIRCULATION_CARD');
});

// ---------------------------------------------------------------------------
// Controles administrativos y correcciones
// ---------------------------------------------------------------------------

test('los controles nacen sin simular que se hicieron', () => {
  assert.deepEqual([...ADMIN_CHECKPOINTS], ['DOCUMENTS_REVIEW', 'VEHICLE_INSPECTION', 'PSYCHOTECHNICAL_REVIEW', 'ORIENTATION_TUTORIAL']);
  assert.deepEqual([...CHECKPOINT_STATUS], ['NOT_REQUIRED', 'PENDING', 'PASSED', 'FAILED']);
  const checkpoints = defaultCheckpoints();
  assert.equal(checkpoints.DOCUMENTS_REVIEW, 'PENDING');
  for (const name of ['VEHICLE_INSPECTION', 'PSYCHOTECHNICAL_REVIEW', 'ORIENTATION_TUTORIAL']) {
    assert.equal(checkpoints[name], 'NOT_REQUIRED', `${name} no debería simular nada`);
  }
});

test('las correcciones por documento conservan el motivo de cada una', () => {
  const details = normalizeRequestedChanges(
    [{ type: 'plate_photo', reason: 'No se lee' }, 'driver_selfie', { type: 'inventado', reason: 'x' }],
    'Motivo general'
  );
  assert.deepEqual(details, [
    { type: 'plate_photo', reason: 'No se lee' },
    { type: 'driver_selfie', reason: 'Motivo general' }
  ]);
  // Sin duplicados.
  assert.equal(normalizeRequestedChanges(['rif', 'rif']).length, 1);
});

test('la versión de requisitos vigente es la 2', () => {
  assert.equal(REQUIREMENTS_VERSION, 2);
});
