/**
 * Cuándo es de día y cuándo es de noche, según Venezuela.
 *
 * LA HORA DE VENEZUELA, NO LA DEL TELÉFONO
 *
 * Es la decisión que define este módulo. Si alguien está de viaje en Miami, su
 * teléfono marca otra hora, pero la aplicación es de Maracaibo: se pone oscura
 * cuando anochece en Maracaibo. Un conductor y una pasajera que hablan por el
 * chat ven lo mismo aunque uno esté fuera del país.
 *
 * POR QUÉ NO SE RESTAN CUATRO HORAS Y YA
 *
 * Venezuela está en UTC−4 y no cambia la hora desde 2016. Escribir «−4» a mano
 * funcionaría hoy y sería una bomba de relojería: el país ya movió su huso dos
 * veces este siglo —a −4:30 en 2007 y de vuelta a −4 en 2016—, y un número
 * suelto en el código no se entera. Aquí se pregunta al sistema por
 * `America/Caracas` y él sabe qué desfase toca.
 *
 * TODO ESTO ES PURO
 *
 * No importa nada de React Native, así que las pruebas pueden fijar la hora que
 * quieran y comprobar los bordes sin arrancar una aplicación.
 */

/** La zona que manda. No es configurable a propósito. */
export const ZONA_HORARIA = 'America/Caracas';

/** A las seis de la mañana empieza el día. */
export const HORA_EN_QUE_AMANECE = 6;

/** A las seis de la tarde empieza la noche. */
export const HORA_EN_QUE_ANOCHECE = 18;

/** Lo que la persona elige. `auto` es lo que trae de fábrica. */
export const APARIENCIAS = ['auto', 'claro', 'oscuro'] as const;
export type Apariencia = (typeof APARIENCIAS)[number];

/** Lo que acaba pintándose. `auto` ya se ha resuelto a una de las dos. */
export type Esquema = 'claro' | 'oscuro';

const SEGUNDOS_POR_DIA = 24 * 60 * 60;

/**
 * El formateador, creado una vez.
 *
 * Construir un `Intl.DateTimeFormat` es caro y esto se llama en cada cambio de
 * hora y cada vez que la aplicación vuelve a primer plano.
 */
let formateador: Intl.DateTimeFormat | null = null;

function obtenerFormateador(): Intl.DateTimeFormat {
  formateador ??= new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `h23` da 00–23. Sin esto, la medianoche puede salir como «24».
    hourCycle: 'h23'
  });
  return formateador;
}

/** Qué hora es en Caracas, en horas, minutos y segundos. */
export function horaEnCaracas(instante: Date): {
  readonly hora: number;
  readonly minuto: number;
  readonly segundo: number;
} {
  const partes = obtenerFormateador().formatToParts(instante);
  const leer = (tipo: string) => Number(partes.find(parte => parte.type === tipo)?.value ?? '0');
  return { hora: leer('hour'), minuto: leer('minute'), segundo: leer('second') };
}

/** Segundos transcurridos del día en Caracas. */
function segundosDelDiaEnCaracas(instante: Date): number {
  const { hora, minuto, segundo } = horaEnCaracas(instante);
  return hora * 3600 + minuto * 60 + segundo;
}

/**
 * Claro entre las 06:00:00 y las 17:59:59; oscuro el resto.
 *
 * Los dos extremos importan: a las 18:00:00 clavadas ya es de noche, y a las
 * 05:59:59 todavía lo es.
 */
export function esquemaAutomatico(instante: Date): Esquema {
  const hora = horaEnCaracas(instante).hora;
  return hora >= HORA_EN_QUE_AMANECE && hora < HORA_EN_QUE_ANOCHECE ? 'claro' : 'oscuro';
}

/** Lo que toca pintar, teniendo en cuenta lo que la persona haya elegido. */
export function esquemaEfectivo(apariencia: Apariencia, instante: Date): Esquema {
  if (apariencia === 'claro' || apariencia === 'oscuro') return apariencia;
  return esquemaAutomatico(instante);
}

/**
 * Cuándo toca volver a mirar.
 *
 * Devuelve el instante del próximo amanecer o anochecer en Caracas, expresado
 * en tiempo absoluto. Con esto se programa UN aviso en lugar de preguntar la
 * hora cada minuto: la aplicación pasa la tarde entera sin hacer nada y
 * despierta justo a las 18:00.
 *
 * El segundo de más evita el caso de borde en que el temporizador dispara una
 * fracción antes del cambio y la hora todavía es la vieja.
 */
export function proximoCambio(instante: Date): Date {
  const ahora = segundosDelDiaEnCaracas(instante);
  const amanece = HORA_EN_QUE_AMANECE * 3600;
  const anochece = HORA_EN_QUE_ANOCHECE * 3600;

  const faltan = ahora < amanece
    ? amanece - ahora
    : ahora < anochece
      ? anochece - ahora
      : SEGUNDOS_POR_DIA - ahora + amanece;

  return new Date(instante.getTime() + (faltan + 1) * 1000);
}

/**
 * `true` si el sistema sabe de zonas horarias.
 *
 * Hermes trae `Intl` en Android e iOS, pero no en todas las configuraciones. Si
 * faltara, `Intl` devolvería la hora local del teléfono sin avisar y el modo
 * automático se equivocaría en silencio para quien esté fuera del país — que es
 * justo el caso que este módulo existe para resolver.
 *
 * Con esto se puede detectar y decirlo en vez de fallar callado.
 */
export function elSistemaConoceLasZonasHorarias(): boolean {
  try {
    const referencia = new Date('2026-01-15T12:00:00Z');
    const formato = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA_HORARIA,
      hour: '2-digit',
      hourCycle: 'h23'
    });
    // Las 12:00 UTC son las 08:00 en Caracas. Si sale otra cosa, la zona no se
    // está aplicando.
    return formato.formatToParts(referencia).find(parte => parte.type === 'hour')?.value === '08';
  } catch {
    return false;
  }
}
