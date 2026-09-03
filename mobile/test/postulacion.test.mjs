import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CIUDADES,
  DOCUMENTOS,
  DOCUMENTOS_LEGALES_DEL_VEHICULO,
  GRADOS_DE_LICENCIA,
  PASOS,
  SERVICIOS,
  SERVICIOS_DEL_SERVIDOR,
  VEHICULOS,
  avanceDeLaPostulacion,
  describirServicio,
  documentosQueFaltan,
  documentosRequeridos,
  edadEn,
  esCiudadCubierta,
  normalizarCedula,
  normalizarPlaca,
  normalizarRif,
  pasoCompleto,
  regionDeLaCiudad,
  validarCertificadoMedico,
  validarContrasena,
  validarLicencia,
  validarPersonales,
  validarVehiculo
} from '../domain/postulacion.ts';

/**
 * POSTULACIÓN DE CONDUCTOR — lo que se comprueba antes de mandar nada.
 *
 * LO QUE SE PROTEGE
 *
 * Que las reglas de esta pantalla sean las MISMAS que las del servidor. Si el
 * cliente es más permisivo, la persona rellena todo y el envío falla al final
 * con un error que no entiende; si es más estricto, bloquea a alguien que sí
 * podía postularse. Por eso varias pruebas leen
 * `server/domain/driverApplicationModel.js` y comparan.
 *
 * Y que nada de aquí conceda nada: aprobar es del backend.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const servidor = fs.readFileSync(
  path.resolve(raizMovil, '..', 'server', 'domain', 'driverApplicationModel.js'),
  'utf8'
);
const AHORA = new Date('2026-09-02T12:00:00Z');

const PERSONALES = Object.freeze({
  nombre: 'Luis', apellido: 'Gómez', cedula: 'V-12345678', rif: 'V-12345678-9',
  nacimiento: '1995-04-12', telefono: '04141234567', correo: 'luis@ejemplo.com',
  direccion: 'Calle 72 con avenida 3H, Maracaibo', ciudad: 'Maracaibo'
});
const VEHICULO = Object.freeze({ tipo: 'MOTO', marca: 'Bera', modelo: 'SBR', ano: '2021', color: 'Negro', placa: 'AB123CD', documentoLegal: 'CIRCULATION_CARD' });
const LICENCIA = Object.freeze({ grado: '2', vencimiento: '2028-01-01' });

const listaDelServidor = nombre => {
  const bloque = servidor.match(new RegExp(`${nombre} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`));
  assert.ok(bloque, `no encuentro ${nombre} en el servidor`);
  return [...bloque[1].matchAll(/'([A-Za-z_]+)'/g)].map(item => item[1]);
};

// ---------------------------------------------------------------------------
// Las dos dimensiones son las del servidor
// ---------------------------------------------------------------------------

test('vehículos y servicios son EXACTAMENTE los del servidor', () => {
  assert.deepEqual([...VEHICULOS], listaDelServidor('VEHICLE_TYPES'));
  assert.deepEqual([...SERVICIOS_DEL_SERVIDOR], listaDelServidor('DRIVER_SERVICES'));
  assert.deepEqual(SERVICIOS.map(item => item.clave), [...SERVICIOS_DEL_SERVIDOR]);
  assert.deepEqual(DOCUMENTOS_LEGALES_DEL_VEHICULO.map(item => item.clave), listaDelServidor('VEHICLE_LEGAL_DOCUMENT_TYPES'));
});

test('la regla de grados de licencia es la del servidor', () => {
  const bloque = servidor.match(/LICENSE_GRADES_BY_VEHICLE = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(bloque);
  const moto = [...bloque[1].match(/MOTO: Object\.freeze\(\[([^\]]*)\]\)/)[1].matchAll(/\d/g)].map(m => Number(m[0]));
  const car = [...bloque[1].match(/CAR: Object\.freeze\(\[([^\]]*)\]\)/)[1].matchAll(/\d/g)].map(m => Number(m[0]));
  assert.deepEqual([...GRADOS_DE_LICENCIA.MOTO], moto);
  assert.deepEqual([...GRADOS_DE_LICENCIA.CAR], car);
});

test('delivery se puede elegir, y se dice que todavía no opera', () => {
  assert.equal(describirServicio('DELIVERY').operando, false);
  assert.match(describirServicio('DELIVERY').detalle, /pronto/);
  assert.equal(describirServicio('PASSENGER_TRANSPORT').operando, true);
});

// ---------------------------------------------------------------------------
// Los documentos son los del servidor, con su misma exigencia
// ---------------------------------------------------------------------------

test('el catálogo de documentos es el del servidor, tipo por tipo', () => {
  const catalogo = servidor.match(/DRIVER_DOCUMENT_CATALOG = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
  assert.ok(catalogo, 'no encuentro el catálogo del servidor');
  const entradas = [...catalogo[1].matchAll(/type: '([a-z_]+)'[^}]*requirement: '([A-Za-z]+)'/g)]
    .map(m => ({ tipo: m[1], requisito: m[2] }));
  const traducir = { common: 'comun', MOTO: 'MOTO', CAR: 'CAR', optional: 'opcional', legacy: 'heredado' };
  assert.deepEqual(
    DOCUMENTOS.map(d => ({ tipo: d.tipo, requisito: d.requisito })),
    entradas.map(e => ({ tipo: e.tipo, requisito: traducir[e.requisito] }))
  );
});

test('la moto pide los cascos; el carro, el interior trasero; los dos, once', () => {
  const moto = documentosRequeridos('MOTO');
  const carro = documentosRequeridos('CAR');
  assert.equal(moto.length, 11);
  assert.equal(carro.length, 11);
  assert.ok(moto.includes('moto_helmets'));
  assert.equal(moto.includes('car_rear_interior'), false);
  assert.ok(carro.includes('car_rear_interior'));
  assert.equal(carro.includes('moto_helmets'), false);
  for (const tipo of ['rif', 'medical_certificate', 'vehicle_front', 'vehicle_rear', 'driver_selfie']) {
    assert.ok(moto.includes(tipo) && carro.includes(tipo), tipo);
  }
});

test('el seguro y el vídeo no se exigen; el vídeo no se puede subir todavía', () => {
  assert.equal(documentosRequeridos('MOTO').includes('vehicle_insurance'), false);
  assert.equal(documentosRequeridos('MOTO').includes('presentation_video'), false);
  const video = DOCUMENTOS.find(d => d.tipo === 'presentation_video');
  assert.equal(video.subible, false);
  assert.equal(video.medio, 'video');
});

test('la versión 1 sigue siendo los siete de antes', () => {
  assert.deepEqual([...documentosRequeridos('MOTO', 1)], listaDelServidor('REQUIRED_DRIVER_DOCUMENTS'));
});

test('faltan los que faltan, y la foto vieja del vehículo cuenta como la de frente', () => {
  const casiTodo = documentosRequeridos('MOTO').filter(t => t !== 'moto_helmets' && t !== 'vehicle_front');
  assert.deepEqual([...documentosQueFaltan(casiTodo, 'MOTO')], ['vehicle_front', 'moto_helmets']);
  assert.deepEqual([...documentosQueFaltan([...casiTodo, 'vehicle_photo', 'moto_helmets'], 'MOTO')], []);
  // Cambiar de vehículo cambia lo que falta.
  assert.deepEqual([...documentosQueFaltan([...casiTodo, 'vehicle_front', 'moto_helmets'], 'CAR')], ['car_rear_interior']);
});

test('cada documento dice qué tiene que salir en la foto', () => {
  for (const documento of DOCUMENTOS) {
    assert.ok(documento.titulo.length > 2, `${documento.tipo} sin título`);
    assert.ok(documento.instruccion.length > 15, `${documento.tipo} sin instrucción útil`);
  }
});

// ---------------------------------------------------------------------------
// Normalización, como en el servidor
// ---------------------------------------------------------------------------

test('la cédula, el RIF y la placa se normalizan como en el servidor', () => {
  assert.equal(normalizarCedula('v12345678'), 'V-12345678');
  assert.equal(normalizarCedula('V-12.345.678'), 'V-12345678');
  assert.equal(normalizarRif('v 12345678 9'), 'V-12345678-9');
  assert.equal(normalizarRif('V-12345678'), 'V12345678', 'una cédula sin verificador no se convierte en RIF');
  assert.equal(normalizarRif(''), '');
  assert.equal(normalizarPlaca('ab 123 cd'), 'AB123CD');
  assert.equal(edadEn('2000-01-01', AHORA), 26);
  assert.equal(edadEn('no-es-fecha', AHORA), -1);
});

// ---------------------------------------------------------------------------
// Los datos personales
// ---------------------------------------------------------------------------

test('unos datos correctos pasan, con y sin RIF en borrador', () => {
  assert.ok(pasoCompleto(validarPersonales(PERSONALES, { ahora: AHORA })));
  assert.ok(pasoCompleto(validarPersonales({ ...PERSONALES, rif: '' }, { ahora: AHORA })));
});

test('el RIF hace falta para enviar, y si está tiene que ser un RIF', () => {
  assert.match(validarPersonales({ ...PERSONALES, rif: '' }, { paraEnvio: true, ahora: AHORA }).rif, /hace falta/);
  assert.match(validarPersonales({ ...PERSONALES, rif: 'V-12345678' }, { ahora: AHORA }).rif, /RIF completo/);
});

test('menor de edad no puede postularse', () => {
  assert.match(validarPersonales({ ...PERSONALES, nacimiento: '2012-01-01' }, { ahora: AHORA }).nacimiento, /mayor de edad/);
});

test('cada campo que falta tiene su propio aviso, en su idioma', () => {
  const errores = validarPersonales({
    nombre: 'L', apellido: '', cedula: 'abc', rif: '', nacimiento: '',
    telefono: '123', correo: 'no-es-correo', direccion: 'corta', ciudad: ''
  }, { ahora: AHORA });
  for (const campo of ['nombre', 'apellido', 'cedula', 'nacimiento', 'telefono', 'correo', 'direccion', 'ciudad']) {
    assert.ok(errores[campo], `${campo} sin aviso`);
    assert.equal(/error|invalid|failed/i.test(errores[campo]), false, `${campo} habla en jerga`);
  }
});

test('sólo se puede postular en una ciudad donde se opera', () => {
  assert.equal(esCiudadCubierta('Maracaibo'), true);
  assert.equal(esCiudadCubierta('mara'), true);
  assert.equal(esCiudadCubierta('Caracas'), false);
  assert.equal(regionDeLaCiudad('Maracaibo'), 'Zulia');
  assert.equal(regionDeLaCiudad('Caracas'), null);
  assert.match(validarPersonales({ ...PERSONALES, ciudad: 'Caracas' }, { ahora: AHORA }).ciudad, /Todavía no operamos/);
  assert.deepEqual(CIUDADES.map(item => item.ciudad), ['Maracaibo', 'Mara']);
});

// ---------------------------------------------------------------------------
// El vehículo, la licencia y el certificado
// ---------------------------------------------------------------------------

test('un vehículo correcto pasa; el año y la placa siguen al servidor', () => {
  assert.ok(pasoCompleto(validarVehiculo(VEHICULO, AHORA)));
  assert.ok(pasoCompleto(validarVehiculo({ ...VEHICULO, ano: '2027' }, AHORA)));
  assert.ok(validarVehiculo({ ...VEHICULO, ano: '2028' }, AHORA).ano);
  assert.ok(validarVehiculo({ ...VEHICULO, ano: '1979' }, AHORA).ano);
  assert.ok(pasoCompleto(validarVehiculo({ ...VEHICULO, placa: 'ab 123 cd' }, AHORA)));
  assert.ok(validarVehiculo({ ...VEHICULO, placa: 'AB/123' }, AHORA).placa);
  assert.ok(validarVehiculo({ ...VEHICULO, documentoLegal: 'FACTURA' }, AHORA).documentoLegal);
});

test('el grado de la licencia tiene que servir para el vehículo', () => {
  assert.ok(pasoCompleto(validarLicencia(LICENCIA, 'MOTO', { ahora: AHORA })));
  assert.match(validarLicencia({ grado: '3', vencimiento: '2028-01-01' }, 'MOTO', { ahora: AHORA }).grado, /segundo grado/);
  assert.match(validarLicencia({ grado: '2', vencimiento: '2028-01-01' }, 'CAR', { ahora: AHORA }).grado, /tercer, cuarto o quinto/);
  for (const grado of ['3', '4', '5']) {
    assert.ok(pasoCompleto(validarLicencia({ grado, vencimiento: '2028-01-01' }, 'CAR', { ahora: AHORA })), grado);
  }
});

test('la licencia puede faltar en un borrador, no al enviar; y vencida no vale', () => {
  assert.ok(pasoCompleto(validarLicencia({ grado: '', vencimiento: '' }, 'MOTO', { ahora: AHORA })));
  const envio = validarLicencia({ grado: '', vencimiento: '' }, 'MOTO', { paraEnvio: true, ahora: AHORA });
  assert.ok(envio.grado && envio.vencimiento);
  assert.match(validarLicencia({ grado: '2', vencimiento: '2026-09-01' }, 'MOTO', { ahora: AHORA }).vencimiento, /vencida/);
});

test('el certificado médico: fecha opcional, pero no vencida ni inventada', () => {
  assert.ok(pasoCompleto(validarCertificadoMedico({ vencimiento: '' }, AHORA)));
  assert.ok(pasoCompleto(validarCertificadoMedico({ vencimiento: '2027-03-01' }, AHORA)));
  assert.match(validarCertificadoMedico({ vencimiento: '2025-12-31' }, AHORA).vencimiento, /vencido/);
  assert.match(validarCertificadoMedico({ vencimiento: 'pronto' }, AHORA).vencimiento, /no es válida/);
});

test('la contraseña pide lo mismo que el registro', () => {
  assert.equal(validarContrasena('12345678'), null);
  assert.match(validarContrasena('corta'), /8 caracteres/);
});

// ---------------------------------------------------------------------------
// El avance
// ---------------------------------------------------------------------------

const vacia = Object.freeze({
  vehiculo: null, servicios: [], personales: null, datosDelVehiculo: null, licencia: null,
  documentosEntregados: [], enviada: false
});
const completa = Object.freeze({
  vehiculo: 'MOTO', servicios: ['PASSENGER_TRANSPORT', 'DELIVERY'], personales: PERSONALES,
  datosDelVehiculo: VEHICULO, licencia: LICENCIA,
  documentosEntregados: [...documentosRequeridos('MOTO')], enviada: false
});

test('sin nada hecho, el avance es cero y el siguiente paso es el primero', () => {
  const avance = avanceDeLaPostulacion(vacia, AHORA);
  assert.equal(avance.porcentaje, 0);
  assert.equal(avance.siguiente, 'personal');
  assert.equal(avance.listaParaEnviar, false);
  assert.equal(avance.documentosQueFaltan.length, 11);
});

test('los documentos pesan lo que son: la barra no salta con una foto', () => {
  const sinFotos = avanceDeLaPostulacion({ ...completa, documentosEntregados: [] }, AHORA);
  const conUna = avanceDeLaPostulacion({ ...completa, documentosEntregados: ['identity_front'] }, AHORA);
  assert.ok(conUna.porcentaje > sinFotos.porcentaje, 'una foto no mueve la barra');
  assert.ok(conUna.porcentaje < 100);
  assert.ok(conUna.porcentaje - sinFotos.porcentaje <= 10);
});

test('con todo entregado se puede enviar, y sólo entonces', () => {
  const avance = avanceDeLaPostulacion(completa, AHORA);
  assert.equal(avance.listaParaEnviar, true);
  assert.equal(avance.siguiente, 'confirmacion');
  assert.deepEqual([...avance.documentosQueFaltan], []);
  // Sin una foto, no; sin RIF, no; con la licencia mal, no.
  assert.equal(avanceDeLaPostulacion({ ...completa, documentosEntregados: documentosRequeridos('MOTO').slice(1) }, AHORA).listaParaEnviar, false);
  assert.equal(avanceDeLaPostulacion({ ...completa, personales: { ...PERSONALES, rif: '' } }, AHORA).listaParaEnviar, false);
  assert.equal(avanceDeLaPostulacion({ ...completa, licencia: { grado: '3', vencimiento: '2028-01-01' } }, AHORA).listaParaEnviar, false);
});

test('cambiar de moto a carro cambia lo que falta', () => {
  const comoCarro = avanceDeLaPostulacion({ ...completa, vehiculo: 'CAR', datosDelVehiculo: { ...VEHICULO, tipo: 'CAR' }, licencia: { grado: '3', vencimiento: '2028-01-01' } }, AHORA);
  assert.deepEqual([...comoCarro.documentosQueFaltan], ['car_rear_interior']);
  assert.equal(comoCarro.listaParaEnviar, false);
});

test('una vez enviada, ya no se vuelve a enviar', () => {
  const avance = avanceDeLaPostulacion({ ...completa, enviada: true }, AHORA);
  assert.equal(avance.porcentaje, 100);
  assert.equal(avance.listaParaEnviar, false);
  assert.equal(avance.siguiente, null);
});

// ---------------------------------------------------------------------------
// Lo que la referencia traía y aquí NO va
// ---------------------------------------------------------------------------

test('no hay vídeo tutorial ni entrega de kit', () => {
  const dominio = fs.readFileSync(path.join(raizMovil, 'domain/postulacion.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/tutorial|\bkit\b/i.test(dominio), false);
  assert.deepEqual([...PASOS], ['personal', 'vehiculo', 'documentos', 'confirmacion']);
});

test('el dominio no decide aprobaciones ni despacha delivery: eso es del backend', () => {
  const dominio = fs.readFileSync(path.join(raizMovil, 'domain/postulacion.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/aprobar|aprobada|approved/i.test(dominio), false, 'el dominio decide sobre aprobaciones');
  assert.equal(/dispatch|despachar|asignar/i.test(dominio), false, 'el dominio despacha');
});
