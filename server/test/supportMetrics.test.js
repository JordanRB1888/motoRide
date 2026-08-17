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

test('el coste es lineal, no cuadrático dentro del hilo', () => {
  // La versión anterior rebuscaba hacia atrás por cada respuesta. Con un hilo
  // muy largo eso se dispara; aquí debe crecer de forma proporcional.
  const construir = n => Array.from({ length: n }, (_, i) =>
    mensaje(`m_${i}`, 'u1', i % 2 === 0 ? 'passenger' : 'admin', i * 1000));

  const medir = n => {
    const datos = construir(n);
    const inicio = process.hrtime.bigint();
    averageAdminResponseMs(datos);
    return Number(process.hrtime.bigint() - inicio) / 1e6;
  };

  medir(2000);                       // calentamiento
  const pequeno = Math.max(medir(4000), 0.5);
  const grande = medir(16000);       // cuatro veces más datos
  // Lineal daría ~4x; cuadrático daría ~16x. Se deja margen amplio para el
  // ruido de medición pero se distingue con claridad entre ambos.
  assert.ok(grande / pequeno < 9, `crecimiento sospechoso: ${(grande / pequeno).toFixed(1)}x`);
});
