import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { avisoDePostulacion } from '../domain/avisoDePostulacion.ts';
import { RUTAS_DE_POSTULACION } from '../domain/postulacion.ts';
import { crearConsultaCoalescida } from '../services/consultaCoalescida.ts';
import { alCambiarElExpediente, avisarDeCambioDelExpediente, olvidarOyentesDelExpediente } from '../services/expedienteCambiado.ts';

/**
 * EL AVISO DE LA POSTULACIÓN EN EL INICIO
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que nadie se entere tarde. Una solicitud aprobada o con correcciones tiene
 *    que verse al abrir la aplicación, no sólo si se busca en el perfil.
 * 2. Que el inicio siga funcionando aunque esto falle. Pedir una carrera no
 *    puede depender de una consulta al expediente.
 * 3. Que no se prometa lo que el servidor no concede: un rechazo no ofrece
 *    volver a intentarlo, y una aprobación no escribe un rol en el teléfono.
 * 4. Que cinco pantallas preguntando a la vez sean una sola petición.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

const retrato = (estado, extra = {}) => ({
  estado,
  documentosQueFaltan: [],
  correccionesPendientes: 0,
  tieneRif: true,
  tieneLicencia: true,
  tienePlaca: true,
  ...extra
});

const expediente = (estado, extra = {}) => ({
  correcciones: [],
  motivoDeLaDecision: null,
  correccionEscrita: null,
  ...extra,
  retrato: retrato(estado, extra.retrato ?? {})
});

// ---------------------------------------------------------------------------
// Cuándo NO hay tarjeta
// ---------------------------------------------------------------------------

test('sin expediente no hay tarjeta: quien nunca se postuló no tiene noticias', () => {
  assert.equal(avisoDePostulacion(null), null);
  assert.equal(avisoDePostulacion(null, { rolReal: 'passenger' }), null);
});

test('quien ya es conductor no ve una tarjeta de aspirante', () => {
  // Un conductor puede pedir carreras como pasajero. Recordarle cada vez que su
  // solicitud fue aprobada hace meses no informa de nada.
  for (const estado of ['approved', 'pending', 'suspended']) {
    assert.equal(avisoDePostulacion(expediente(estado), { rolReal: 'driver' }), null, estado);
  }
});

// ---------------------------------------------------------------------------
// Los seis estados
// ---------------------------------------------------------------------------

test('borrador: invita a continuar, y lleva al paso donde se quedó', () => {
  const aviso = avisoDePostulacion(expediente('draft', { retrato: { tienePlaca: false } }));
  assert.equal(aviso.variante, 'review');
  assert.equal(aviso.etiqueta, 'Sin enviar');
  assert.match(aviso.titulo, /Continúa tu solicitud/);
  assert.equal(aviso.textoCTA, 'Continuar');
  // El destino sale de la única autoridad, no de una lista propia del inicio.
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.vehiculo);
  assert.equal(aviso.revalidarLaSesion, false);
});

test('en revisión: informa y no pide nada', () => {
  const aviso = avisoDePostulacion(expediente('pending'));
  assert.equal(aviso.variante, 'review');
  assert.equal(aviso.etiqueta, 'En revisión');
  assert.match(aviso.titulo, /Solicitud en revisión/);
  // Sin botón: no hay nada que hacer todavía. La tarjeta abre el estado.
  assert.equal(aviso.textoCTA, null);
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.estado);
});

test('requiere cambios: dice qué documento y por qué, y lleva a corregirlo', () => {
  const aviso = avisoDePostulacion(expediente('needs_changes', {
    retrato: { correccionesPendientes: 1 },
    correcciones: [{ tipo: 'plate_photo', motivo: 'No se distingue el último carácter.' }]
  }));
  assert.equal(aviso.variante, 'changes_required');
  assert.equal(aviso.etiqueta, 'Requiere cambios');
  assert.match(aviso.titulo, /necesita una corrección/);
  // El documento con su nombre de verdad y el motivo que escribió administración.
  assert.equal(aviso.descripcion, 'Placa: No se distingue el último carácter.');
  assert.equal(aviso.textoCTA, 'Revisar cambios');
  // Al flujo real de corrección, no al estado genérico.
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.documentos);
});

test('con varias correcciones se dice cuántas son y por dónde empezar', () => {
  const aviso = avisoDePostulacion(expediente('needs_changes', {
    retrato: { correccionesPendientes: 3 },
    correcciones: [
      { tipo: 'plate_photo', motivo: 'Borrosa.' },
      { tipo: 'driver_selfie', motivo: 'Con casco.' },
      { tipo: 'presentation_video', motivo: 'No se te oye.' }
    ]
  }));
  assert.match(aviso.descripcion, /3 documentos por corregir/);
  assert.match(aviso.descripcion, /placa/i);
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.documentos);
});

test('una corrección escrita sin documentos también se cuenta', () => {
  const aviso = avisoDePostulacion(expediente('needs_changes', {
    correccionEscrita: 'La fecha de nacimiento no coincide con la cédula.'
  }));
  assert.equal(aviso.descripcion, 'La fecha de nacimiento no coincide con la cédula.');
});

test('el vídeo a corregir usa el mismo camino que cualquier documento', () => {
  const aviso = avisoDePostulacion(expediente('needs_changes', {
    retrato: { correccionesPendientes: 1 },
    correcciones: [{ tipo: 'presentation_video', motivo: 'No se te ve la cara.' }]
  }));
  // Nada especial: el flujo real de D3 vive en el paso de documentos.
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.documentos);
  assert.match(aviso.descripcion, /Vídeo de presentación: No se te ve la cara\./);
});

test('aprobada: ofrece entrar, y antes vuelve a preguntar quién es', () => {
  const aviso = avisoDePostulacion(expediente('approved'));
  assert.equal(aviso.variante, 'approved');
  assert.equal(aviso.etiqueta, 'Aprobada');
  assert.equal(aviso.textoCTA, 'Entrar como conductor');
  // El rol lo concede el backend: esta bandera es lo que obliga a preguntárselo.
  assert.equal(aviso.revalidarLaSesion, true);
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.estado);
});

test('rechazada: se dice el motivo real y NO se ofrece volver a intentarlo', () => {
  const aviso = avisoDePostulacion(expediente('rejected', {
    motivoDeLaDecision: 'La licencia no corresponde al vehículo declarado.'
  }));
  assert.equal(aviso.etiqueta, 'Rechazada');
  assert.equal(aviso.descripcion, 'La licencia no corresponde al vehículo declarado.');
  // Hoy el servidor no concede reintentar: prometerlo aquí sería mentir.
  assert.equal(aviso.textoCTA, null);
});

test('sin motivo escrito no se inventa uno', () => {
  const aviso = avisoDePostulacion(expediente('rejected'));
  assert.equal(aviso.descripcion, 'Toca para ver los detalles.');
});

test('suspendida: se representa, y no se inventa un desbloqueo', () => {
  const aviso = avisoDePostulacion(expediente('suspended', { motivoDeLaDecision: 'Reportes de pasajeras.' }));
  assert.equal(aviso.etiqueta, 'Suspendida');
  assert.equal(aviso.textoCTA, null);
  assert.equal(aviso.destino, RUTAS_DE_POSTULACION.estado);
});

test('un estado que esta versión no conoce se trata como en revisión', () => {
  const aviso = avisoDePostulacion(expediente('lo_que_venga_manana'));
  assert.equal(aviso.etiqueta, 'En revisión');
  assert.equal(aviso.textoCTA, null);
});

test('cada estado se lee con palabras, no sólo por el color', () => {
  for (const estado of ['draft', 'pending', 'needs_changes', 'approved', 'rejected', 'suspended']) {
    const aviso = avisoDePostulacion(expediente(estado));
    assert.ok(aviso.etiqueta.length > 2, estado);
    assert.ok(aviso.titulo.length > 5, estado);
    assert.ok(aviso.descripcion.length > 5, estado);
  }
});

// ---------------------------------------------------------------------------
// Una sola petición aunque pregunten cinco
// ---------------------------------------------------------------------------

/** Una lectura que no responde hasta que se le dice. */
function lectorManual() {
  let peticiones = 0;
  const pendientes = [];
  const leer = () => {
    peticiones += 1;
    return new Promise(resolver => { pendientes.push(resolver); });
  };
  return {
    leer,
    get peticiones() { return peticiones; },
    responder(valor) { pendientes.shift()?.(valor); }
  };
}

const solicitudDe = estado => ({ ok: true, solicitud: { status: estado } });

test('cinco consumidores a la vez son UNA sola petición', async () => {
  const lector = lectorManual();
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok });

  const esperas = [consulta.consultar(), consulta.consultar(), consulta.consultar(), consulta.consultar(), consulta.consultar()];
  assert.equal(lector.peticiones, 1, 'cinco preguntas, una petición');

  lector.responder(solicitudDe('pending'));
  const respuestas = await Promise.all(esperas);
  // Y todos reciben exactamente lo mismo.
  for (const respuesta of respuestas) assert.equal(respuesta.solicitud.status, 'pending');
});

test('quien llega con una petición en vuelo se suma a ella, no abre otra', async () => {
  const lector = lectorManual();
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok });

  const primera = consulta.consultar();
  const segunda = consulta.consultar({ forzar: true });
  assert.equal(lector.peticiones, 1, 'ni forzando se duplica lo que ya está en vuelo');

  lector.responder(solicitudDe('draft'));
  assert.equal((await primera).solicitud.status, 'draft');
  assert.equal((await segunda).solicitud.status, 'draft');
});

test('dentro del margen de gracia no se vuelve a preguntar; forzando, sí', async () => {
  const lector = lectorManual();
  let reloj = 1000;
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok, ahora: () => reloj, graciaMs: 10_000 });

  const primera = consulta.consultar();
  lector.responder(solicitudDe('pending'));
  await primera;
  assert.equal(lector.peticiones, 1);

  reloj += 3000;
  await consulta.consultar();
  assert.equal(lector.peticiones, 1, 'dentro del margen se reutiliza');

  const forzada = consulta.consultar({ forzar: true });
  assert.equal(lector.peticiones, 2, 'forzar salta el margen');
  lector.responder(solicitudDe('approved'));
  assert.equal((await forzada).solicitud.status, 'approved');
});

test('pasado el margen se vuelve a preguntar solo', async () => {
  const lector = lectorManual();
  let reloj = 0;
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok, ahora: () => reloj, graciaMs: 10_000 });

  const primera = consulta.consultar();
  lector.responder(solicitudDe('pending'));
  await primera;

  reloj += 10_001;
  const segunda = consulta.consultar();
  assert.equal(lector.peticiones, 2);
  lector.responder(solicitudDe('needs_changes'));
  assert.equal((await segunda).solicitud.status, 'needs_changes');
});

test('lo guardado NO impide ver que ya está aprobada', async () => {
  // El caso que importa: administración aprueba mientras la persona mira el
  // teléfono. Al volver al inicio se fuerza, y la novedad aparece.
  const lector = lectorManual();
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok });

  const primera = consulta.consultar();
  lector.responder(solicitudDe('pending'));
  assert.equal((await primera).solicitud.status, 'pending');

  const refresco = consulta.consultar({ forzar: true });
  lector.responder(solicitudDe('approved'));
  assert.equal((await refresco).solicitud.status, 'approved');
});

test('un fallo no se guarda: el siguiente vuelve a intentarlo', async () => {
  const lector = lectorManual();
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok, ahora: () => 0 });

  const primera = consulta.consultar();
  lector.responder({ ok: false, motivo: 'SIN_CONEXION' });
  assert.equal((await primera).ok, false);

  // Sin avanzar el reloj: aun así se vuelve a preguntar, porque no hay nada
  // válido que recordar. Una red caída no es «no tienes solicitud».
  const segunda = consulta.consultar();
  assert.equal(lector.peticiones, 2);
  lector.responder(solicitudDe('pending'));
  assert.equal((await segunda).solicitud.status, 'pending');
});

// ---------------------------------------------------------------------------
// Lo que cambia el expediente invalida lo guardado
// ---------------------------------------------------------------------------

test('cambiar el expediente deja sin valor lo que estuviera guardado', async () => {
  const lector = lectorManual();
  let reloj = 0;
  const consulta = crearConsultaCoalescida({ leer: lector.leer, seGuarda: r => r.ok, ahora: () => reloj, graciaMs: 10_000 });

  const primera = consulta.consultar();
  lector.responder(solicitudDe('needs_changes'));
  await primera;
  assert.equal(lector.peticiones, 1);

  // Se reenvía la corrección: lo de antes ya no vale, aunque el margen siga vivo.
  consulta.invalidar();
  const segunda = consulta.consultar();
  assert.equal(lector.peticiones, 2, 'tras la mutación se vuelve a preguntar');
  lector.responder(solicitudDe('pending'));
  assert.equal((await segunda).solicitud.status, 'pending');
});

test('el aviso de cambio llega a quien escucha, y un oyente roto no lo corta', () => {
  olvidarOyentesDelExpediente();
  const oidos = [];
  alCambiarElExpediente(() => { throw new Error('este oyente está roto'); });
  alCambiarElExpediente(() => oidos.push('segundo'));
  const dejarDeEscuchar = alCambiarElExpediente(() => oidos.push('tercero'));

  avisarDeCambioDelExpediente();
  assert.deepEqual(oidos, ['segundo', 'tercero']);

  dejarDeEscuchar();
  avisarDeCambioDelExpediente();
  assert.deepEqual(oidos, ['segundo', 'tercero', 'segundo']);
  olvidarOyentesDelExpediente();
});

test('toda mutación del expediente avisa, sin tener que acordarse una por una', () => {
  const servicio = sinComentarios('services/postulacion.ts');
  // El aviso está en `interpretar`, por donde pasan todas las mutaciones.
  assert.match(servicio, /function interpretar[\s\S]{0,400}avisarDeCambioDelExpediente\(\)/);
  // Y el estado guardado escucha ese aviso.
  assert.match(sinComentarios('services/estadoDePostulacion.ts'), /alCambiarElExpediente\([^)]*\)\s*=>\s*\{?\s*estadoDePostulacion\.invalidar\(\)/);
});

// ---------------------------------------------------------------------------
// El inicio: cableado, no rediseñado
// ---------------------------------------------------------------------------

test('el inicio pinta la tarjeta que dibujó Antigravity, sin copiarla', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /avisoPostulacion=\{avisoPostulacion\}/);
  // La pantalla no dibuja tarjetas por su cuenta ni toca colores.
  assert.equal(/StyleSheet\.create/.test(inicio), false, 'el inicio no define estilos propios');
  assert.equal(/AvisoPostulacionDriver/.test(inicio), false, 'la tarjeta la monta la pantalla de diseño');
});

test('el inicio NO decide estados: se los pregunta al dominio', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /avisoDePostulacion\(expedienteParaElInicio\(solicitud\)/);
  // Ni una lista propia de estados repartida por la pantalla.
  assert.equal(/'needs_changes'|'approved'|'rejected'|'suspended'/.test(inicio), false, 'el inicio no repite la máquina de estados');
});

test('entrar como conductor revalida contra el backend y no escribe roles', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /aviso\.revalidarLaSesion/);
  assert.match(inicio, /revalidar\(\)/);
  // Jamás se le asigna un rol a la sesión desde el teléfono.
  assert.equal(/role\s*[:=]\s*'driver'/.test(inicio), false);
  assert.equal(/setRol|fijarRol|guardarRol/.test(inicio), false);
});

test('el inicio no se bloquea esperando el expediente', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  // La pantalla se pinta con la sesión; el expediente sólo añade una tarjeta.
  assert.equal(/cargando.*\?\s*<ActivityIndicator|if \(cargandoPostulacion/.test(inicio), false);
  assert.match(inicio, /const \{ solicitud \} = useEstadoDePostulacion/);
});

test('sólo se pregunta con sesión: el expediente es de alguien', () => {
  const inicio = sinComentarios('app/pasajero.tsx');
  assert.match(inicio, /useEstadoDePostulacion\(\{ activo: usuario !== null \}\)/);
  // Y el identificador nunca viaja desde el cliente: la ruta es /me.
  assert.match(sinComentarios('services/postulacion.ts'), /'\/api\/driver-applications\/me'/);
  assert.equal(/driver-applications\/\$\{|driver-applications\/' \+/.test(sinComentarios('services/postulacion.ts')), false);
});

test('nada del expediente acaba en un registro', () => {
  for (const relativa of ['app/pasajero.tsx', 'domain/avisoDePostulacion.ts', 'services/estadoDePostulacion.ts', 'context/EstadoDePostulacion.tsx']) {
    const codigo = sinComentarios(relativa);
    assert.equal(/console\.(log|warn|error|info)/.test(codigo), false, `${relativa} registra algo`);
    assert.equal(/AsyncStorage|SecureStore/.test(codigo), false, `${relativa} guarda algo en disco`);
  }
});

// ---------------------------------------------------------------------------
// Cuándo se vuelve a preguntar
// ---------------------------------------------------------------------------

test('se refresca al volver a la pantalla y al volver la app del segundo plano', () => {
  const hook = sinComentarios('context/EstadoDePostulacion.tsx');
  assert.match(hook, /useFocusEffect/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /siguiente === 'active'\) consultar\(true\)/);
  assert.match(hook, /alCambiarElExpediente\(\(\) => \{ consultar\(true\); \}\)/);
});

test('no hay polling: ni intervalos ni temporizadores repetidos', () => {
  for (const relativa of ['context/EstadoDePostulacion.tsx', 'services/estadoDePostulacion.ts', 'app/pasajero.tsx']) {
    const codigo = sinComentarios(relativa);
    assert.equal(/setInterval|setTimeout/.test(codigo), false, `${relativa} usa temporizadores`);
  }
});

test('el margen de gracia es corto: segundos, no minutos', () => {
  const servicio = sinComentarios('services/estadoDePostulacion.ts');
  const bloque = servicio.match(/GRACIA_DEL_ESTADO_MS = ([\d_]+)/);
  assert.ok(bloque, 'no encuentro el margen');
  const milisegundos = Number(bloque[1].replace(/_/g, ''));
  assert.ok(milisegundos >= 5000 && milisegundos <= 15_000, `el margen es de ${milisegundos} ms`);
});

// ---------------------------------------------------------------------------
// La tarjeta de Antigravity sigue siendo suya
// ---------------------------------------------------------------------------

test('la tarjeta sigue sin lógica de negocio ni navegación propia', () => {
  const tarjeta = leer('ui/AvisoPostulacionDriver.tsx');
  assert.doesNotMatch(tarjeta, /useRouter\(/);
  assert.doesNotMatch(tarjeta, /router\.push\(/);
  assert.doesNotMatch(tarjeta, /fetch\(/);
  assert.doesNotMatch(tarjeta, /driver-applications/);
  // Las tres variantes y sus tokens de marca, intactos.
  assert.match(tarjeta, /'review'\s*\|\s*'changes_required'\s*\|\s*'approved'/);
  assert.match(tarjeta, /tema\.color\.acento/);
  assert.match(tarjeta, /tema\.color\.exito/);
  assert.match(tarjeta, /tema\.radio\.tarjeta/);
});

test('la insignia puede decir el estado exacto sin cambiar el diseño', () => {
  const tarjeta = sinComentarios('ui/AvisoPostulacionDriver.tsx');
  assert.match(tarjeta, /readonly etiqueta\?: string/);
  assert.match(tarjeta, /etiqueta \?\? config\.etiquetaInsignia/);
});

// ---------------------------------------------------------------------------
// Al corregir, la vista se coloca donde hay que trabajar
// ---------------------------------------------------------------------------

test('el paso de documentos se coloca en el documento que hay que repetir', () => {
  const pantalla = sinComentarios('app/postulacion/documentos.tsx');
  assert.match(pantalla, /irALaCorreccion/);
  assert.match(pantalla, /if \(motivo\) irALaCorreccion\(tipo\)/);
  // Una sola vez por visita: no persigue a la persona mientras hace scroll.
  assert.match(pantalla, /yaSeColoco\.current = true/);
});
