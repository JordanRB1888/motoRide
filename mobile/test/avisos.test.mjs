import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  CATEGORIAS_DE_AVISO,
  conAvisoLeido,
  contarSinLeer,
  conTodosLeidos,
  cuandoFue,
  destinoDeAviso,
  DESTINOS_DE_AVISO,
  esDestinoPermitido,
  leerAvisos
} from '../domain/avisos.ts';

/**
 * Los avisos reales — CORE-INTEGRATION-2.
 *
 * QUÉ SE PROTEGE
 *
 * Tres cosas que se rompen en silencio: que el contador de no leídos diga la
 * verdad, que un aviso no pueda abrir una ruta que el servidor decida, y que la
 * configuración no anuncie ajustes que no existen.
 *
 * La bandeja es de las pocas superficies donde el usuario COMPRUEBA lo que la
 * aplicación le dijo. Un contador que no baja, o que baja y vuelve a subir, se
 * nota a la primera.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** La forma REAL de `GET /api/notifications/me`. */
const RESPUESTA_DEL_BACKEND = [
  {
    id: 'notification_1',
    userId: 'u_1',
    title: 'Pago de viaje realizado',
    message: 'Se descontaron $0.00 de tu Billetera Express.',
    category: 'FINANCE',
    read: false,
    createdAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'notification_2',
    targetRole: 'all',
    title: 'Aviso de la plataforma',
    message: 'Mensaje de ejemplo.',
    category: 'ANNOUNCEMENT',
    read: true,
    createdAt: '2026-08-30T10:00:00.000Z',
    readAt: '2026-08-30T11:00:00.000Z'
  }
];

// ---------------------------------------------------------------------------
// La bandeja
// ---------------------------------------------------------------------------

test('los avisos se leen de la respuesta REAL del backend', () => {
  const avisos = leerAvisos(RESPUESTA_DEL_BACKEND);
  assert.equal(avisos.length, 2);
  assert.equal(avisos[0].titulo, 'Pago de viaje realizado');
  assert.equal(avisos[0].categoria, 'FINANCE');
  assert.equal(avisos[0].sinLeer, true);
  assert.equal(avisos[1].sinLeer, false);
});

test('un aviso SIN identificador se descarta', () => {
  // No se podría marcar como leído, y una fila que no responde al tocarla es
  // peor que una fila que no está.
  const avisos = leerAvisos([{ title: 'Sin id' }, ...RESPUESTA_DEL_BACKEND]);
  assert.equal(avisos.length, 2);
});

test('sólo el `read: true` explícito cuenta como leído', () => {
  const avisos = leerAvisos([
    { id: 'a', read: 'yes' },
    { id: 'b', read: 1 },
    { id: 'c' },
    { id: 'd', read: true }
  ]);
  assert.deepEqual(avisos.map(aviso => aviso.sinLeer), [true, true, true, false]);
});

test('una respuesta que no es lista da bandeja vacía, no un fallo', () => {
  // La bandeja vacía es un estado legítimo, y esto no puede tumbarla.
  for (const basura of [null, undefined, {}, 'no', 42]) {
    assert.deepEqual(leerAvisos(basura), []);
  }
});

test('las categorías declaradas son las que el servidor usa', () => {
  // Se buscan en TODO el servidor: `SAFE_TRANSPORT` no vive en `index.js`
  // sino en `services/safeTransport.js`, que es quien crea esos avisos.
  const fuentes = [
    'server/index.js',
    'server/services/safeTransport.js'
  ].map(relativa => fs.readFileSync(path.join(raizProyecto, relativa), 'utf8')).join(' ');

  for (const categoria of CATEGORIAS_DE_AVISO) {
    assert.ok(
      fuentes.includes(`'${categoria}'`),
      `«${categoria}» no aparece en el servidor`
    );
  }
});

// ---------------------------------------------------------------------------
// El contador
// ---------------------------------------------------------------------------

test('el contador de no leídos CUENTA, así que no puede ser negativo', () => {
  const avisos = leerAvisos(RESPUESTA_DEL_BACKEND);
  assert.equal(contarSinLeer(avisos), 1);
  assert.equal(contarSinLeer([]), 0);
  assert.equal(contarSinLeer(conTodosLeidos(avisos)), 0);

  const codigo = leer('domain/avisos.ts');
  assert.equal(/sinLeer - 1|contador--|-= 1/.test(codigo), false, 'el contador resta en vez de contar');
});

test('marcar uno como leído es idempotente', () => {
  // Un toque repetido no puede descuadrar el contador.
  const avisos = leerAvisos(RESPUESTA_DEL_BACKEND);
  const una = conAvisoLeido(avisos, 'notification_1');
  const dos = conAvisoLeido(una, 'notification_1');

  assert.equal(contarSinLeer(una), 0);
  assert.deepEqual(dos, una);
  // Y no toca la lista original.
  assert.equal(contarSinLeer(avisos), 1, 'la lista de entrada se modificó');
});

test('marcar todos NO depende del estado anterior', () => {
  // Es lo que resuelve la carrera entre «marcar uno» y «marcar todos»: da igual
  // en qué orden lleguen las respuestas.
  const avisos = leerAvisos(RESPUESTA_DEL_BACKEND);
  const aUno = conTodosLeidos(conAvisoLeido(avisos, 'notification_1'));
  const alReves = conAvisoLeido(conTodosLeidos(avisos), 'notification_1');
  assert.deepEqual(aUno, alReves);
  assert.equal(contarSinLeer(aUno), 0);
});

test('un aviso marcado no vuelve a aparecer como no leído', () => {
  // La pantalla pinta el cambio antes de que responda el servidor, y sólo lo
  // deshace si el servidor lo rechaza. Sin ese `antes`, un fallo dejaría la
  // lista mintiendo hasta la próxima recarga.
  const pantalla = sinComentarios('app/avisos.tsx');
  assert.match(pantalla, /const antes = avisos;/);
  assert.match(pantalla, /if \(!respuesta\.ok\) \{[\s\S]{0,200}setAvisos\(antes\)/);
});

test('«marcar todos» no aparece donde no puede hacer nada', () => {
  // Dos condiciones: que haya algo que marcar y que alguien sepa marcarlo. Lo
  // segundo deja el recorrido de diseño exactamente como estaba y evita un
  // botón que se pulsa sin efecto.
  const secciones = sinComentarios('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /sinLeer > 0 && onLeerTodos !== undefined \?/);
});

test('tocar dos veces el mismo aviso NO manda dos peticiones', () => {
  const pantalla = sinComentarios('app/avisos.tsx');
  assert.match(pantalla, /enVuelo\.current\.has\(id\)/, 'no se comprueba si ya hay una petición');
  assert.match(pantalla, /enVuelo\.current\.add\(id\)/);
  assert.match(pantalla, /enVuelo\.current\.delete\(id\)/, 'la petición nunca se da por terminada');
  assert.match(pantalla, /if \(leyendoTodos\.current\) return;/, '«marcar todos» se puede disparar dos veces');
});

test('la campana del perfil cuenta avisos REALES', () => {
  const ruta = sinComentarios('app/perfil.tsx');
  assert.match(ruta, /contarSinLeer\(bandeja\.datos\)/);
  assert.match(ruta, /sinLeer=\{sinLeer\}/);

  // Y el fixture sigue siendo el respaldo sólo cuando nadie pasa el número.
  const secciones = sinComentarios('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /sinLeerReal \?\? AVISOS_DEMO\.filter/);
});

// ---------------------------------------------------------------------------
// A dónde lleva un aviso
// ---------------------------------------------------------------------------

test('un aviso NO puede abrir una ruta cualquiera', () => {
  // La defensa del encargo: el destino sale de una lista blanca, no del
  // servidor. Sin ella, un panel de administración con un fallo de validación
  // podría mandar cualquier cosa.
  for (const peligroso of [
    'javascript:alert(1)',
    'https://ejemplo.invalido',
    '/admin',
    '../../secreto',
    'file:///etc/passwd',
    ''
  ]) {
    assert.equal(esDestinoPermitido(peligroso), false, `«${peligroso}» se acepta como destino`);
  }
  for (const bueno of DESTINOS_DE_AVISO) {
    assert.equal(esDestinoPermitido(bueno), true);
  }
});

test('hoy NINGÚN aviso navega, y por dos razones', () => {
  // 1. El servidor no manda destino: ninguna notificación creada en el backend
  //    lleva tripId, enlace ni ruta.
  // 2. Las pantallas destino todavía son maquetas con datos de ejemplo.
  for (const aviso of leerAvisos(RESPUESTA_DEL_BACKEND)) {
    assert.equal(destinoDeAviso(aviso), null);
  }

  // Y se comprueba contra el servidor de verdad: si algún día una notificación
  // empieza a llevar destino, esta prueba avisa de que hay que revisarlo.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const creaciones = [...servidor.matchAll(/database\.notifications\.push\(\{[\s\S]{0,400}?\}\)/g)]
    .map(coincidencia => coincidencia[0]);
  assert.ok(creaciones.length >= 3, 'ya no se encuentran las creaciones de notificaciones');
  for (const creacion of creaciones) {
    for (const campo of ['tripId', 'link', 'url', 'actionUrl', 'deepLink', 'route']) {
      assert.equal(
        new RegExp(`\\b${campo}\\s*:`).test(creacion), false,
        `una notificación ya lleva «${campo}»: revisar destinoDeAviso`
      );
    }
  }
});

test('el galón sólo se pinta donde hay destino', () => {
  // Una flecha que no lleva a ningún sitio enseña a no hacer caso de las
  // flechas.
  const secciones = sinComentarios('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /\{aviso\.navegable \? <Galon \/> : null\}/);

  const pantalla = sinComentarios('app/avisos.tsx');
  assert.match(pantalla, /navegable: destinoDeAviso\(aviso\) !== null/);
});

test('primero se marca leído, DESPUÉS se navega', () => {
  // Al revés, quien toca un aviso saldría de la lista sin saber si quedó
  // marcado, y volvería a encontrárselo sin leer.
  const pantalla = sinComentarios('app/avisos.tsx');
  const cuerpo = pantalla.slice(pantalla.indexOf('async function tocar'));
  assert.ok(
    cuerpo.indexOf('marcarLeido(id)') < cuerpo.indexOf('router.push'),
    'se navega antes de asegurar el estado'
  );
});

// ---------------------------------------------------------------------------
// Cuándo fue
// ---------------------------------------------------------------------------

test('la antigüedad se lee como en el diseño', () => {
  const ahora = Date.parse('2026-09-01T12:00:00.000Z');
  assert.equal(cuandoFue('2026-09-01T11:59:30.000Z', ahora), 'Ahora');
  assert.equal(cuandoFue('2026-09-01T11:30:00.000Z', ahora), 'Hace 30 min');
  assert.equal(cuandoFue('2026-09-01T10:00:00.000Z', ahora), 'Hace 2 h');
  assert.equal(cuandoFue('2026-08-31T10:00:00.000Z', ahora), 'Ayer');
  assert.equal(cuandoFue('2026-08-29T10:00:00.000Z', ahora), 'Hace 3 días');
});

test('una fecha ilegible o futura no rompe la fila', () => {
  const ahora = Date.parse('2026-09-01T12:00:00.000Z');
  assert.equal(cuandoFue('', ahora), '', 'sin fecha, la línea desaparece');
  assert.equal(cuandoFue('el martes', ahora), '');
  // Relojes desincronizados: «ahora» en vez de «hace -3 horas».
  assert.equal(cuandoFue('2026-09-01T15:00:00.000Z', ahora), 'Ahora');
});

// ---------------------------------------------------------------------------
// La configuración
// ---------------------------------------------------------------------------

test('la apariencia es de verdad y se guarda en el dispositivo', () => {
  const pantalla = leer('preview/pantallaConfiguracion.tsx');
  assert.match(pantalla, /useApariencia\(\)/);
  assert.match(pantalla, /cambiarApariencia\(opcion\.clave\)/);

  // Las tres opciones del contrato.
  assert.match(pantalla, /clave: 'auto'|apariencia === 'auto'/);
  assert.match(pantalla, /clave: 'claro'/);
  assert.match(pantalla, /clave: 'oscuro'/);

  assert.match(leer('services/preferencias.ts'), /AsyncStorage|SecureStore|expo/, 'la preferencia no se guarda');
});

test('el automático sigue mirando la hora de Venezuela', () => {
  const horario = leer('theme/horaVenezuela.ts');
  assert.match(horario, /America\/Caracas/);
  assert.match(horario, /\b6\b|\b06\b/, 'ya no amanece a las seis');
  assert.match(horario, /\b18\b/, 'ya no anochece a las dieciocho');
});

test('la configuración real NO anuncia ajustes que no existen', () => {
  // «Ahorro de datos · Desactivado» describe una preferencia que no se guarda
  // en ninguna parte y no apaga nada. Enseñarla a una persona real es decirle
  // que hay un ajuste puesto cuando no lo hay.
  const pantalla = sinComentarios('preview/pantallaConfiguracion.tsx');
  assert.match(pantalla, /const pendiente = real \? 'Todavía no está activo' : undefined;/);
  for (const inventado of ["'Estándar'", "'Activado'", "'Desactivado'"]) {
    assert.match(
      pantalla,
      new RegExp(`pendiente \\?\\? ${inventado.replace(/'/g, "'")}`),
      `«${inventado}» se sigue anunciando siempre`
    );
  }
  // Y lo que no lleva a ninguna parte no se anuncia como botón.
  assert.match(pantalla, /accessibilityRole=\{sinDestino \? 'text' : 'button'\}/);
});

test('la ruta real de configuración pasa `real`', () => {
  assert.match(sinComentarios('app/configuracion.tsx'), /<C2Configuracion real \/>/);
});

// ---------------------------------------------------------------------------
// Sesión y fixtures
// ---------------------------------------------------------------------------

test('un error de red NO cierra la sesión', () => {
  const pantalla = sinComentarios('app/avisos.tsx');
  assert.match(pantalla, /setEstado\('error'\)/);
  assert.equal(/salir\(/.test(pantalla), false, 'la bandeja cierra la sesión por su cuenta');
});

test('las rutas nuevas están protegidas', () => {
  for (const ruta of ['app/avisos.tsx', 'app/configuracion.tsx']) {
    const fuente = sinComentarios(ruta);
    assert.match(fuente, /sesion\.estado !== 'AUTENTICADO'/, `${ruta} no comprueba el estado`);
    assert.match(fuente, /<Redirect href="\/" \/>/, `${ruta} no redirige fuera`);
  }
});

test('no hay una segunda sesión', () => {
  const servicio = leer('services/avisos.ts');
  assert.match(servicio, /from '\.\/api'/);
  assert.equal(/guardarToken|SecureStore|AsyncStorage|jwt/i.test(sinComentarios('services/avisos.ts')), false);
});

test('los fixtures no llegan a la aplicación real', () => {
  // La bandeja de la aplicación autenticada siempre pasa sus avisos; y sin
  // datos, en release la lista se pinta VACÍA en vez de con el ejemplo.
  const secciones = sinComentarios('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /avisos \?\? \(EN_DESARROLLO \? AVISOS_DE_EJEMPLO : \[\]\)/);

  for (const ruta of ['app/avisos.tsx', 'app/configuracion.tsx']) {
    assert.equal(
      /from ['"][^'"]*preview\/fixtures/.test(leer(ruta)), false,
      `${ruta} importa datos de demostración`
    );
  }
});

test('esta fase NO trae push remoto', () => {
  // IN_APP_NOTIFICATIONS sí; REMOTE_PUSH no. Son cosas distintas y confundirlas
  // haría creer que el teléfono ya avisa con la aplicación cerrada.
  const paquete = JSON.parse(leer('package.json'));
  const dependencias = Object.keys(paquete.dependencies ?? {});
  for (const nativa of ['expo-notifications', 'expo-device', '@react-native-firebase/messaging']) {
    assert.equal(dependencias.includes(nativa), false, `se instaló ${nativa}`);
  }
});
