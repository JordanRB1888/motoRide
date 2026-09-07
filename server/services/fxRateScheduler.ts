/**
 * Actualización diaria de la tasa oficial.
 *
 * APAGADO POR DEFECTO, Y ESO ES INTENCIONAL
 *
 * Importar este módulo no arranca nada, y a día de hoy NADIE lo llama:
 * `server/index.js` no lo importa y no se ha tocado en esta fase. La maquinaria
 * queda lista y la decisión de encenderla es del dueño, igual que con Driver
 * Finance.
 *
 * Cuando llegue ese momento, el arranque debe quedar detrás de una variable de
 * entorno explícita (`FX_SCHEDULER_ENABLED`), para que encender la tarea sea un
 * acto deliberado y reversible y no un efecto secundario de desplegar.
 *
 * POR QUÉ NO SE USA UNA LIBRERÍA DE CRON
 *
 * Una dependencia más en el backend para programar UNA tarea al día no se paga
 * sola, y la parte difícil no es el temporizador sino el huso horario — que hay
 * que resolver igualmente. Se resuelve aquí, con `Intl`, sin fijar un desfase a
 * mano: Venezuela está hoy en UTC-4 y no aplica horario de verano, pero
 * escribir «-4» en el código es exactamente el tipo de suposición que se rompe
 * en silencio años después.
 */

export const ZONA_DE_CARACAS = 'America/Caracas';

/**
 * A qué hora de Caracas se consulta.
 *
 * El BCV publica por la tarde la tasa que regirá el día hábil siguiente, así
 * que se pregunta cuando ya está publicada. Preguntar de madrugada traería
 * siempre la del día anterior.
 */
export const HORA_DE_CONSULTA = 17;
export const MINUTO_DE_CONSULTA = 30;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

interface PartesLocales {
  readonly anio: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  readonly segundo: number;
}

/** Descompone un instante en la hora de pared de una zona. */
function partesEnZona(instante: Date, zona: string): PartesLocales {
  const formateador = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `h23` y no `hour12: false`: algunas implementaciones devuelven «24» para
    // la medianoche con la segunda opción, y eso desplazaría el cálculo un día.
    hourCycle: 'h23'
  });
  const partes: Record<string, string> = {};
  for (const parte of formateador.formatToParts(instante)) partes[parte.type] = parte.value;
  const leer = (clave: string): number => Number(partes[clave] ?? '0');
  return {
    anio: leer('year'),
    mes: leer('month'),
    dia: leer('day'),
    hora: leer('hour'),
    minuto: leer('minute'),
    segundo: leer('second')
  };
}

/** Desfase de la zona respecto de UTC, en minutos, en ese instante concreto. */
function desfaseEnMinutos(instante: Date, zona: string): number {
  const p = partesEnZona(instante, zona);
  const comoSiFueraUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return (comoSiFueraUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000;
}

/**
 * El instante UTC en que una hora de pared concreta ocurre en una zona.
 *
 * Se calcula en dos pasadas porque el desfase depende del propio instante que
 * se está buscando. Con un huso fijo como el de Caracas la segunda pasada nunca
 * cambia nada; existe para que el cálculo siga siendo correcto si algún día
 * Venezuela vuelve a mover el reloj.
 */
export function instanteDeHoraLocal(
  anio: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  zona: string = ZONA_DE_CARACAS
): Date {
  const supuesto = Date.UTC(anio, mes - 1, dia, hora, minuto, 0);
  const primero = desfaseEnMinutos(new Date(supuesto), zona);
  let resultado = supuesto - primero * 60_000;
  const segundo = desfaseEnMinutos(new Date(resultado), zona);
  if (segundo !== primero) resultado = supuesto - segundo * 60_000;
  return new Date(resultado);
}

/**
 * La próxima vez que toca consultar, a partir de un instante dado.
 *
 * Si la hora de hoy ya pasó, es la de mañana. La comparación es estricta
 * (`<=`), así que ejecutar justo en el segundo exacto no vuelve a programar el
 * mismo instante y entrar en un bucle.
 */
export function proximaConsulta(
  desde: Date,
  hora: number = HORA_DE_CONSULTA,
  minuto: number = MINUTO_DE_CONSULTA,
  zona: string = ZONA_DE_CARACAS
): Date {
  const local = partesEnZona(desde, zona);
  const hoy = instanteDeHoraLocal(local.anio, local.mes, local.dia, hora, minuto, zona);
  if (hoy.getTime() > desde.getTime()) return hoy;

  const manana = partesEnZona(new Date(desde.getTime() + UN_DIA_MS), zona);
  return instanteDeHoraLocal(manana.anio, manana.mes, manana.dia, hora, minuto, zona);
}

/**
 * Lo mínimo que el planificador necesita saber del resultado.
 *
 * Deliberadamente pequeño: el planificador no debe conocer al proveedor ni al
 * almacén, sólo si la cosa salió bien para poder registrarlo. Quien ejecuta la
 * tarea ya escribe su propio detalle.
 */
export interface ResultadoDeTarea {
  readonly ok: boolean;
  readonly motivo?: string;
}

/** Qué hacer cuando toca. */
export type TareaDeActualizacion = () => Promise<ResultadoDeTarea>;

export interface OpcionesDelPlanificador {
  readonly tarea: TareaDeActualizacion;
  readonly ahora?: () => Date;
  readonly hora?: number;
  readonly minuto?: number;
  readonly zona?: string;
  readonly registrar?: (mensaje: string) => void;
  /** Sustituible en pruebas para no esperar horas de verdad. */
  readonly programar?: (accion: () => void, ms: number) => { cancelar: () => void };
}

export interface Planificador {
  iniciar(): void;
  detener(): void;
  /** Cuándo está previsto el próximo intento, o `null` si está parado. */
  proximaEjecucion(): Date | null;
  /** Fuerza una ejecución ya, sin tocar la programación. Para el arranque y el panel. */
  ejecutarAhora(): Promise<ResultadoDeTarea>;
}

const temporizadorReal = (accion: () => void, ms: number) => {
  const identificador = setTimeout(accion, ms);
  // `unref` para que una tarea pendiente no impida que el proceso termine.
  if (typeof identificador.unref === 'function') identificador.unref();
  return { cancelar: () => { clearTimeout(identificador); } };
};

export function crearPlanificador(opciones: OpcionesDelPlanificador): Planificador {
  const ahora = opciones.ahora ?? (() => new Date());
  const hora = opciones.hora ?? HORA_DE_CONSULTA;
  const minuto = opciones.minuto ?? MINUTO_DE_CONSULTA;
  const zona = opciones.zona ?? ZONA_DE_CARACAS;
  const registrar = opciones.registrar ?? (() => {});
  const programar = opciones.programar ?? temporizadorReal;

  let pendiente: { cancelar: () => void } | null = null;
  let previsto: Date | null = null;

  async function ejecutar(): Promise<ResultadoDeTarea> {
    try {
      return await opciones.tarea();
    } catch (error) {
      // La tarea no debería lanzar, pero si lo hace, el planificador tiene que
      // sobrevivir: si esta excepción escapara, la reprogramación no ocurriría
      // y la tasa dejaría de actualizarse hasta el siguiente reinicio.
      //
      // Sólo el mensaje. Ni HTML, ni cabeceras, ni URL con parámetros: esto
      // acaba en los registros del servidor.
      const detalle = error instanceof Error ? error.message : 'desconocido';
      registrar(`FX_BCV_ERROR detalle=${detalle}`);
      return { ok: false, motivo: 'EXCEPCION' };
    }
  }

  function programarSiguiente(): void {
    previsto = proximaConsulta(ahora(), hora, minuto, zona);
    const espera = Math.max(0, previsto.getTime() - ahora().getTime());
    pendiente = programar(() => {
      // Se reprograma pase lo que pase con esta ejecución: un fallo del BCV no
      // puede dejar la tarea muerta hasta el siguiente reinicio del servidor.
      void ejecutar().finally(() => { programarSiguiente(); });
    }, espera);
  }

  return {
    iniciar() {
      if (pendiente) return;
      programarSiguiente();
      registrar(`FX_BCV_PLANIFICADO proxima=${previsto?.toISOString() ?? 'ninguna'}`);
    },
    detener() {
      pendiente?.cancelar();
      pendiente = null;
      previsto = null;
    },
    proximaEjecucion() {
      return previsto;
    },
    ejecutarAhora: ejecutar
  };
}
