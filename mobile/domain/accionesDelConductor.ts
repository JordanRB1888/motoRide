/**
 * Lo que el conductor puede hacer con la carrera que ya es suya.
 *
 * QUÉ DECIDE ESTE FICHERO
 *
 * Una sola cosa: qué botón toca ahora. El estado del viaje lo manda el
 * servidor, y de cada estado sale exactamente una acción posible —o ninguna—.
 * La pantalla no elige nada: pregunta y pinta.
 *
 * POR QUÉ NO VIVE EN LA PANTALLA
 *
 * Porque entonces habría que abrir la aplicación para saber si «FINALIZAR»
 * aparece en `ARRIVED`, y la respuesta a esa pregunta es una regla de negocio,
 * no un detalle visual. Aquí se comprueba en milisegundos y sin emulador.
 *
 * EL SERVIDOR SIGUE MANDANDO
 *
 * Nada de esto autoriza. Que el botón esté escondido no impide que alguien
 * emita el evento a mano, y por eso el servidor vuelve a comprobar el estado y
 * el conductor asignado. Esto sólo evita ofrecer lo imposible.
 */

/** Los estados a los que el conductor puede llevar una carrera. */
export type EstadoQuePide = 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';

/** El botón que toca en un momento dado. */
export interface AccionDelConductor {
  /** A qué estado se le pide al servidor que pase. */
  readonly estadoQuePide: EstadoQuePide;
  /** Lo que dice el botón. */
  readonly texto: string;
  /** Lo que se lee mientras se está mandando. */
  readonly textoEnviando: string;
  readonly testID: string;
}

/**
 * De estado del viaje a acción, y punto.
 *
 * `DRIVER_ASSIGNED` es «voy de camino», así que lo siguiente es avisar de que
 * llegué. `ARRIVED` es «estoy abajo esperando»: lo siguiente es arrancar.
 * `IN_PROGRESS` sólo puede terminar.
 *
 * Los demás —`SEARCHING`, `COMPLETED`, `CANCELLED`, o cualquiera que el
 * servidor añada mañana— no dan botón. Un estado desconocido NO se convierte
 * en una acción por si acaso: se queda sin botón, que es lo seguro.
 */
const ACCIONES: Readonly<Record<string, AccionDelConductor>> = Object.freeze({
  DRIVER_ASSIGNED: {
    estadoQuePide: 'ARRIVED',
    texto: 'Llegué',
    textoEnviando: 'Avisando…',
    testID: 'boton-llegue'
  },
  ARRIVED: {
    estadoQuePide: 'IN_PROGRESS',
    texto: 'Iniciar viaje',
    textoEnviando: 'Iniciando…',
    testID: 'boton-iniciar-viaje'
  },
  IN_PROGRESS: {
    estadoQuePide: 'COMPLETED',
    texto: 'Finalizar viaje',
    textoEnviando: 'Finalizando…',
    testID: 'boton-finalizar-viaje'
  }
});

/** El botón que toca para este estado, o `null` si no toca ninguno. */
export function accionParaElEstado(estado: string | null | undefined): AccionDelConductor | null {
  if (typeof estado !== 'string') return null;
  return ACCIONES[estado] ?? null;
}

/**
 * Qué está pasando, contado desde la moto.
 *
 * NO es el copy de la pasajera. Ella lee «Tu conductor llegó»; él ya sabe que
 * llegó —lo acaba de pulsar— y lo que necesita saber es qué se espera de él
 * ahora. Compartir los textos habría ahorrado seis líneas y dejado a una de las
 * dos personas leyendo algo escrito para la otra.
 */
const TITULAR: Readonly<Record<string, string>> = Object.freeze({
  DRIVER_ASSIGNED: 'Vas a recoger',
  ARRIVED: 'Esperando a la pasajera',
  IN_PROGRESS: 'Viaje en curso'
});

/** El titular de este estado, o `null` si este estado no es cosa suya. */
export function titularDelConductor(estado: string | null | undefined): string | null {
  if (typeof estado !== 'string') return null;
  return TITULAR[estado] ?? null;
}

/**
 * En qué punto está el envío.
 *
 * `OFFLINE` no es un error: es «ahora no se puede», que se cuenta distinto y se
 * arregla solo en cuanto vuelve la conexión.
 */
export type FaseDeLaAccion = 'IDLE' | 'SUBMITTING' | 'SUCCESS' | 'ERROR' | 'OFFLINE';

/**
 * Si el botón acepta el toque.
 *
 * ESTA ES LA GUARDA DEL DOBLE TOQUE. Mientras hay un envío en vuelo el botón no
 * vuelve a disparar, y por eso `SUBMITTING` dice que no. El servidor tampoco se
 * dejaría —repetir una transición ya no anota nada—, pero dejar que el segundo
 * toque salga significaría dos peticiones por una intención, y con red mala eso
 * es la diferencia entre esperar y creer que no funcionó.
 *
 * `SUCCESS` también dice que no: la acción ya se hizo y el botón que toca ahora
 * lo decide el estado nuevo del servidor, no este.
 */
export function sePuedePulsar(fase: FaseDeLaAccion, hayConexion: boolean): boolean {
  if (!hayConexion) return false;
  return fase === 'IDLE' || fase === 'ERROR' || fase === 'OFFLINE';
}

/**
 * Lo que se le dice a quien está conduciendo cuando algo falla.
 *
 * En su idioma y sin códigos. Quien va en la moto no puede hacer nada con
 * `INVALID_TRIP_TRANSITION`, pero sí con «esta carrera ya cambió de estado».
 */
const MOTIVOS: Readonly<Record<string, string>> = Object.freeze({
  INVALID_TRIP_TRANSITION: 'Esta carrera ya cambió de estado. Actualiza y vuelve a mirar.',
  INVALID_TRIP_STATUS: 'No se pudo aplicar ese cambio.',
  FORBIDDEN: 'Esta carrera no es tuya.',
  DATABASE_WRITE_FAILED: 'No se pudo guardar. Inténtalo otra vez.',
  INSUFFICIENT_WALLET_BALANCE: 'La pasajera no tiene saldo suficiente para cerrar el viaje.'
});

/** El motivo en claro, con un texto de reserva para lo que no esté en la lista. */
export function motivoDelFallo(codigo: string | null | undefined): string {
  if (typeof codigo !== 'string' || codigo === '') return 'No se pudo completar la acción.';
  return MOTIVOS[codigo] ?? 'No se pudo completar la acción.';
}
