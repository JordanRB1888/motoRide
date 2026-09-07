/**
 * Los bordes del día y la noche, en hora de Venezuela.
 *
 * POR QUÉ LAS FECHAS VAN EN UTC
 *
 * Cada caso se escribe como un instante absoluto en Z y se comprueba qué
 * esquema toca. Así la prueba da igual dónde se ejecute: en la máquina del
 * dueño, en la mía o en un servidor con otra zona, `2026-08-31T10:00:00Z` son
 * siempre las 06:00 en Caracas.
 *
 * Escribirlas como horas locales habría hecho que la prueba pasara aquí y
 * fallara en cualquier otro sitio, que es la peor clase de prueba.
 *
 * Venezuela está en UTC−4, así que la hora de Caracas es la hora Z menos
 * cuatro.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APARIENCIAS,
  HORA_EN_QUE_AMANECE,
  HORA_EN_QUE_ANOCHECE,
  ZONA_HORARIA,
  elSistemaConoceLasZonasHorarias,
  esquemaAutomatico,
  esquemaEfectivo,
  horaEnCaracas,
  proximoCambio
} from '../theme/horaVenezuela.ts';

/**
 * Un instante dado como hora de Caracas, convertido a absoluto.
 *
 * `Date.UTC` y no una cadena ISO: sumar cuatro horas a las 22:00 da 26, que en
 * una cadena es una fecha invalida. `Date.UTC` normaliza el desbordamiento al
 * dia siguiente, que es justo lo que corresponde.
 */
function enCaracas(hora, minuto = 0, segundo = 0) {
  return new Date(Date.UTC(2026, 7, 31, hora + 4, minuto, segundo));
}

// ---------------------------------------------------------------------------
// La zona
// ---------------------------------------------------------------------------

test('la zona es America/Caracas y las horas son 06:00 y 18:00', () => {
  assert.equal(ZONA_HORARIA, 'America/Caracas');
  assert.equal(HORA_EN_QUE_AMANECE, 6);
  assert.equal(HORA_EN_QUE_ANOCHECE, 18);
});

test('el sistema sabe de zonas horarias', () => {
  // Si esto falla, `Intl` está devolviendo la hora local sin aplicar la zona, y
  // el modo automático se equivocaría en silencio para quien esté fuera del
  // país — justo el caso que el módulo existe para resolver.
  assert.equal(elSistemaConoceLasZonasHorarias(), true);
});

test('la hora se lee en Caracas, no en la del equipo', () => {
  // Las 12:00 UTC son las 08:00 en Caracas.
  assert.equal(horaEnCaracas(new Date('2026-08-31T12:00:00Z')).hora, 8);
  // Y las 02:00 UTC son las 22:00 del día ANTERIOR.
  assert.equal(horaEnCaracas(new Date('2026-08-31T02:00:00Z')).hora, 22);
});

// ---------------------------------------------------------------------------
// Los bordes
// ---------------------------------------------------------------------------

test('05:59 es de noche y 06:00 ya es de día', () => {
  assert.equal(esquemaAutomatico(enCaracas(5, 59, 59)), 'oscuro');
  assert.equal(esquemaAutomatico(enCaracas(6, 0, 0)), 'claro');
  assert.equal(esquemaAutomatico(enCaracas(6, 0, 1)), 'claro');
});

test('17:59 es de día y 18:00 ya es de noche', () => {
  assert.equal(esquemaAutomatico(enCaracas(17, 59, 59)), 'claro');
  assert.equal(esquemaAutomatico(enCaracas(18, 0, 0)), 'oscuro');
  assert.equal(esquemaAutomatico(enCaracas(18, 0, 1)), 'oscuro');
});

test('la madrugada entera es de noche', () => {
  assert.equal(esquemaAutomatico(enCaracas(23, 59, 59)), 'oscuro');
  assert.equal(esquemaAutomatico(enCaracas(0, 0, 0)), 'oscuro');
  assert.equal(esquemaAutomatico(enCaracas(3, 30)), 'oscuro');
});

test('el mediodía es de día', () => {
  assert.equal(esquemaAutomatico(enCaracas(10)), 'claro');
  assert.equal(esquemaAutomatico(enCaracas(12)), 'claro');
  assert.equal(esquemaAutomatico(enCaracas(15)), 'claro');
});

// ---------------------------------------------------------------------------
// Lo que elige la persona
// ---------------------------------------------------------------------------

test('elegir Día lo deja en día aunque sea de noche', () => {
  assert.equal(esquemaEfectivo('claro', enCaracas(23)), 'claro');
  assert.equal(esquemaEfectivo('claro', enCaracas(3)), 'claro');
});

test('elegir Noche lo deja en noche aunque sea de día', () => {
  assert.equal(esquemaEfectivo('oscuro', enCaracas(10)), 'oscuro');
  assert.equal(esquemaEfectivo('oscuro', enCaracas(14)), 'oscuro');
});

test('Automático vuelve a mandar la hora', () => {
  assert.equal(esquemaEfectivo('auto', enCaracas(10)), 'claro');
  assert.equal(esquemaEfectivo('auto', enCaracas(22)), 'oscuro');
});

test('sólo hay tres apariencias', () => {
  assert.deepEqual([...APARIENCIAS], ['auto', 'claro', 'oscuro']);
});

// ---------------------------------------------------------------------------
// Cuándo volver a mirar
// ---------------------------------------------------------------------------

test('el próximo cambio cae en el borde siguiente', () => {
  // De madrugada, el próximo cambio es el amanecer.
  const deMadrugada = proximoCambio(enCaracas(3, 0, 0));
  assert.equal(horaEnCaracas(deMadrugada).hora, 6);

  // Por la mañana, el anochecer.
  const porLaManana = proximoCambio(enCaracas(10, 0, 0));
  assert.equal(horaEnCaracas(porLaManana).hora, 18);

  // Por la noche, el amanecer del día siguiente.
  const porLaNoche = proximoCambio(enCaracas(22, 0, 0));
  assert.equal(horaEnCaracas(porLaNoche).hora, 6);
  assert.ok(porLaNoche.getTime() > enCaracas(22).getTime(), 'y es en el futuro');
});

test('al despertar en el borde, el esquema YA ha cambiado', () => {
  // Es el motivo del segundo de más: si el temporizador disparase una fracción
  // antes, la hora seguiría siendo la vieja y el tema no cambiaría.
  for (const [hora, esperado] of [[5, 'claro'], [17, 'oscuro']]) {
    const despertar = proximoCambio(enCaracas(hora, 59, 59));
    assert.equal(esquemaAutomatico(despertar), esperado,
      `al despertar desde las ${hora}:59:59 debería ser ${esperado}`);
  }
});

test('el próximo cambio nunca está a más de un día', () => {
  for (const hora of [0, 5, 6, 12, 17, 18, 23]) {
    const desde = enCaracas(hora, 30);
    const hasta = proximoCambio(desde);
    const horasDeEspera = (hasta.getTime() - desde.getTime()) / 3600000;
    assert.ok(horasDeEspera > 0, `desde las ${hora}:30 la espera es positiva`);
    assert.ok(horasDeEspera <= 24, `desde las ${hora}:30 la espera es de ${horasDeEspera} h`);
  }
});

// ---------------------------------------------------------------------------
// El día entero
// ---------------------------------------------------------------------------

test('recorriendo las 24 horas, el esquema cambia exactamente dos veces', () => {
  // Una comprobación de conjunto: si alguien tocara los límites, aquí saldrían
  // tres cambios o ninguno.
  let cambios = 0;
  let anterior = esquemaAutomatico(enCaracas(0));

  for (let hora = 1; hora < 24; hora += 1) {
    const actual = esquemaAutomatico(enCaracas(hora));
    if (actual !== anterior) cambios += 1;
    anterior = actual;
  }

  assert.equal(cambios, 2, 'amanece una vez y anochece otra');
});
