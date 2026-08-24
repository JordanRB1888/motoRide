/**
 * Persistencia incremental de las colecciones en memoria.
 *
 * La versión anterior borraba y reinsertaba las diez tablas completas en cada
 * escritura, de forma síncrona. Como `driver:location` persiste con cada
 * lectura de GPS, el coste de una sola moto en movimiento crecía con el
 * histórico acumulado de toda la aplicación: medido sobre datos sintéticos,
 * 7 ms recién lanzada y 1 083 ms con 20 000 viajes, con el bucle de eventos
 * bloqueado durante todo ese tiempo.
 *
 * Aquí se mantiene una sombra de lo que hay en disco (id -> payload
 * serializado) y solo se escriben las filas que cambiaron. El coste pasa a
 * depender de lo que cambió, no de lo acumulado.
 *
 * Invariante central: la sombra solo se actualiza DESPUÉS de un COMMIT
 * confirmado. Si la transacción falla, el disco no cambió y la sombra debe
 * seguir describiéndolo, para que la siguiente escritura reintente lo mismo.
 */

export const PERSISTED_TABLES = Object.freeze([
  'users',
  'trips',
  'notifications',
  'messages',
  'supportMessages',
  'settings',
  'transactions',
  'driverApplications',
  'driverDocuments',
  'adminActions',
  'pushSubscriptions'
]);

// Los nombres de tabla se interpolan en SQL, así que nunca pueden venir de
// datos: solo se admiten identificadores simples.
const TABLE_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

export function createDatabasePersistence({
  sqlite,
  database,
  tables = PERSISTED_TABLES,
  logger = console
} = {}) {
  if (!sqlite) throw new Error('PERSISTENCE_REQUIRES_SQLITE');
  if (!database) throw new Error('PERSISTENCE_REQUIRES_DATABASE');

  const tableNames = [...tables];
  for (const table of tableNames) {
    if (!TABLE_NAME.test(table)) throw new Error(`INVALID_TABLE_NAME:${table}`);
  }

  /** @type {Map<string, Map<string, string>>} id -> payload tal y como está en disco */
  const shadow = new Map();

  // La sombra se siembra leyendo el disco, no serializando lo que hay en
  // memoria: así describe exactamente lo persistido. Si la serialización
  // actual difiere en formato de lo guardado, la primera escritura reescribe
  // esas filas una sola vez y a partir de ahí ya coinciden.
  for (const table of tableNames) {
    const filas = new Map();
    for (const row of sqlite.prepare(`SELECT id, payload FROM ${table}`).all()) {
      filas.set(row.id, row.payload);
    }
    shadow.set(table, filas);
  }

  function collectChanges(table) {
    const coleccion = database[table];
    // Una colección ausente no significa «borrar la tabla». Antes que vaciar
    // datos reales por un fallo de carga, se aborta la escritura entera.
    if (!Array.isArray(coleccion)) throw new Error(`MISSING_COLLECTION:${table}`);

    const previas = shadow.get(table);
    const upserts = [];
    const presentes = new Set();

    for (const item of coleccion) {
      const id = item?.id;
      // Antes, un registro sin identificador válido rompía la clave primaria y
      // tumbaba la escritura completa. Se conserva ese fallo ruidoso: es señal
      // de corrupción, no algo que deba pasar en silencio.
      if (typeof id !== 'string' || id === '') throw new Error(`INVALID_RECORD_ID:${table}`);
      if (presentes.has(id)) throw new Error(`DUPLICATE_RECORD_ID:${table}:${id}`);
      presentes.add(id);

      const payload = JSON.stringify(item);
      if (previas.get(id) !== payload) upserts.push({ id, payload });
    }

    const deletes = [];
    for (const id of previas.keys()) {
      if (!presentes.has(id)) deletes.push(id);
    }

    return { table, upserts, deletes };
  }

  function persist() {
    let plan;
    try {
      plan = tableNames.map(collectChanges);
    } catch (error) {
      logger.error('[+58express Database] No se pudo guardar la persistencia:', error.message);
      return false;
    }

    const cambios = plan.reduce((total, t) => total + t.upserts.length + t.deletes.length, 0);
    // Sin cambios no se abre transacción ni se toca el disco. Muchas llamadas
    // del servidor persisten «por si acaso» tras leer o tras una operación que
    // no modificó nada.
    if (cambios === 0) return true;

    try {
      sqlite.exec('BEGIN IMMEDIATE');
      for (const { table, upserts, deletes } of plan) {
        if (upserts.length) {
          const insertar = sqlite.prepare(
            `INSERT INTO ${table} (id, payload) VALUES (?, ?)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`
          );
          for (const fila of upserts) insertar.run(fila.id, fila.payload);
        }
        if (deletes.length) {
          const borrar = sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`);
          for (const id of deletes) borrar.run(id);
        }
      }
      sqlite.exec('COMMIT');
    } catch (error) {
      try { sqlite.exec('ROLLBACK'); } catch {}
      logger.error('[+58express Database] No se pudo guardar la persistencia:', error.message);
      // La sombra queda intacta a propósito: el disco no cambió.
      return false;
    }

    for (const { table, upserts, deletes } of plan) {
      const previas = shadow.get(table);
      for (const fila of upserts) previas.set(fila.id, fila.payload);
      for (const id of deletes) previas.delete(id);
    }
    return true;
  }

  /**
   * Escribe UN solo registro. Para las rutas de alta frecuencia —GPS del
   * conductor, GPS del pasajero, cambio de disponibilidad, mensaje de chat—,
   * donde el evento modifica exactamente un registro conocido.
   *
   * `persist()` sigue costando una pasada de serialización sobre todo lo
   * acumulado aunque no haya cambiado nada; esto cuesta un registro y nada
   * más, así que el coste deja de crecer con el histórico.
   *
   * Contrato del llamante: `item` debe ser un elemento que ya esté en
   * `database[table]`. Persistir aquí algo que no está en la colección
   * escribiría una fila que la siguiente `persist()` borraría, y persistir
   * esto no guarda ningún otro cambio pendiente en otras colecciones.
   */
  function persistRecord(table, item) {
    const previas = shadow.get(table);
    if (!previas) {
      logger.error('[+58express Database] No se pudo guardar la persistencia:', `UNKNOWN_TABLE:${table}`);
      return false;
    }
    const id = item?.id;
    if (typeof id !== 'string' || id === '') {
      logger.error('[+58express Database] No se pudo guardar la persistencia:', `INVALID_RECORD_ID:${table}`);
      return false;
    }

    let payload;
    try {
      payload = JSON.stringify(item);
    } catch (error) {
      logger.error('[+58express Database] No se pudo guardar la persistencia:', error.message);
      return false;
    }
    if (previas.get(id) === payload) return true;

    try {
      sqlite.prepare(
        `INSERT INTO ${table} (id, payload) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`
      ).run(id, payload);
    } catch (error) {
      logger.error('[+58express Database] No se pudo guardar la persistencia:', error.message);
      return false;
    }
    previas.set(id, payload);
    return true;
  }

  // Solo para pruebas y diagnóstico: cuántas filas cree la sombra que hay en
  // disco por tabla.
  function shadowSize(table) {
    return shadow.get(table)?.size ?? 0;
  }

  return { persist, persistRecord, shadowSize, tables: tableNames };
}
