import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CIUDADES,
  DOCUMENTOS,
  DOCUMENTOS_OBLIGATORIOS,
  PASOS,
  SERVICIOS,
  avanceDeLaPostulacion,
  describirServicio,
  documentosQueFaltan,
  edadEn,
  esCiudadCubierta,
  normalizarCedula,
  normalizarPlaca,
  pasoCompleto,
  regionDeLaCiudad,
  validarContrasena,
  validarPersonales,
  validarVehiculo,
  vehiculoDeLosServicios
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

const PERSONALES = Object.freeze({
  nombre: 'Luis',
  apellido: 'Gómez',
  cedula: 'V-12345678',
  nacimiento: '1995-04-12',
  telefono: '04141234567',
  correo: 'luis@ejemplo.com',
  direccion: 'Calle 72 con avenida 3H, Maracaibo',
  ciudad: 'Maracaibo'
});

const VEHICULO = Object.freeze({
  tipo: 'MOTO',
  marca: 'Bera',
  modelo: 'SBR',
  ano: '2021',
  color: 'Negro',
  placa: 'AB123CD'
});

// ---------------------------------------------------------------------------
// Las reglas son las del servidor
// ---------------------------------------------------------------------------

test('los tipos de documento son EXACTAMENTE los que acepta el servidor', () => {
  const declarados = servidor.match(/DRIVER_DOCUMENT_TYPES = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(declarados, 'no encuentro los tipos en el servidor');
  const tiposDelServidor = [...declarados[1].matchAll(/'([a-z_]+)'/g)].map(item => item[1]);
  assert.deepEqual(DOCUMENTOS.map(documento => documento.tipo).sort(), tiposDelServidor.sort());
});

test('los obligatorios son los que el servidor exige, ni uno más', () => {
  const declarados = servidor.match(/REQUIRED_DRIVER_DOCUMENTS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(declarados, 'no encuentro los obligatorios en el servidor');
  const obligatoriosDelServidor = [...declarados[1].matchAll(/'([a-z_]+)'/g)].map(item => item[1]);
  assert.deepEqual([...DOCUMENTOS_OBLIGATORIOS].sort(), obligatoriosDelServidor.sort());
  // Son siete, y el seguro es el único opcional.
  assert.equal(DOCUMENTOS_OBLIGATORIOS.length, 7);
  assert.equal(DOCUMENTOS_OBLIGATORIOS.includes('vehicle_insurance'), false);
});

test('cada documento dice qué tiene que salir en la foto', () => {
  for (const documento of DOCUMENTOS) {
    assert.ok(documento.titulo.length > 3, `${documento.tipo} sin título`);
    assert.ok(documento.instruccion.length > 15, `${documento.tipo} sin instrucción útil`);
  }
});

test('la cédula se normaliza como en el servidor', () => {
  assert.equal(normalizarCedula('v12345678'), 'V-12345678');
  assert.equal(normalizarCedula('V-12.345.678'), 'V-12345678');
  assert.equal(normalizarCedula(' 12345678 '), '12345678');
  assert.equal(normalizarCedula('E 9876543'), 'E-9876543');
});

test('la placa se normaliza como en el servidor', () => {
  assert.equal(normalizarPlaca('ab 123 cd'), 'AB123CD');
  assert.equal(normalizarPlaca('  a1b2c3  '), 'A1B2C3');
});

test('la edad se calcula igual que en el servidor', () => {
  const ahora = new Date('2026-09-02T12:00:00Z');
  assert.equal(edadEn('2000-01-01', ahora), 26);
  assert.equal(edadEn('no-es-fecha', ahora), -1);
});

// ---------------------------------------------------------------------------
// Los datos personales
// ---------------------------------------------------------------------------

test('unos datos correctos pasan', () => {
  assert.ok(pasoCompleto(validarPersonales(PERSONALES)));
});

test('menor de edad no puede postularse', () => {
  const ahora = new Date('2026-09-02T12:00:00Z');
  const errores = validarPersonales({ ...PERSONALES, nacimiento: '2012-01-01' }, ahora);
  assert.match(errores.nacimiento, /mayor de edad/);
});

test('cada campo que falta tiene su propio aviso, en su idioma', () => {
  const errores = validarPersonales({
    nombre: 'L', apellido: '', cedula: 'abc', nacimiento: '',
    telefono: '123', correo: 'no-es-correo', direccion: 'corta', ciudad: ''
  });
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
  const errores = validarPersonales({ ...PERSONALES, ciudad: 'Caracas' });
  assert.match(errores.ciudad, /Todavía no operamos/);
  // Hoy son Maracaibo y Mara. Cuando se abra otra, esta cuenta cambia sola.
  assert.deepEqual(CIUDADES.map(item => item.ciudad), ['Maracaibo', 'Mara']);
});

// ---------------------------------------------------------------------------
// El vehículo
// ---------------------------------------------------------------------------

test('un vehículo correcto pasa', () => {
  assert.ok(pasoCompleto(validarVehiculo(VEHICULO)));
});

test('el año tiene el mismo tope que en el servidor', () => {
  const ahora = new Date('2026-09-02T12:00:00Z');
  assert.ok(pasoCompleto(validarVehiculo({ ...VEHICULO, ano: '2027' }, ahora)));
  assert.ok(validarVehiculo({ ...VEHICULO, ano: '2028' }, ahora).ano);
  assert.ok(validarVehiculo({ ...VEHICULO, ano: '1979' }, ahora).ano);
  assert.ok(validarVehiculo({ ...VEHICULO, ano: 'dos mil' }, ahora).ano);
});

test('la placa sigue el formato del servidor', () => {
  assert.ok(pasoCompleto(validarVehiculo({ ...VEHICULO, placa: 'ab 123 cd' })));
  assert.ok(validarVehiculo({ ...VEHICULO, placa: 'AB1' }).placa);
  assert.ok(validarVehiculo({ ...VEHICULO, placa: 'AB/123' }).placa);
});

test('la contraseña pide lo mismo que el registro', () => {
  assert.equal(validarContrasena('12345678'), null);
  assert.match(validarContrasena('corta'), /8 caracteres/);
});

// ---------------------------------------------------------------------------
// Los servicios
// ---------------------------------------------------------------------------

test('se puede postular a paquetería, y se dice que todavía no opera', () => {
  const paqueteria = describirServicio('paqueteria_moto');
  assert.equal(paqueteria.operando, false);
  assert.equal(paqueteria.vehiculo, 'MOTO');
  // Las de personas sí operan: el despacho ya las entiende.
  assert.equal(describirServicio('personas_moto').operando, true);
  assert.equal(describirServicio('personas_carro').operando, true);
  assert.equal(SERVICIOS.length, 3);
});

test('el vehículo que se declara sale de lo elegido, y el carro manda', () => {
  assert.equal(vehiculoDeLosServicios(['personas_moto']), 'MOTO');
  assert.equal(vehiculoDeLosServicios(['paqueteria_moto']), 'MOTO');
  assert.equal(vehiculoDeLosServicios(['personas_carro']), 'CAR');
  assert.equal(vehiculoDeLosServicios(['personas_moto', 'personas_carro']), 'CAR');
});

// ---------------------------------------------------------------------------
// El avance
// ---------------------------------------------------------------------------

const vacia = Object.freeze({
  servicios: [], personales: null, vehiculo: null, documentosEntregados: [], enviada: false
});

test('sin nada hecho, el avance es cero y el siguiente paso es el primero', () => {
  const avance = avanceDeLaPostulacion(vacia);
  assert.equal(avance.porcentaje, 0);
  assert.equal(avance.siguiente, 'servicio');
  assert.equal(avance.listaParaEnviar, false);
  assert.equal(avance.documentosQueFaltan.length, 7);
});

test('los documentos pesan lo que son: la barra no salta con una foto', () => {
  const conTodoMenosFotos = {
    servicios: ['personas_moto'], personales: PERSONALES, vehiculo: VEHICULO,
    documentosEntregados: [], enviada: false
  };
  const sinFotos = avanceDeLaPostulacion(conTodoMenosFotos);
  const conUna = avanceDeLaPostulacion({ ...conTodoMenosFotos, documentosEntregados: ['identity_front'] });
  assert.ok(conUna.porcentaje > sinFotos.porcentaje, 'una foto no mueve la barra');
  assert.ok(conUna.porcentaje < 100);
  // Y una sola foto no puede valer tanto como un paso entero de datos.
  assert.ok(conUna.porcentaje - sinFotos.porcentaje <= 12);
});

test('con todo entregado se puede enviar, y sólo entonces', () => {
  const completa = {
    servicios: ['personas_moto'],
    personales: PERSONALES,
    vehiculo: VEHICULO,
    documentosEntregados: [...DOCUMENTOS_OBLIGATORIOS],
    enviada: false
  };
  const avance = avanceDeLaPostulacion(completa);
  assert.equal(avance.listaParaEnviar, true);
  assert.equal(avance.siguiente, 'envio');
  assert.deepEqual([...avance.documentosQueFaltan], []);

  // Sin una foto, no.
  const casi = avanceDeLaPostulacion({ ...completa, documentosEntregados: DOCUMENTOS_OBLIGATORIOS.slice(1) });
  assert.equal(casi.listaParaEnviar, false);
  // Y con los datos mal tampoco, aunque estén todas las fotos.
  const datosMal = avanceDeLaPostulacion({ ...completa, personales: { ...PERSONALES, cedula: 'x' } });
  assert.equal(datosMal.listaParaEnviar, false);
});

test('una vez enviada, ya no se vuelve a enviar', () => {
  const avance = avanceDeLaPostulacion({
    servicios: ['personas_moto'],
    personales: PERSONALES,
    vehiculo: VEHICULO,
    documentosEntregados: [...DOCUMENTOS_OBLIGATORIOS],
    enviada: true
  });
  assert.equal(avance.porcentaje, 100);
  assert.equal(avance.listaParaEnviar, false);
  assert.equal(avance.siguiente, null);
});

test('faltan los que faltan, y se dicen por su nombre', () => {
  const faltan = documentosQueFaltan(['identity_front', 'driver_selfie']);
  assert.equal(faltan.length, 5);
  assert.equal(faltan.includes('identity_front'), false);
  assert.equal(faltan.includes('plate_photo'), true);
});

// ---------------------------------------------------------------------------
// Lo que la referencia traía y aquí NO va
// ---------------------------------------------------------------------------

test('no hay vídeo tutorial ni entrega de kit', () => {
  // Eran pasos de la aplicación que sirvió de referencia. El dueño confirmó
  // que +58Express no los tiene, y un paso que nadie puede cumplir deja la
  // barra clavada para siempre.
  const dominio = fs.readFileSync(path.join(raizMovil, 'domain/postulacion.ts'), 'utf8');
  assert.equal(/tutorial|kit\b/i.test(dominio.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  assert.deepEqual([...PASOS], ['servicio', 'identidad', 'vehiculo', 'documentos', 'envio']);
});

test('el dominio no decide aprobaciones: eso es del backend', () => {
  const dominio = fs.readFileSync(path.join(raizMovil, 'domain/postulacion.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/aprobar|aprobada|approved/i.test(dominio), false,
    'el dominio de la postulación decide sobre aprobaciones');
});
