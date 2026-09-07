import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  VARIABLE_DE_TEST,
  evaluarIdentidadDeBaseDeDatos,
  identidadesDeProduccionDelEntorno
} from '../../domain/databaseIdentity.ts';

/**
 * La base de datos de pruebas de WALLET-PAYOUTS-1.
 *
 * EL GUARD DE IDENTIDAD VA PRIMERO, SIEMPRE
 *
 * Se reutiliza el guard fuerte aprobado en FX-BCV-1A: identidad POSITIVA del
 * proyecto de Test declarada en `FX_TEST_DB_PROJECT_REF`, Producción denegada
 * explícitamente, y fallo cerrado si no se puede determinar. Sin eso no se abre
 * ni una conexión, y mucho menos se escribe.
 *
 * Aquí importa todavía más que en FX: esta fase escribe carteras, movimientos
 * de dinero y solicitudes de retiro.
 *
 * Ni la URI, ni el usuario, ni la contraseña se imprimen en ningún caso.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizServidor = path.resolve(aqui, '../..');

export const MIGRACIONES = [
  '../supabase/migrations/20260830120000_fx_exchange_rates.sql',
  '../supabase/migrations/20260830140000_fx_exchange_rate_observations.sql',
  '../supabase/migrations/20260831090000_wallet_payouts_foundation.sql'
].map(relativa => path.resolve(raizServidor, relativa));

/**
 * El prefijo de todo lo que crea ESTA ejecucion.
 *
 * Lleva el identificador del proceso porque Node ejecuta los ficheros de prueba
 * EN PARALELO, cada uno en su propio proceso. Con un prefijo compartido, el
 * `test.after` de una suite borraba los datos de las otras mientras seguian
 * corriendo, y saltaban violaciones de clave foranea que parecian defectos del
 * codigo de produccion y eran de la limpieza.
 *
 * `wptest_` sigue siendo la raiz comun, para poder barrer restos a mano si
 * alguna vez hiciera falta.
 */
export const PREFIJO_COMUN = 'wptest_';
export const PREFIJO = `${PREFIJO_COMUN}${process.pid.toString(36)}${Date.now().toString(36)}_`;

const uriDePrueba = process.env.TEST_DATABASE_URL || '';

export const identidad = uriDePrueba
  ? evaluarIdentidadDeBaseDeDatos({
      uriObservada: uriDePrueba,
      refTestDeclarado: process.env[VARIABLE_DE_TEST],
      refsDeProduccion: identidadesDeProduccionDelEntorno()
    })
  : null;

/**
 * El motivo por el que saltarse la suite, o `false` para ejecutarla.
 *
 * Se expone para que cada fichero lo use como `skip` y quede escrito en la
 * salida por qué no se ejecutó.
 */
export function motivoParaSaltar(pool, preparado = true) {
  if (!uriDePrueba) return 'requiere TEST_DATABASE_URL (PostgreSQL de pruebas)';
  if (!identidad?.puedeEscribir) {
    return `${identidad?.veredicto} — ${identidad?.detalle}` +
      (identidad?.veredicto === 'RECHAZO_SIN_DECLARACION' ? ` (${VARIABLE_DE_TEST})` : '');
  }
  if (!pool) return 'no se pudo conectar al PostgreSQL de pruebas';
  if (!preparado) return `falta el esquema de la cartera: ejecute ${COMANDO_DE_MIGRACION}`;
  return false;
}

/** Las tablas que esta fase necesita encontrar ya creadas. */
const TABLAS_REQUERIDAS = [
  'wallets', 'wallet_ledger_entries', 'payment_methods',
  'withdrawal_requests', 'withdrawal_audit_events'
];

export const COMANDO_DE_MIGRACION = 'npm --prefix server run db:migrate:wallet-test';

/** `true` si el esquema de la cartera ya está aplicado. */
export async function esquemaPreparado(pool) {
  const { rows } = await pool.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])`,
    [TABLAS_REQUERIDAS]
  );
  return rows[0].n === TABLAS_REQUERIDAS.length;
}

/**
 * Abre el pool SÓLO si la identidad quedó confirmada.
 *
 * NO aplica migraciones, y eso es deliberado. Cuando cada suite lo hacía al
 * arrancar, Node las ejecutaba en paralelo y cinco procesos lanzaban el mismo
 * DDL a la vez: primero `deadlock detected` y, al serializarlo con cerrojos,
 * esperas hasta agotar el tiempo. La conclusión no fue «hace falta un cerrojo
 * mejor» sino que una prueba no debe cambiar el esquema como efecto secundario.
 *
 * Migrar es ahora una operación explícita:
 *
 *     npm --prefix server run db:migrate:wallet-test
 *
 * El puerto 6543 (el pooler en modo transacción) se prueba como alternativa
 * porque en algunas redes el 5432 no es accesible.
 */
export async function abrirBaseDePruebas() {
  if (!identidad?.puedeEscribir) return null;

  const configurado = Number(new URL(uriDePrueba).port || 5432);
  for (const puerto of [...new Set([configurado, 6543])]) {
    const uri = new URL(uriDePrueba);
    uri.port = String(puerto);
    const pool = new pg.Pool({
      connectionString: uri.toString(),
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 15000
    });
    try {
      await pool.query('select 1');
      return pool;
    } catch {
      try { await pool.end(); } catch { /* el pool ya está inservible */ }
    }
  }
  return null;
}

/** Un identificador único por ejecución, para que dos corridas no colisionen. */
export function idDePrueba(sufijo) {
  return `${PREFIJO}${sufijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Crea un usuario de prueba.
 *
 * `users` es documental en este esquema, así que el documento va en `payload`.
 * No se toca ningún usuario existente ni se cambia el esquema.
 */
export async function crearUsuario(pool, rol = 'passenger') {
  const id = idDePrueba(rol);
  await pool.query(
    `insert into public.users (id, payload) values ($1, $2::jsonb)`,
    [id, JSON.stringify({
      id,
      role: rol,
      firstName: 'Prueba',
      lastName: 'Wallet',
      email: `${id}@example.test`,
      accountStatus: 'ACTIVE'
    })]
  );
  return id;
}

/**
 * Borra lo que creó ESTA ejecución, y sólo eso.
 *
 * Las tablas append-only tienen disparadores que rechazan `delete`, así que se
 * silencian a propósito con `session_replication_role` —sólo en esta conexión— y
 * se restauran enseguida. Es deliberado y acotado: hay pruebas aparte que
 * comprueban que esos disparadores rechazan de verdad.
 */
export async function limpiar(pool) {
  if (!pool || !identidad?.puedeEscribir) return;
  const como = `${PREFIJO}%`;

  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    // `SET LOCAL`, no `SET`. Un ajuste de SESIÓN no es seguro detrás del pooler
    // en modo transacción: éste reasigna la conexión del servidor a otra sesión
    // de cliente, y el ajuste se filtra. Eso llegó a silenciar los disparadores
    // append-only de OTRAS suites, que entonces veían prosperar borrados que
    // debían rebotar. `LOCAL` dura exactamente esta transacción, que es la
    // unidad que el pooler respeta.
    await cliente.query("set local session_replication_role = 'replica'");

    // El orden respeta las claves foráneas: primero lo que apunta, después lo
    // apuntado.
    await cliente.query(
      `delete from public.withdrawal_audit_events
        where withdrawal_id in (select id from public.withdrawal_requests where user_id like $1)`,
      [como]
    );
    await cliente.query('delete from public.wallet_ledger_entries where user_id like $1', [como]);
    await cliente.query('delete from public.withdrawal_requests where user_id like $1', [como]);
    await cliente.query('delete from public.payment_methods where user_id like $1', [como]);
    await cliente.query('delete from public.wallets where user_id like $1', [como]);
    await cliente.query('delete from public.users where id like $1', [como]);
    await cliente.query('commit');
  } catch (error) {
    try { await cliente.query('rollback'); } catch { /* conexión perdida */ }
    throw error;
  } finally {
    cliente.release();
  }
}

/** Datos de un método bancario válido. Inventados. */
export const CUENTA_VALIDA = Object.freeze({
  bankCode: '0102',
  bankName: 'Banco de Venezuela',
  accountType: 'CORRIENTE',
  accountNumber: '01020123456789012345',
  holderName: 'María Rodríguez',
  holderDocumentType: 'V',
  holderDocumentNumber: '12345678'
});

/** Datos de un Pago Móvil válido. Inventados. */
export const PAGO_MOVIL_VALIDO = Object.freeze({
  bankCode: '0105',
  bankName: 'Banco Mercantil',
  phone: '04141234567',
  holderName: 'José Pérez',
  holderDocumentType: 'V',
  holderDocumentNumber: '87654321'
});

/** Las banderas encendidas, para las pruebas que necesitan la funcionalidad abierta. */
export const BANDERAS_ENCENDIDAS = Object.freeze({
  retirosHabilitados: true,
  retirosDeConductorHabilitados: true
});
