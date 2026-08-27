import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STARTUP_RETRY_DELAYS_MS,
  STARTUP_RETRY_MAX_TOTAL_MS,
  isTransientStartupError,
  runStartupWithRetry,
  safeErrorCategory
} from '../services/startupRetry.js';
import { openDatabaseBackend } from '../services/databaseBackend.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = relativo => fs.readFileSync(path.join(serverDir, relativo), 'utf8');

/**
 * DB-STARTUP-RESILIENCE-1: el arranque tolera cortes TRANSITORIOS de la base
 * de datos sin debilitar el fail-closed. Nace del incidente real: Supavisor
 * respondiendo «econnrefused» hacia su upstream durante unos minutos.
 */

const errorCon = (code, message = 'fallo') => Object.assign(new Error(message), { code });

/** Reloj y sueño falsos: las esperas no consumen tiempo real. */
function relojFalso() {
  let ahora = 1_000_000;
  const esperas = [];
  return {
    now: () => ahora,
    sleep: async ms => { esperas.push(ms); ahora += ms; },
    avanza: ms => { ahora += ms; },
    esperas
  };
}

// --------------------------------------------------------------------------
// Clasificación: qué se reintenta y qué jamás
// --------------------------------------------------------------------------

test('los cortes de conectividad son reintenables; auth/TLS/config jamás', () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', '08006', '08001', '57P03']) {
    assert.equal(isTransientStartupError(errorCon(code)), true, code);
  }
  for (const code of ['28P01', '28000', '3D000', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    assert.equal(isTransientStartupError(errorCon(code)), false, code);
  }
  // Lo DESCONOCIDO no se reintenta: un bug debe verse rápido.
  assert.equal(isTransientStartupError(new Error('TypeError: x is not a function')), false);
});

test('el error EXACTO del incidente real (Supavisor, 08006 FATAL) es reintenable', () => {
  const supavisor = Object.assign(
    new Error('Failed to connect to database: {:error, :econnrefused}'),
    { code: '08006', severity: 'FATAL' }
  );
  assert.equal(isTransientStartupError(supavisor), true);
  assert.equal(safeErrorCategory(supavisor), '08006');
  // Y la variante sin código utilizable, por el mensaje característico:
  const sinCodigo = new Error('Failed to connect to database: {:error, :econnrefused}');
  assert.equal(isTransientStartupError(sinCodigo), true);
});

test('un mensaje de conectividad que huela a credenciales o certificados NO se reintenta', () => {
  assert.equal(isTransientStartupError(new Error('timeout expired waiting for password authentication')), false);
  assert.equal(isTransientStartupError(new Error('econnrefused after certificate rejection')), false);
});

// --------------------------------------------------------------------------
// §9/§10 — transitorio: reintenta con la escalera y se recupera
// --------------------------------------------------------------------------

test('ECONNREFUSED ×2 y éxito al tercero: la escalera espera 2s y luego 4s', async () => {
  const reloj = relojFalso();
  const trazas = [];
  let intentos = 0;
  const resultado = await runStartupWithRetry({
    attempt: async () => {
      intentos += 1;
      if (intentos < 3) throw errorCon('ECONNREFUSED');
      return { kind: 'postgres' };
    },
    sleep: reloj.sleep, now: reloj.now, random: () => 0.5, // jitter = 0
    logger: { warn: t => trazas.push(t), log: t => trazas.push(t), error: t => trazas.push(t) }
  });
  assert.equal(resultado.kind, 'postgres');
  assert.equal(intentos, 3);
  assert.deepEqual(reloj.esperas, [2_000, 4_000], 'la escalera documentada');
  const texto = trazas.join('\n');
  assert.ok(texto.includes('database_startup_retry'));
  assert.ok(texto.includes('database_startup_recovered'));
  assert.ok(texto.includes('"attempts":3'));
  // Jamás material sensible en las trazas.
  assert.ok(!/postgres:\/\/|password|DATABASE_URL=/i.test(texto));
});

test('el 08006 del incidente se reintenta igual', async () => {
  const reloj = relojFalso();
  let intentos = 0;
  await runStartupWithRetry({
    attempt: async () => {
      intentos += 1;
      if (intentos === 1) throw errorCon('08006', 'Failed to connect to database: {:error, :econnrefused}');
      return true;
    },
    sleep: reloj.sleep, now: reloj.now, random: () => 0.5,
    logger: { warn: () => {}, log: () => {}, error: () => {} }
  });
  assert.equal(intentos, 2);
});

// --------------------------------------------------------------------------
// §11/§12 — permanentes: fallo RÁPIDO, un solo intento
// --------------------------------------------------------------------------

test('certificado inválido y autenticación fallida mueren al primer intento, sin esperas', async () => {
  for (const code of ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', '28P01']) {
    const reloj = relojFalso();
    let intentos = 0;
    const trazas = [];
    await assert.rejects(() => runStartupWithRetry({
      attempt: async () => { intentos += 1; throw errorCon(code); },
      sleep: reloj.sleep, now: reloj.now,
      logger: { warn: t => trazas.push(t), log: () => {}, error: t => trazas.push(t) }
    }));
    assert.equal(intentos, 1, `${code}: sin reintentos`);
    assert.deepEqual(reloj.esperas, [], `${code}: sin esperas`);
    assert.ok(trazas.join(' ').includes('database_startup_permanent_failure'));
  }
});

// --------------------------------------------------------------------------
// §13 — agotamiento: finito y fail-closed
// --------------------------------------------------------------------------

test('la base que no vuelve agota la ventana finita y el proceso falla cerrado', async () => {
  const reloj = relojFalso();
  let intentos = 0;
  const trazas = [];
  await assert.rejects(() => runStartupWithRetry({
    attempt: async () => { intentos += 1; throw errorCon('ECONNREFUSED'); },
    sleep: reloj.sleep, now: reloj.now, random: () => 0.5,
    maxTotalMs: 150_000,
    logger: { warn: t => trazas.push(t), log: () => {}, error: t => trazas.push(t) }
  }), /fallo/);
  // Escalera 2+4+8+15+30+30+30+30 = 149s ≤ 150s; la NOVENA espera (179s)
  // excederia la ventana → se agota tras 9 intentos.
  assert.deepEqual(reloj.esperas, [2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000, 30_000]);
  assert.equal(intentos, 9, 'intentos finitos');
  assert.ok(trazas.join(' ').includes('database_startup_retries_exhausted'));
});

test('el jitter queda acotado y nunca produce esperas ridiculas', async () => {
  const reloj = relojFalso();
  let intentos = 0;
  await runStartupWithRetry({
    attempt: async () => { intentos += 1; if (intentos === 1) throw errorCon('ECONNREFUSED'); return true; },
    sleep: reloj.sleep, now: reloj.now,
    random: () => 0, // jitter minimo: -20 %
    logger: { warn: () => {}, log: () => {}, error: () => {} }
  });
  assert.equal(reloj.esperas.length, 1);
  assert.ok(reloj.esperas[0] >= 1_600 && reloj.esperas[0] <= 2_400, `espera ${reloj.esperas[0]}`);
});

// --------------------------------------------------------------------------
// §14 — un solo dueño de efectos: pools fallidos se cierran, el bueno vive
// --------------------------------------------------------------------------

test('cada intento fallido cierra SU pool; solo el exitoso sobrevive (integracion real)', async (t) => {
  const previo = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://prueba-inyectada';
  t.after(() => {
    if (previo === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previo;
  });

  const pools = [];
  let intentos = 0;
  const reloj = relojFalso();
  const backend = await openDatabaseBackend({
    logger: { warn: () => {}, log: () => {}, error: () => {} },
    postgres: {
      createPool: () => {
        const pool = {
          cerrado: false,
          query: async () => {
            intentos += 1;
            if (intentos < 3) throw errorCon('ECONNREFUSED');
            return { rows: [{ ready: 1 }] };
          },
          end: async () => { pool.cerrado = true; }
        };
        pools.push(pool);
        return pool;
      },
      load: async () => ({ users: [], trips: [] }),
      createPersistence: async ({ pool }) => ({ kind: 'postgres', pool, close: async () => {} })
    },
    retryOptions: { sleep: reloj.sleep, now: reloj.now, random: () => 0.5 }
  });

  assert.equal(backend.kind, 'postgres');
  assert.equal(pools.length, 3, 'un pool por intento');
  assert.equal(pools[0].cerrado, true, 'el pool del intento 1 se cerro');
  assert.equal(pools[1].cerrado, true, 'el pool del intento 2 se cerro');
  assert.equal(pools[2].cerrado, false, 'solo el pool exitoso sobrevive');
});

// --------------------------------------------------------------------------
// Readiness y contratos intactos (estatico)
// --------------------------------------------------------------------------

test('la preparacion sigue siendo honesta: el servidor escucha DESPUES de la base de datos', () => {
  const indice = leer('index.js');
  const posBackend = indice.indexOf('await openDatabaseBackend(');
  const posListen = indice.indexOf('server.listen(');
  assert.ok(posBackend > 0 && posListen > posBackend,
    'sin base de datos cargada no existe el health 200: nada cambio');
  // Y UNA sola espiral de reintentos en el proceso: la de startupRetry.
  assert.equal((leer('services/databaseBackend.js').match(/runStartupWithRetry\(/g) || []).length, 1);
  assert.ok(!indice.includes('runStartupWithRetry'), 'index.js no añade otra espiral');
});

test('los valores de la politica documentada existen y son finitos', () => {
  assert.deepEqual([...STARTUP_RETRY_DELAYS_MS], [2_000, 4_000, 8_000, 15_000, 30_000]);
  assert.equal(STARTUP_RETRY_MAX_TOTAL_MS, 150_000);
  assert.ok(STARTUP_RETRY_MAX_TOTAL_MS < 5 * 60_000, 'la ventana es de minutos, no infinita');
});

test('el camino SQLite local no gano reintentos: sigue inmediato', () => {
  const backend = leer('services/databaseBackend.js');
  const posRetry = backend.indexOf('runStartupWithRetry');
  const posSqlite = backend.indexOf('DatabaseSync(dataFile)');
  assert.ok(posRetry >= 0 && posSqlite > posRetry,
    'el reintento envuelve SOLO el camino postgres');
});
