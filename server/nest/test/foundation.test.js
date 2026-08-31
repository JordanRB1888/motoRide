import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BACKEND-ARCH-1 — la fundación NestJS, comprobada de verdad.
 *
 * Se ejecuta sobre el código YA COMPILADO (`npm run build:nest`), porque los
 * decoradores de Nest necesitan transformación y Node no puede ejecutarlos con
 * borrado de tipos. Esa limitación está medida y documentada en
 * `docs/backend-architecture.md`.
 *
 * Nada de esto toca producción: no hay base de datos, no hay Socket.IO, no hay
 * variables de entorno de despliegue y no se abre ningún puerto fijo.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(aqui, '../../..');
const compilado = path.join(raizRepo, 'server/dist-nest/server/nest');

const hayCompilado = fs.existsSync(path.join(compilado, 'main.js'));
const saltar = {
  skip: hayCompilado ? false : 'requiere compilar antes: npm run build:nest'
};

const importar = ruta => import(new URL(`file:///${path.join(compilado, ruta).replace(/\\/g, '/')}`));

// ---------------------------------------------------------------------------
// Arranque y cierre
// ---------------------------------------------------------------------------

test('la aplicación NestJS se inicializa', saltar, async () => {
  const { crearAplicacionNest } = await importar('main.js');
  const app = await crearAplicacionNest();
  assert.ok(app, 'la fábrica devuelve una aplicación');
  await app.close();
});

test('cierra limpiamente y no deja el proceso enganchado', saltar, async () => {
  // Un `close()` que no cierra de verdad se nota aquí y en ningún otro sitio:
  // la suite terminaría pero el proceso se quedaría vivo.
  const { crearAplicacionNest } = await importar('main.js');
  const antes = process._getActiveHandles().length;
  const app = await crearAplicacionNest();
  await app.close();
  const despues = process._getActiveHandles().length;
  assert.ok(despues <= antes + 1,
    `tras cerrar no puede quedar el servidor vivo (antes ${antes}, después ${despues})`);
});

test('crear la aplicación NO abre ningún puerto', saltar, async () => {
  // `crearAplicacionNest()` va separado de `listen()` justamente por esto: una
  // prueba que necesita un puerto libre falla sola en cuanto alguien lo ocupa.
  const { crearAplicacionNest } = await importar('main.js');
  const app = await crearAplicacionNest();
  const servidor = app.getHttpServer();
  assert.equal(servidor.listening, false, 'el servidor HTTP no debe estar escuchando');
  await app.close();
});

// ---------------------------------------------------------------------------
// Inyección de dependencias
// ---------------------------------------------------------------------------

test('la inyección de dependencias funciona, y se puede sustituir', saltar, async () => {
  // La prueba de que la DI es real: se reemplaza el reloj por uno fijo y el
  // resultado cambia. Si el servicio llamara a `Date.now()` por dentro, esto
  // no podría comprobarse — y ese es justo el motivo de inyectarlo.
  const { Test } = await import('@nestjs/testing');
  const { HealthModule } = await importar('health/health.module.js');
  const { HealthService } = await importar('health/health.service.js');
  const { RELOJ } = await importar('system/clock.provider.js');

  const modulo = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(RELOJ)
    .useValue({ ahora: () => 1_700_000_000_000 })
    .compile();

  const servicio = modulo.get(HealthService);
  assert.equal(servicio.obtenerEstado().timestamp, 1_700_000_000_000,
    'el reloj inyectado es el que manda');
  await modulo.close();
});

test('el módulo de ejemplo se resuelve desde el contenedor', saltar, async () => {
  const { crearAplicacionNest } = await importar('main.js');
  const { HealthService } = await importar('health/health.service.js');
  const app = await crearAplicacionNest();
  try {
    const servicio = app.get(HealthService);
    const estado = servicio.obtenerEstado();
    assert.equal(estado.status, 'ok');
    assert.ok(Number.isFinite(estado.timestamp));
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// Contrato: Nest tiene que servir EXACTAMENTE lo que sirve el backend actual
// ---------------------------------------------------------------------------

/**
 * Lo que `server/index.js` devuelve hoy en `/api/health`, leído del fuente.
 *
 * Se lee el código en vez de levantar el servidor legacy a propósito: ese
 * arranque necesita base de datos y Socket.IO, y esta fase no debe depender de
 * ninguno de los dos. Lo que importa es que si alguien cambia el contrato
 * legacy y no el de Nest, esta prueba lo diga.
 */
function contratoLegacyDeSalud() {
  const fuente = fs.readFileSync(path.join(raizRepo, 'server/index.js'), 'utf8');
  const desde = fuente.indexOf("app.get('/api/health'");
  assert.notEqual(desde, -1, 'el endpoint de salud legacy tiene que existir');
  const bloque = fuente.slice(desde, fuente.indexOf('});', desde));

  const mensaje = bloque.match(/message:\s*'([^']+)'/);
  const caracteristicas = [...bloque.matchAll(/^\s{6}(\w+):\s*(true|false)/gm)]
    .map(([, clave, valor]) => [clave, valor === 'true']);

  assert.ok(mensaje, 'el legacy declara un mensaje');
  assert.ok(caracteristicas.length > 0, 'el legacy declara características');
  return { message: mensaje[1], features: Object.fromEntries(caracteristicas) };
}

test('el módulo Nest reproduce el contrato de salud del backend actual', saltar, async () => {
  const legacy = contratoLegacyDeSalud();
  const { crearAplicacionNest } = await importar('main.js');
  const { HealthService } = await importar('health/health.service.js');
  const app = await crearAplicacionNest();
  try {
    const nest = app.get(HealthService).obtenerEstado();

    assert.equal(nest.status, 'ok', 'mismo estado');
    assert.equal(nest.message, legacy.message, 'mismo mensaje, carácter a carácter');
    assert.deepEqual(nest.features, legacy.features,
      'mismas características, con los mismos nombres y los mismos valores');
    assert.equal(typeof nest.timestamp, 'number', 'y la marca de tiempo sigue siendo un número');
  } finally {
    await app.close();
  }
});

test('y lo sirve por HTTP con el mismo estado y la misma forma', saltar, async () => {
  // Aquí sí se escucha, pero en el puerto 0: el sistema asigna uno libre, así
  // que no puede colisionar con nada ni depender de que un puerto concreto
  // esté disponible.
  const { crearAplicacionNest } = await importar('main.js');
  const app = await crearAplicacionNest();
  try {
    await app.listen(0);
    const { port } = app.getHttpServer().address();
    const respuesta = await fetch(`http://127.0.0.1:${port}/api/health`);

    assert.equal(respuesta.status, 200, 'mismo estado HTTP que el legacy');
    const cuerpo = await respuesta.json();
    assert.deepEqual(Object.keys(cuerpo).sort(),
      ['features', 'message', 'status', 'timestamp'],
      'misma forma: ni un campo de más ni de menos');
    assert.equal(cuerpo.status, 'ok');
    assert.deepEqual(cuerpo.features, contratoLegacyDeSalud().features);
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

/** El código sin comentarios: lo que de verdad se ejecuta. */
function soloCodigo(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const fuentesDeLaFundacion = () => fs
  .readdirSync(path.join(raizRepo, 'server/nest'), { recursive: true })
  .filter(nombre => String(nombre).endsWith('.ts'))
  .map(nombre => ({
    nombre: String(nombre),
    codigo: soloCodigo(fs.readFileSync(path.join(raizRepo, 'server/nest', String(nombre)), 'utf8'))
  }));

test('la fundación no toca base de datos, sockets ni producción', saltar, async () => {
  // Se mira el CÓDIGO, no los comentarios. Los comentarios de esta fase
  // mencionan Railway y producción precisamente para explicar que no se tocan,
  // y una regla que leyera el texto entero se dispararía con su propia
  // documentación — que es exactamente lo que pasó al escribirla.
  const prohibido = /\bfrom\s+'pg'|new\s+Pool\(|socket\.io|DATABASE_URL|SUPABASE_|jsonwebtoken|bcrypt/i;
  const ofensores = fuentesDeLaFundacion()
    .filter(({ codigo }) => prohibido.test(codigo))
    .map(({ nombre }) => nombre);
  assert.deepEqual(ofensores, [],
    'BACKEND-ARCH-1 no toca PostgreSQL, Socket.IO, autenticación ni configuración de despliegue');
});

test('la única variable de entorno que lee es su propio puerto', saltar, async () => {
  const variables = fuentesDeLaFundacion()
    .flatMap(({ codigo }) => [...codigo.matchAll(/process\.env\.(\w+)/g)].map(([, clave]) => clave));
  assert.deepEqual([...new Set(variables)].sort(), ['NEST_PORT'],
    'la fundación no lee configuración de despliegue ni secretos');
});

test('el backend puede consumir los contratos compartidos', saltar, async () => {
  // Es una afirmación arquitectónica importante para las olas siguientes:
  // frontend y backend comparten los MISMOS tipos, sin duplicarlos. Se
  // comprueba sobre el compilado, que es lo que de verdad ejecutaría el
  // servidor.
  const contratos = await import(
    new URL(`file:///${path.join(raizRepo, 'server/dist-nest/shared/contracts/domain.js').replace(/\\/g, '/')}`)
  );
  assert.ok(Array.isArray(contratos.TRIP_STATUSES), 'los estados del viaje llegan al backend');
  assert.ok(contratos.TRIP_STATUSES.includes('COMPLETED'));
  assert.ok(contratos.USER_ROLES.includes('driver'));
});
