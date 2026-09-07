import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SinTasaDisponible,
  convertirConTasa,
  crearServicioDeCambio,
  diasEntre,
  evaluarFrescura,
  hoyEnCaracas
} from '../services/fxRateService.ts';
import {
  crearPlanificador,
  instanteDeHoraLocal,
  proximaConsulta
} from '../services/fxRateScheduler.ts';
import { actualizarTasaOficial } from '../services/fxRateUpdater.ts';

/**
 * FX-BCV-1 — el servicio, la conversión, la frescura y el planificador.
 *
 * Ninguna prueba sale a la red ni toca PostgreSQL: el ejecutor SQL y el reloj
 * se inyectan.
 */

/** Un ejecutor SQL de mentira que devuelve filas fijas y cuenta consultas. */
function sqlDeMentira(filas = []) {
  const registro = [];
  return {
    consultas: registro,
    async query(texto, valores) {
      registro.push({ texto, valores });
      return { rows: typeof filas === 'function' ? filas(texto, valores) : filas };
    }
  };
}

const FILA = {
  rate: '794.99170000',
  value_date: '2026-08-31',
  source: 'BCV',
  fetched_at: '2026-08-30T21:30:00.000Z',
  revision: 1
};

// ---------------------------------------------------------------------------
// Conversión
// ---------------------------------------------------------------------------

test('convierte dólares a bolívares con precisión exacta', () => {
  assert.equal(convertirConTasa('1.00', '794.99170000'), '794.99');
  assert.equal(convertirConTasa('3.50', '794.99170000'), '2782.47');
  assert.equal(convertirConTasa('0.00', '794.99170000'), '0.00');
  assert.equal(convertirConTasa('100.00', '794.99170000'), '79499.17');
});

test('el resultado no arrastra el error de la coma flotante', () => {
  // 0.1 + 0.2 en coma flotante da 0.30000000000000004. Con enteros, no.
  const uno = convertirConTasa('0.10', '794.99170000');
  const dos = convertirConTasa('0.20', '794.99170000');
  assert.equal(uno, '79.50');
  assert.equal(dos, '159.00');
  // Y multiplicar por diez la unidad da exactamente la decena.
  assert.equal(convertirConTasa('1.00', '794.99170000'), '794.99');
});

test('rechaza entradas que no puede convertir con seguridad', () => {
  assert.throws(() => convertirConTasa('no', '794.99'), TypeError);
  assert.throws(() => convertirConTasa('1.00', 'no'), TypeError);
  assert.throws(() => convertirConTasa('-1.00', '794.99'), RangeError);
  assert.throws(() => convertirConTasa('1.00', '0'), RangeError);
  assert.throws(() => convertirConTasa('1.00', '-794.99'), RangeError);
});

// ---------------------------------------------------------------------------
// Frescura: servir una tasa vieja está permitido; ocultarlo, no
// ---------------------------------------------------------------------------

test('la fecha de hoy se calcula en el huso de Caracas', () => {
  // A las 02:00 UTC del día 31 en Caracas todavía es el 30: son las 22:00.
  // Usar el huso del servidor —que en Railway es UTC— daría el día equivocado.
  assert.equal(hoyEnCaracas(new Date('2026-08-31T02:00:00Z')), '2026-08-30');
  assert.equal(hoyEnCaracas(new Date('2026-08-31T04:00:00Z')), '2026-08-31');
});

test('cuenta los días entre fechas sin desviarse', () => {
  assert.equal(diasEntre('2026-08-30', '2026-08-31'), 1);
  assert.equal(diasEntre('2026-08-31', '2026-08-31'), 0);
  assert.equal(diasEntre('2026-08-31', '2026-08-30'), -1);
  // A través de un cambio de mes y de año.
  assert.equal(diasEntre('2026-12-31', '2027-01-01'), 1);
  assert.equal(diasEntre('2026-02-28', '2026-03-01'), 1, '2026 no es bisiesto');
});

test('una tasa con fecha valor futura es fresca, no sospechosa', () => {
  // Es el funcionamiento NORMAL del BCV: publica por la tarde la del día
  // siguiente. Tratarlo como anomalía sería un error de dominio.
  const lectura = evaluarFrescura(
    { base: 'USD', quote: 'VES', rate: '794.99170000', valueDate: '2026-08-31', source: 'BCV', fetchedAt: 'x' },
    new Date('2026-08-30T20:00:00Z')
  );
  assert.equal(lectura.freshness, 'FRESH');
  assert.equal(lectura.ageInDays, 0);
});

test('la tasa del viernes sigue fresca el sábado', () => {
  // El BCV no publica los fines de semana. Con tolerancia cero, todos los
  // sábados aparecerían como degradados y la señal dejaría de significar nada.
  const lectura = evaluarFrescura(
    { base: 'USD', quote: 'VES', rate: '794.99170000', valueDate: '2026-08-28', source: 'BCV', fetchedAt: 'x' },
    new Date('2026-08-29T15:00:00Z')
  );
  assert.equal(lectura.freshness, 'FRESH');
  assert.equal(lectura.ageInDays, 1);
});

test('una tasa realmente vieja se marca como tal', () => {
  const lectura = evaluarFrescura(
    { base: 'USD', quote: 'VES', rate: '794.99170000', valueDate: '2026-08-20', source: 'BCV', fetchedAt: 'x' },
    new Date('2026-08-30T15:00:00Z')
  );
  assert.equal(lectura.freshness, 'STALE');
  assert.equal(lectura.ageInDays, 10);
});

// ---------------------------------------------------------------------------
// El servicio
// ---------------------------------------------------------------------------

test('sirve la tasa vigente con su frescura', async () => {
  const servicio = crearServicioDeCambio({
    sql: sqlDeMentira([FILA]),
    ahora: () => new Date('2026-08-30T20:00:00Z')
  });
  const lectura = await servicio.tasaVigente();
  assert.equal(lectura.rate.rate, '794.99170000');
  assert.equal(lectura.rate.valueDate, '2026-08-31');
  assert.equal(lectura.rate.base, 'USD');
  assert.equal(lectura.rate.quote, 'VES');
  assert.equal(lectura.freshness, 'FRESH');
});

test('la tasa NO se convierte a número en ningún punto', () => {
  // Es la garantía de toda la fase. `pg` devuelve `numeric` como cadena y aquí
  // se mantiene: en cuanto pasara por `Number`, 794.99170000 dejaría de ser
  // exacto y la columna `numeric(18,8)` no podría salvarlo.
  assert.equal(typeof FILA.rate, 'string');
  const lectura = evaluarFrescura(
    { base: 'USD', quote: 'VES', rate: FILA.rate, valueDate: '2026-08-31', source: 'BCV', fetchedAt: 'x' },
    new Date('2026-08-30T20:00:00Z')
  );
  assert.equal(typeof lectura.rate.rate, 'string');
  assert.equal(lectura.rate.rate, '794.99170000');
});

test('sin ninguna tasa registrada devuelve null y NO inventa una', async () => {
  const servicio = crearServicioDeCambio({ sql: sqlDeMentira([]) });
  assert.equal(await servicio.tasaVigente(), null);
});

test('convertir sin tasa falla en vez de cobrar cero', async () => {
  // Cobrar cero bolívares es un error tan grave como cobrar de más, y silencioso.
  const servicio = crearServicioDeCambio({ sql: sqlDeMentira([]) });
  await assert.rejects(() => servicio.convertirUsdAVes('3.50'), SinTasaDisponible);
});

test('la caché evita consultas repetidas', async () => {
  const sql = sqlDeMentira([FILA]);
  const servicio = crearServicioDeCambio({ sql, ahora: () => new Date('2026-08-30T20:00:00Z') });
  await servicio.tasaVigente();
  await servicio.tasaVigente();
  await servicio.convertirUsdAVes('1.00');
  assert.equal(sql.consultas.length, 1, 'una sola consulta para tres lecturas');
});

test('la ausencia de tasa NO se cachea', async () => {
  // Si se cacheara, el sistema seguiría sin tasa durante toda la vigencia de la
  // caché aunque la tarea diaria ya la hubiera guardado.
  let filas = [];
  const sql = sqlDeMentira(() => filas);
  const servicio = crearServicioDeCambio({ sql, ahora: () => new Date('2026-08-30T20:00:00Z') });

  assert.equal(await servicio.tasaVigente(), null);
  filas = [FILA];
  const segunda = await servicio.tasaVigente();
  assert.equal(segunda.rate.rate, '794.99170000');
});

test('la caché no alarga la frescura de una tasa', async () => {
  // La frescura se recalcula contra el reloj en CADA lectura, no contra el
  // momento en que la tasa entró en la caché. Si no, una tasa cacheada parecería
  // fresca para siempre.
  let ahora = new Date('2026-08-30T20:00:00Z');
  const servicio = crearServicioDeCambio({
    sql: sqlDeMentira([{ ...FILA, value_date: '2026-08-30' }]),
    ahora: () => ahora,
    vigenciaDeCacheMs: 10 * 24 * 60 * 60 * 1000
  });

  assert.equal((await servicio.tasaVigente()).freshness, 'FRESH');
  ahora = new Date('2026-09-05T20:00:00Z');
  const despues = await servicio.tasaVigente();
  assert.equal(despues.freshness, 'STALE', 'seis días después ya no es fresca');
  assert.equal(despues.ageInDays, 6);
});

test('invalidar la caché fuerza una consulta nueva', async () => {
  const sql = sqlDeMentira([FILA]);
  const servicio = crearServicioDeCambio({ sql, ahora: () => new Date('2026-08-30T20:00:00Z') });
  await servicio.tasaVigente();
  servicio.invalidarCache();
  await servicio.tasaVigente();
  assert.equal(sql.consultas.length, 2);
});

// ---------------------------------------------------------------------------
// La actualización: qué se guarda y qué no
// ---------------------------------------------------------------------------

test('una variación sospechosa NO se guarda', async () => {
  // El caso realista: la portada se reordena y leemos la lira en vez del dólar.
  const escrituras = [];
  const sql = {
    async query(texto, valores) {
      if (texto.includes('insert into')) {
        escrituras.push(valores);
        return { rows: [{ revision: 1, insertada: true }] };
      }
      return { rows: [FILA] };
    }
  };

  const avisos = [];
  const resultado = await actualizarTasaOficial({
    sql,
    registrar: mensaje => avisos.push(mensaje),
    proveedor: async () => ({
      ok: true,
      valor: { tasa: '16.47982495', fechaValor: '2026-08-31', obtenidaEn: '2026-08-30T21:30:00.000Z' }
    })
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'VARIACION_SOSPECHOSA');
  assert.deepEqual(escrituras, [], 'no se escribió nada');
  assert.ok(avisos.some(a => a.startsWith('FX_BCV_VARIACION_RECHAZADA')));
});

test('un fallo del BCV deja intacta la última tasa buena conocida', async () => {
  const escrituras = [];
  const sql = {
    async query(texto, valores) {
      if (texto.includes('insert into')) escrituras.push(valores);
      return { rows: [FILA] };
    }
  };

  const resultado = await actualizarTasaOficial({
    sql,
    proveedor: async () => ({ ok: false, motivo: 'RED', detalle: 'sin respuesta' })
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'RED');
  assert.deepEqual(escrituras, [], 'un fallo de red no escribe nada');
});

test('una variación sospechosa puede aceptarse, pero sólo a mano', async () => {
  // El bolívar SÍ puede moverse mucho. La vía existe; lo que no existe es que
  // se active sola.
  const avisos = [];
  const sql = {
    async query(texto) {
      if (texto.includes('insert into')) return { rows: [{ revision: 1, insertada: true }] };
      return { rows: [FILA] };
    }
  };

  const resultado = await actualizarTasaOficial({
    sql,
    aceptarVariacionInusual: true,
    registrar: mensaje => avisos.push(mensaje),
    proveedor: async () => ({
      ok: true,
      valor: { tasa: '2500.00000000', fechaValor: '2026-09-01', obtenidaEn: '2026-08-31T21:30:00.000Z' }
    })
  });

  assert.equal(resultado.ok, true);
  assert.ok(avisos.some(a => a.startsWith('FX_BCV_VARIACION_ACEPTADA_A_MANO')));
});

// ---------------------------------------------------------------------------
// El planificador
// ---------------------------------------------------------------------------

test('las 17:30 de Caracas son las 21:30 UTC', () => {
  const instante = instanteDeHoraLocal(2026, 8, 30, 17, 30);
  assert.equal(instante.toISOString(), '2026-08-30T21:30:00.000Z');
});

test('si la hora de hoy ya pasó, programa la de mañana', () => {
  // A las 22:00 UTC ya son las 18:00 en Caracas: la consulta de hoy pasó.
  const siguiente = proximaConsulta(new Date('2026-08-30T22:00:00Z'));
  assert.equal(siguiente.toISOString(), '2026-08-31T21:30:00.000Z');
});

test('si todavía no ha llegado, programa la de hoy', () => {
  const siguiente = proximaConsulta(new Date('2026-08-30T12:00:00Z'));
  assert.equal(siguiente.toISOString(), '2026-08-30T21:30:00.000Z');
});

test('justo en la hora exacta programa la del día siguiente, sin bucle', () => {
  const siguiente = proximaConsulta(new Date('2026-08-30T21:30:00.000Z'));
  assert.equal(siguiente.toISOString(), '2026-08-31T21:30:00.000Z');
});

test('cruza el cambio de mes correctamente', () => {
  const siguiente = proximaConsulta(new Date('2026-08-31T22:00:00Z'));
  assert.equal(siguiente.toISOString(), '2026-09-01T21:30:00.000Z');
});

test('importar el planificador NO arranca nada', () => {
  // Es la garantía de que esta fase no enciende ninguna tarea por su cuenta.
  let ejecuciones = 0;
  const planificador = crearPlanificador({ tarea: async () => { ejecuciones += 1; return { ok: true }; } });
  assert.equal(planificador.proximaEjecucion(), null);
  assert.equal(ejecuciones, 0);
});

test('al iniciarse programa, pero no ejecuta de inmediato', async () => {
  let ejecuciones = 0;
  const planificador = crearPlanificador({
    tarea: async () => { ejecuciones += 1; return { ok: true }; },
    ahora: () => new Date('2026-08-30T12:00:00Z'),
    programar: () => ({ cancelar: () => {} })
  });

  planificador.iniciar();
  assert.equal(ejecuciones, 0, 'no consulta al arrancar por su cuenta');
  assert.equal(planificador.proximaEjecucion().toISOString(), '2026-08-30T21:30:00.000Z');
  planificador.detener();
  assert.equal(planificador.proximaEjecucion(), null);
});

test('se reprograma aunque la consulta falle', async () => {
  // Si un fallo del BCV dejara la tarea muerta, la tasa no volvería a
  // actualizarse hasta el siguiente reinicio del servidor.
  const programaciones = [];
  let disparar = null;

  const planificador = crearPlanificador({
    tarea: async () => ({ ok: false, motivo: 'RED' }),
    ahora: () => new Date('2026-08-30T12:00:00Z'),
    programar: (accion, ms) => {
      programaciones.push(ms);
      disparar = accion;
      return { cancelar: () => {} };
    }
  });

  planificador.iniciar();
  assert.equal(programaciones.length, 1);

  disparar();
  await new Promise(listo => { setImmediate(listo); });
  await new Promise(listo => { setImmediate(listo); });

  assert.equal(programaciones.length, 2, 'tras fallar, vuelve a programarse');
});

test('una excepción de la tarea no mata el planificador', async () => {
  const programaciones = [];
  let disparar = null;

  const planificador = crearPlanificador({
    tarea: async () => { throw new Error('algo inesperado'); },
    ahora: () => new Date('2026-08-30T12:00:00Z'),
    programar: (accion, ms) => {
      programaciones.push(ms);
      disparar = accion;
      return { cancelar: () => {} };
    }
  });

  planificador.iniciar();
  disparar();
  await new Promise(listo => { setImmediate(listo); });
  await new Promise(listo => { setImmediate(listo); });

  assert.equal(programaciones.length, 2, 'sobrevive a una excepción y se reprograma');
});

test('el registro no filtra el documento ni credenciales', async () => {
  const avisos = [];
  const planificador = crearPlanificador({
    tarea: async () => { throw new Error('socket hang up'); },
    registrar: mensaje => avisos.push(mensaje),
    programar: () => ({ cancelar: () => {} })
  });

  await planificador.ejecutarAhora();
  assert.deepEqual(avisos, ['FX_BCV_ERROR detalle=socket hang up']);
  for (const aviso of avisos) {
    assert.equal(aviso.includes('<html'), false);
    assert.equal(aviso.includes('cookie'), false);
    assert.ok(aviso.length < 200);
  }
});
