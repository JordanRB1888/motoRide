import test from 'node:test';
import assert from 'node:assert/strict';
import { averageAdminResponseMs } from '../domain/supportMetrics.js';

const minuto = 60_000;
const t = ms => new Date(ms).toISOString();

const mensaje = (id, hilo, rol, ms) => ({
  id, conversationUserId: hilo, senderRole: rol, createdAt: t(ms)
});

/**
 * Implementación anterior, la que corría en el navegador. Se conserva aquí
 * como referencia para comprobar que mover el cálculo al servidor no cambió
 * su definición.
 */
function referencia(messages) {
  const porHilo = new Map();
  for (const m of messages) {
    if (!porHilo.has(m.conversationUserId)) porHilo.set(m.conversationUserId, []);
    porHilo.get(m.conversationUserId).push(m);
  }
  const muestras = [];
  for (const hilo of porHilo.values()) {
    const ordenado = [...hilo].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    ordenado.forEach((m, index) => {
      if (m.senderRole === 'admin') {
        const previo = ordenado.slice(0, index).reverse().find(item => item.senderRole !== 'admin');
        if (previo) muestras.push(Math.max(0, new Date(m.createdAt) - new Date(previo.createdAt)));
      }
    });
  }
  if (!muestras.length) return null;
  return Math.round(muestras.reduce((s, v) => s + v, 0) / muestras.length);
}

test('mide la espera entre la pregunta y la respuesta', () => {
  const messages = [
    mensaje('a', 'u1', 'passenger', 0),
    mensaje('b', 'u1', 'admin', 2 * minuto)
  ];
  assert.equal(averageAdminResponseMs(messages), 2 * minuto);
});

test('promedia varias esperas de varios hilos', () => {
  const messages = [
    mensaje('a', 'u1', 'passenger', 0),
    mensaje('b', 'u1', 'admin', 2 * minuto),
    mensaje('c', 'u2', 'passenger', 0),
    mensaje('d', 'u2', 'admin', 4 * minuto)
  ];
  assert.equal(averageAdminResponseMs(messages), 3 * minuto);
});

test('dos respuestas seguidas se miden desde el mismo mensaje original', () => {
  // Comportamiento de la implementación anterior: se busca el último mensaje
  // de la otra parte saltando por encima de las respuestas intermedias.
  const messages = [
    mensaje('a', 'u1', 'passenger', 0),
    mensaje('b', 'u1', 'admin', 1 * minuto),
    mensaje('c', 'u1', 'admin', 3 * minuto)
  ];
  assert.equal(averageAdminResponseMs(messages), 2 * minuto);
  assert.equal(averageAdminResponseMs(messages), referencia(messages));
});

test('una ráfaga de preguntas se mide desde la última', () => {
  const messages = [
    mensaje('a', 'u1', 'passenger', 0),
    mensaje('b', 'u1', 'passenger', 3 * minuto),
    mensaje('c', 'u1', 'admin', 4 * minuto)
  ];
  assert.equal(averageAdminResponseMs(messages), 1 * minuto);
  assert.equal(averageAdminResponseMs(messages), referencia(messages));
});

test('los hilos no se mezclan entre sí', () => {
  // Sin agrupar, la respuesta de un hilo se mediría contra la pregunta de otro.
  const messages = [
    mensaje('a', 'u1', 'passenger', 0),
    mensaje('b', 'u2', 'passenger', 10 * minuto),
    mensaje('c', 'u1', 'admin', 20 * minuto)
  ];
  assert.equal(averageAdminResponseMs(messages), 20 * minuto);
  assert.equal(averageAdminResponseMs(messages), referencia(messages));
});

test('el orden de entrada no altera el resultado', () => {
  const messages = [
    mensaje('c', 'u1', 'admin', 4 * minuto),
    mensaje('a', 'u1', 'passenger', 0),
    mensaje('b', 'u1', 'passenger', 3 * minuto)
  ];
  assert.equal(averageAdminResponseMs(messages), 1 * minuto);
});

test('sin respuestas de administración no hay métrica', () => {
  assert.equal(averageAdminResponseMs([]), null);
  assert.equal(averageAdminResponseMs(null), null);
  assert.equal(averageAdminResponseMs(undefined), null);
  assert.equal(averageAdminResponseMs([mensaje('a', 'u1', 'passenger', 0)]), null);
  // Una respuesta sin pregunta previa tampoco mide nada.
  assert.equal(averageAdminResponseMs([mensaje('a', 'u1', 'admin', 0)]), null);
});

test('registros incompletos no rompen el cálculo', () => {
  const messages = [
    { conversationUserId: 'u1', senderRole: 'passenger' },
    mensaje('b', 'u1', 'admin', 0),
    { senderRole: 'admin', createdAt: t(0) },
    null
  ].filter(Boolean);
  assert.doesNotThrow(() => averageAdminResponseMs(messages));
});

test('coincide con la implementación anterior en un histórico variado', () => {
  const messages = [];
  let ms = 0;
  for (let hilo = 0; hilo < 12; hilo += 1) {
    for (let i = 0; i < 15; i += 1) {
      ms += (hilo * 7 + i * 13) % 900_000;
      const rol = (hilo + i) % 3 === 0 ? 'admin' : 'passenger';
      messages.push(mensaje(`m_${hilo}_${i}`, `u_${hilo}`, rol, ms));
    }
  }
  assert.equal(averageAdminResponseMs(messages), referencia(messages));
});

test('cada mensaje del hilo se examina un número acotado de veces', () => {
  // La versión anterior rebuscaba hacia atrás por cada respuesta, así que un
  // hilo largo se disparaba. Se cuentan accesos en lugar de cronometrar: el
  // reloj de pared es ruido cuando la suite corre en paralelo, y lo que
  // importa es la forma del coste, no su velocidad.
  // El caso peor de la busqueda hacia atras: una sola pregunta al principio y
  // despues una fila larga de respuestas. Con roles alternados el defecto no
  // se manifiesta, porque el mensaje anterior aparece a la primera.
  const construir = n => Array.from({ length: n }, (_, i) => {
    const base = { id: `m_${i}`, conversationUserId: 'u1', createdAt: t(i * 1000) };
    let lecturas = 0;
    Object.defineProperty(base, 'senderRole', {
      get() { lecturas += 1; return i === 0 ? 'passenger' : 'admin'; },
      enumerable: true
    });
    Object.defineProperty(base, '__lecturas', { get: () => lecturas, enumerable: false });
    return base;
  });

  for (const n of [100, 1000, 4000]) {
    const datos = construir(n);
    averageAdminResponseMs(datos);
    const totalLecturas = datos.reduce((suma, item) => suma + item.__lecturas, 0);
    // Lineal: unas pocas lecturas por mensaje. Cuadrático: del orden de n²/4,
    // que con 4 000 mensajes serían millones.
    assert.ok(
      totalLecturas <= n * 3,
      `con ${n} mensajes hubo ${totalLecturas} lecturas: el coste no es lineal`
    );
  }
});
