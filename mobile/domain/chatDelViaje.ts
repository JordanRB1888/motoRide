/**
 * La conversación del viaje, decidida sin pantalla.
 *
 * QUÉ DECIDE ESTE FICHERO
 *
 * Tres cosas, y ninguna necesita React para comprobarse:
 *
 * - Cómo se juntan los mensajes que llegan por dos caminos —el historial por
 *   HTTP y los que van cayendo por el socket— sin que ninguno aparezca dos
 *   veces y en un orden que no dependa de por dónde llegaron.
 * - Cuándo se puede escribir. Lo decide el estado del viaje, y la regla es la
 *   misma que la del servidor: mientras la carrera está viva.
 * - Qué es un mensaje válido antes de mandarlo, para no molestar al servidor
 *   con vacíos ni pasarse de su tope.
 *
 * LO QUE NO SE INVENTA
 *
 * Ni «entregado» ni «leído»: el backend no los guarda, y pintarlos sería
 * atrezo. Lo único que se sabe de un mensaje propio es si el servidor ya lo
 * devolvió —y entonces es durable— o si todavía no.
 */

import type { MensajeReal } from './viajes';

// ---------------------------------------------------------------------------
// Lo que se puede escribir
// ---------------------------------------------------------------------------

/** El tope del servidor. Se recorta allí; aquí se avisa antes. */
export const LARGO_MAXIMO = 1000;

/**
 * Cuándo se puede escribir en la conversación.
 *
 * LA MISMA REGLA QUE EL SERVIDOR, que es quien manda. Allí `isContactableTrip`
 * decide cuándo viaja el teléfono del conductor y cuándo se acepta un mensaje:
 * sólo con la carrera viva. Un viaje terminado conserva su historial —se lee
 * igual— pero ya no es una conversación, es un registro.
 */
export function sePuedeEscribir(estadoDelViaje: string | null | undefined): boolean {
  return estadoDelViaje === 'DRIVER_ASSIGNED'
    || estadoDelViaje === 'ARRIVED'
    || estadoDelViaje === 'IN_PROGRESS';
}

/** El texto tal y como saldría, o `null` si no hay nada que mandar. */
export function textoParaEnviar(crudo: string): string | null {
  const limpio = crudo.trim();
  if (limpio === '') return null;
  return limpio.slice(0, LARGO_MAXIMO);
}

// ---------------------------------------------------------------------------
// Los mensajes en pantalla
// ---------------------------------------------------------------------------

/**
 * Un mensaje tal y como se pinta.
 *
 * `pendiente` es un mensaje propio que salió y el servidor todavía no ha
 * devuelto. No es «enviado»: eso sólo lo dice el servidor cuando lo devuelve
 * por el socket, y entonces deja de ser pendiente y pasa a ser uno más.
 */
export interface MensajeEnPantalla {
  readonly id: string;
  readonly mio: boolean;
  readonly autor: string;
  readonly texto: string;
  /** ISO-8601. Lo que ordena. */
  readonly cuando: string;
  readonly pendiente: boolean;
  /** La clave del intento, sólo en los propios. Es lo que casa pendiente con durable. */
  readonly claveDeIntento: string | null;
}

/** De lo que da el servidor a lo que se pinta. */
export function enPantalla(mensaje: MensajeReal & { readonly clientId?: string }, miId: string): MensajeEnPantalla {
  return {
    id: mensaje.id,
    mio: mensaje.autorId === miId,
    autor: mensaje.autorNombre,
    texto: mensaje.texto,
    cuando: mensaje.cuando,
    pendiente: false,
    claveDeIntento: typeof mensaje.clientId === 'string' && mensaje.clientId !== '' ? mensaje.clientId : null
  };
}

/** Lo que se pinta nada más pulsar enviar, antes de que el servidor conteste. */
export function pendienteDe(texto: string, claveDeIntento: string, miNombre: string, ahora: number): MensajeEnPantalla {
  return {
    id: `pendiente_${claveDeIntento}`,
    mio: true,
    autor: miNombre,
    texto,
    cuando: new Date(ahora).toISOString(),
    pendiente: true,
    claveDeIntento
  };
}

function ordenar(mensajes: readonly MensajeEnPantalla[]): MensajeEnPantalla[] {
  // Por marca de tiempo, con el id de desempate. El mismo criterio que el
  // servidor, para que la lista no baile según por dónde llegó cada uno.
  return [...mensajes].sort((a, b) =>
    (a.cuando < b.cuando ? -1 : a.cuando > b.cuando ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Mete un mensaje durable en la lista, UNA sola vez.
 *
 * ESTA ES LA GUARDA CONTRA LOS DUPLICADOS, y cubre los tres caminos por los que
 * un mismo mensaje puede llegar dos veces:
 *
 * - por su `id`: el historial lo trajo y luego el socket lo repite, o el socket
 *   lo entrega dos veces tras una reconexión;
 * - por su clave de intento: es el acuse de un pendiente propio, y lo sustituye
 *   en vez de sumarse a él;
 * - por reintento del servidor: un `clientId` repetido vuelve con el MISMO id,
 *   y cae en el primer caso.
 */
export function conMensaje(lista: readonly MensajeEnPantalla[], nuevo: MensajeEnPantalla): readonly MensajeEnPantalla[] {
  if (lista.some(m => m.id === nuevo.id)) return lista;
  const sinElPendiente = nuevo.claveDeIntento === null
    ? lista
    : lista.filter(m => !(m.pendiente && m.claveDeIntento === nuevo.claveDeIntento));
  return ordenar([...sinElPendiente, nuevo]);
}

/**
 * Junta el historial con lo que ya había en pantalla.
 *
 * Los durables del historial mandan. Los pendientes se conservan —salieron y
 * aún no han vuelto— salvo que el historial ya traiga su acuse, y entonces
 * sobran. Así una reconexión no borra lo que se estaba mandando ni lo duplica.
 */
export function conHistorial(
  enPantallaAhora: readonly MensajeEnPantalla[],
  historial: readonly MensajeEnPantalla[]
): readonly MensajeEnPantalla[] {
  const clavesDurables = new Set(historial.map(m => m.claveDeIntento).filter((c): c is string => c !== null));
  const idsDurables = new Set(historial.map(m => m.id));
  const pendientesVivos = enPantallaAhora.filter(m =>
    m.pendiente && !clavesDurables.has(m.claveDeIntento ?? '') && !idsDurables.has(m.id));
  return ordenar([...historial, ...pendientesVivos]);
}

/** Un pendiente que el servidor rechazó deja de esperar. Se quita, no se marca. */
export function sinPendiente(lista: readonly MensajeEnPantalla[], claveDeIntento: string): readonly MensajeEnPantalla[] {
  return lista.filter(m => !(m.pendiente && m.claveDeIntento === claveDeIntento));
}

// ---------------------------------------------------------------------------
// El estado de la pantalla
// ---------------------------------------------------------------------------

/**
 * Lo que la pantalla enseña, y son cinco cosas distintas.
 *
 * VACÍO no es ERROR: no haber hablado todavía es lo normal al abrir. Y SIN
 * CONEXIÓN no es un fallo del servidor: es «ahora no», que se arregla solo y
 * mientras tanto se sigue leyendo lo que ya había.
 */
export type EstadoDeLaPantalla = 'CARGANDO' | 'CONTENIDO' | 'VACIO' | 'ERROR' | 'SIN_CONEXION';

export function estadoDeLaPantalla({ cargando, fallo, hayConexion, mensajes }: {
  readonly cargando: boolean;
  readonly fallo: boolean;
  readonly hayConexion: boolean;
  readonly mensajes: readonly MensajeEnPantalla[];
}): EstadoDeLaPantalla {
  // Con contenido válido, la red y los fallos de recarga se cuentan aparte
  // —como aviso— y no se tira la conversación: leerla no necesita conexión.
  if (mensajes.length > 0) return 'CONTENIDO';
  if (cargando) return 'CARGANDO';
  if (!hayConexion) return 'SIN_CONEXION';
  if (fallo) return 'ERROR';
  return 'VACIO';
}

/** Lo que se dice cuando el servidor no acepta un mensaje. En su idioma. */
const MOTIVOS: Readonly<Record<string, string>> = Object.freeze({
  FORBIDDEN: 'Esta conversación no es tuya.',
  CHAT_CLOSED: 'El viaje terminó. Ya no se puede escribir aquí.',
  EMPTY_MESSAGE: 'Escribe algo antes de enviar.',
  CHAT_MESSAGE_FAILED: 'No se pudo enviar. Inténtalo otra vez.'
});

export function motivoDelFallo(codigo: unknown): string {
  return typeof codigo === 'string' && MOTIVOS[codigo] !== undefined
    ? MOTIVOS[codigo]
    : 'No se pudo enviar el mensaje.';
}
