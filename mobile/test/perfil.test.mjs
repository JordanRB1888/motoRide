import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import {
  borradorDe,
  CAMPOS_DE_CONDUCTOR,
  CAMPOS_DE_PASAJERA,
  cambiosDePerfil,
  camposEditables,
  desdeCuando,
  erroresDelServidor,
  hayCambios,
  inicialesDe,
  leerPerfil,
  nombreDe,
  validarBorrador
} from '../domain/perfil.ts';

/**
 * El perfil real — CORE-INTEGRATION-1A.
 *
 * QUÉ SE PROTEGE
 *
 * Que la primera pantalla conectada a datos de verdad no se invente nada, no
 * duplique la autoridad de la sesión y no confunda un fallo de red con una
 * sesión caducada.
 *
 * La prueba más valiosa del fichero es la que compara la lista de campos
 * editables del cliente contra la lista blanca REAL de `server/index.js`: si
 * alguien añade un campo a la pantalla y el servidor no lo guarda, el cambio se
 * pierde al recargar y nadie se entera hasta que un usuario se queja.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const raizProyecto = path.resolve(raizMovil, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');
const sinComentarios = relativa => despojarComentarios(leer(relativa));

/** Lo que devuelve `publicUser` para una pasajera. */
const RESPUESTA_DEL_BACKEND = Object.freeze({
  id: 'u_1',
  role: 'passenger',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@ejemplo.com',
  phone: '+58 412 0000000',
  cedula: '00000000',
  isVerified: true,
  accountStatus: 'ACTIVE',
  photoUrl: '/api/users/u_1/photo',
  createdAt: '2026-03-14T10:00:00.000Z'
});

// ---------------------------------------------------------------------------
// El perfil llega de verdad
// ---------------------------------------------------------------------------

test('el perfil se lee de la respuesta REAL del backend', () => {
  const perfil = leerPerfil(RESPUESTA_DEL_BACKEND);
  assert.ok(perfil);
  assert.equal(perfil.firstName, 'Ana');
  assert.equal(perfil.email, 'ana@ejemplo.com');
  assert.equal(perfil.photoUrl, '/api/users/u_1/photo');
  assert.equal(nombreDe(perfil), 'Ana Pérez');
  assert.equal(inicialesDe(perfil), 'AP');
  assert.equal(desdeCuando(perfil), 'Miembro desde marzo de 2026');
});

test('un perfil a medias se rechaza entero', () => {
  // La misma regla que `leerIdentidad`: media identidad parece válida y es
  // peor que ninguna.
  assert.equal(leerPerfil(null), null);
  assert.equal(leerPerfil({ role: 'passenger' }), null, 'sin id');
  assert.equal(leerPerfil({ id: 'u_1' }), null, 'sin rol');
  assert.equal(leerPerfil({ id: 'u_1', role: 'invitado' }), null, 'rol desconocido');
});

test('lo que el backend NO manda queda vacío, no inventado', () => {
  const perfil = leerPerfil({ id: 'u_1', role: 'passenger' });
  assert.ok(perfil);
  assert.equal(perfil.phone, '');
  assert.equal(perfil.photoUrl, null);
  assert.equal(perfil.isVerified, false, 'sin el true explícito, no verificado');
  assert.equal(desdeCuando(perfil), null, 'sin fecha no se enseña la línea');
  assert.equal(inicialesDe(perfil), '', 'sin nombre no se inventa una letra');
});

test('una fecha ilegible no pinta «Invalid Date»', () => {
  const perfil = leerPerfil({ ...RESPUESTA_DEL_BACKEND, createdAt: 'ayer por la tarde' });
  assert.equal(desdeCuando(perfil), null);
});

test('el perfil NO trae valoración, viajes ni verificaciones que el backend no da', () => {
  // `publicUser` no devuelve nada de eso. Si algún día aparecen en el tipo sin
  // aparecer en el backend, alguien los pintará creyendo que son reales.
  const perfil = leerPerfil(RESPUESTA_DEL_BACKEND);
  for (const inventado of ['rating', 'trips', 'tripCount', 'phoneVerified', 'emailVerified', 'balance']) {
    assert.equal(inventado in perfil, false, `el perfil inventa «${inventado}»`);
  }
});

test('la cabecera no pinta el número de viajes con datos reales', () => {
  // El sello existe en el diseño porque el fixture lo tiene. Con la persona de
  // verdad se queda fuera: `GET /api/auth/me` no devuelve cuántos viajes lleva.
  const ruta = leer('app/perfil.tsx');
  assert.match(ruta, /viajes: null/, 'la ruta real inventa un número de viajes');

  const secciones = leer('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /perfil\.viajes !== null \?/, 'el sello se pinta aunque no haya dato');
});

// ---------------------------------------------------------------------------
// La edición
// ---------------------------------------------------------------------------

test('los campos editables son EXACTAMENTE los que el servidor acepta', () => {
  // La prueba que evita la promesa rota: un campo en pantalla que el servidor
  // no guarda se pierde al recargar y nadie se entera hasta la queja.
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const linea = servidor.match(/const allowed = \[([^\]]+)\]/);
  assert.ok(linea, 'ya no se puede leer la lista blanca del servidor');

  // La lista lleva dentro un ternario —`role === 'driver' ? [...] : []`— y esa
  // comparación también es una cadena entre comillas. Se descarta por nombre:
  // `driver` es un rol, no un campo del perfil.
  const permitidos = [...linea[1].matchAll(/'([a-zA-Z]+)'/g)]
    .map(coincidencia => coincidencia[1])
    .filter(nombre => nombre !== 'driver');

  assert.deepEqual(
    [...CAMPOS_DE_CONDUCTOR].sort(),
    [...new Set(permitidos)].sort(),
    'la lista del cliente y la del servidor se separaron'
  );
  // Y el reparto por rol también: los del vehículo son sólo del conductor.
  assert.deepEqual([...camposEditables('passenger')], [...CAMPOS_DE_PASAJERA]);
  assert.deepEqual([...camposEditables('driver')], [...CAMPOS_DE_CONDUCTOR]);
});

test('el correo NO se puede editar', () => {
  // No está en la lista blanca del servidor. La pantalla lo enseña bloqueado.
  assert.equal(CAMPOS_DE_CONDUCTOR.includes('email'), false);
  const pantalla = leer('preview/pantallaTusDatos.tsx');
  assert.match(pantalla, /etiqueta="Correo"[\s\S]{0,120}editable=\{false\}/, 'el correo se puede tocar');
});

test('se manda SÓLO lo que cambió', () => {
  const perfil = leerPerfil(RESPUESTA_DEL_BACKEND);
  const borrador = borradorDe(perfil);

  assert.equal(hayCambios(perfil, borrador), false, 'sin tocar nada no hay cambios');
  assert.deepEqual(cambiosDePerfil(perfil, borrador), {});

  const tocado = { ...borrador, firstName: 'Anabel' };
  assert.deepEqual(cambiosDePerfil(perfil, tocado), { firstName: 'Anabel' });
  assert.equal(hayCambios(perfil, tocado), true);
});

test('la validación del cliente copia la del servidor, ni más ni menos', () => {
  // Una validación de cliente MÁS dura que la del servidor rechaza datos que
  // el sistema aceptaría, y no hay forma de que el usuario lo entienda.
  assert.deepEqual(validarBorrador({ firstName: 'A' }), { firstName: 'Campo obligatorio.' });
  assert.deepEqual(validarBorrador({ firstName: 'Ana' }), {});
  assert.deepEqual(validarBorrador({ phone: '123' }), { phone: 'Teléfono inválido.' });
  assert.deepEqual(validarBorrador({ phone: '+58 412 0000000' }), {}, 'diez dígitos o más valen');
  // La cédula no se valida en el servidor, así que aquí tampoco.
  assert.deepEqual(validarBorrador({ cedula: '1' }), {});
});

test('los errores del servidor llegan al campo que los provocó', () => {
  assert.deepEqual(
    erroresDelServidor('VALIDATION_FAILED', { error: 'VALIDATION_FAILED', fields: { phone: 'Teléfono inválido.' } }),
    { phone: 'Teléfono inválido.' }
  );
  // El servidor no dice de quién es el teléfono repetido, y hace bien.
  assert.deepEqual(erroresDelServidor('USER_EXISTS', {}), { phone: 'Ese teléfono ya está en uso.' });
  // Un fallo sin campo concreto no ensucia el formulario.
  assert.deepEqual(erroresDelServidor('DATABASE_WRITE_FAILED', {}), {});
  assert.deepEqual(erroresDelServidor(null, null), {});
});

test('un error NO vacía lo que se escribió', () => {
  // Teclearlo todo otra vez justo cuando algo salió mal es la peor respuesta
  // posible. El borrador sólo lo cambia quien escribe.
  const pantalla = sinComentarios('preview/pantallaTusDatos.tsx');
  const guardar = pantalla.slice(pantalla.indexOf('async function guardar'), pantalla.indexOf('return ('));
  assert.equal(
    /setBorrador/.test(guardar), false,
    'el camino de guardado toca el borrador'
  );
  assert.match(pantalla, /setErrores\(resultado\)/, 'el error no se pinta');
});

test('el doble envío está cortado', () => {
  const pantalla = sinComentarios('preview/pantallaTusDatos.tsx');
  assert.match(pantalla, /if \(guardando\) return;/, 'dos toques crean dos peticiones');
  assert.match(pantalla, /cargando=\{guardando\}/, 'el botón no dice que está trabajando');
});

test('el servidor gana: se pinta lo que DEVOLVIÓ, no lo que se mandó', () => {
  const ruta = sinComentarios('app/perfil-datos.tsx');
  assert.match(ruta, /if \(respuesta\.ok\) \{\s*setPerfil\(respuesta\.datos\);/);
});

// ---------------------------------------------------------------------------
// La fotografía
// ---------------------------------------------------------------------------

test('la fotografía sigue siendo PRIVADA', () => {
  const servicio = leer('services/perfil.ts');
  // Va con la cabecera de sesión: sin ella el servidor responde 403 igual que
  // si la persona no existiera.
  assert.match(servicio, /authorization: `Bearer \$\{token\}`/);
  assert.match(servicio, /'\/api\/users\/'|photoUrl/, 'la ruta sale del backend, no se compone aquí');
  // Y no se convierte en pública por el camino.
  assert.equal(/base64|dataUrl|publicUrl/i.test(servicio), false, 'la foto se saca del contrato privado');
});

test('los tipos de foto son los que el servidor acepta', () => {
  const servidor = fs.readFileSync(path.join(raizProyecto, 'server/index.js'), 'utf8');
  const filtro = servidor.match(/\['image\/jpeg','image\/png','image\/webp'\]/);
  assert.ok(filtro, 'el filtro del servidor cambió de forma');

  const servicio = leer('services/perfil.ts');
  assert.match(servicio, /'image\/jpeg', 'image\/png', 'image\/webp'/);
  assert.match(servicio, /5 \* 1024 \* 1024/, 'el tope de tamaño no coincide con el del servidor');
});

// ---------------------------------------------------------------------------
// La sesión
// ---------------------------------------------------------------------------

test('no hay una segunda sesión', () => {
  // El perfil usa el mismo cliente y el mismo token. Si guardara el suyo,
  // habría dos sitios donde caducar y dos formas de quedarse a medias.
  const servicio = leer('services/perfil.ts');
  assert.match(servicio, /from '\.\/api'/, 'el perfil no usa el cliente compartido');
  assert.equal(/guardarToken|setToken|AsyncStorage/.test(servicio), false, 'el perfil guarda sesión por su cuenta');
  assert.equal(/jwt|localStorage/i.test(servicio), false);
});

test('cerrar sesión usa el flujo real y no deja la pantalla en la pila', () => {
  const ruta = sinComentarios('app/perfil.tsx');
  assert.match(ruta, /await salir\('PETICION_DE_LA_PERSONA'\)/, 'no usa el cierre del contexto');
  assert.match(ruta, /router\.replace\('\/'\)/, 'deja la pantalla protegida en la pila');
  assert.match(ruta, /if \(cerrando\) return;/, 'se puede tocar dos veces');
});

test('volver atrás NO devuelve a una pantalla protegida', () => {
  // La guarda mira el ESTADO, no la ruta: al remontarse tras cerrar sesión,
  // el estado ya es SIN_SESION y redirige. No hace falta tocar la pila.
  for (const ruta of ['app/perfil.tsx', 'app/perfil-datos.tsx']) {
    const fuente = sinComentarios(ruta);
    assert.match(fuente, /sesion\.estado !== 'AUTENTICADO'/, `${ruta} no comprueba el estado`);
    assert.match(fuente, /<Redirect href="\/" \/>/, `${ruta} no redirige fuera`);
  }
});

test('un fallo de RED no es una sesión inválida', () => {
  // Cerrarle la sesión a alguien porque iba en el metro es un fallo que se
  // nota enseguida. Aquí sólo se pinta el aviso y se ofrece reintentar.
  for (const ruta of ['app/perfil.tsx', 'app/perfil-datos.tsx']) {
    const fuente = sinComentarios(ruta);
    assert.match(fuente, /setError\(respuesta\.mensaje\)/, `${ruta} no avisa del fallo`);
    assert.match(fuente, /Reintentar/, `${ruta} no deja reintentar`);
  }
  // Y ninguna de las dos cierra sesión por su cuenta ante un error de carga.
  const perfil = sinComentarios('app/perfil.tsx');
  const cargar = perfil.slice(perfil.indexOf('const cargar'), perfil.indexOf('useEffect'));
  assert.equal(/salir\(/.test(cargar), false, 'un error de carga cierra la sesión');
});

test('el token sigue viviendo SÓLO en SecureStore', () => {
  const sesion = leer('services/session.ts');
  assert.match(sesion, /expo-secure-store/);
  // Sin comentarios: `services/perfil.ts` EXPLICA que el token vive en
  // SecureStore, y esa frase no es un uso.
  for (const fichero of ['services/perfil.ts', 'app/perfil.tsx', 'app/perfil-datos.tsx']) {
    assert.equal(
      /SecureStore|AsyncStorage|localStorage/.test(sinComentarios(fichero)), false,
      `${fichero} toca el almacén de sesión por su cuenta`
    );
  }
});

// ---------------------------------------------------------------------------
// Los datos de ejemplo
// ---------------------------------------------------------------------------

test('el fixture NO puede colarse en una versión publicada', () => {
  // El respaldo del componente depende del modo: en release, un perfil sin
  // datos se pinta VACÍO. «Demo Pasajera» en el perfil de una persona real
  // sería la forma más silenciosa de enseñar algo falso como verdadero.
  const secciones = leer('preview/pantallasC2Secciones.tsx');
  assert.match(secciones, /EN_DESARROLLO \? PERFIL_DE_EJEMPLO : PERFIL_VACIO/);
  assert.match(secciones, /const EN_DESARROLLO = typeof __DEV__/);

  // Y la ruta real siempre pasa datos, así que nunca llega al respaldo.
  assert.match(leer('app/perfil.tsx'), /datos=\{datos\}/);
});

test('las rutas reales del perfil no importan datos de demostración', () => {
  for (const ruta of ['app/perfil.tsx', 'app/perfil-datos.tsx']) {
    assert.equal(
      /from ['"][^'"]*preview\/fixtures/.test(leer(ruta)), false,
      `${ruta} importa datos de demostración`
    );
  }
});
