/**
 * El transporte en tiempo real.
 *
 * UNA CONEXIÓN, Y VIVE FUERA DE REACT
 *
 * El socket es un recurso del proceso, no de un componente. Si viviera dentro
 * de una pantalla, cada montaje abriría uno nuevo y cada desmontaje lo cerraría
 * — y navegar entre pestañas se convertiría en abrir y cerrar conexiones. Aquí
 * hay una sola instancia, y el proveedor de React sólo le dice cuándo conectar.
 *
 * LA IDENTIDAD LA DECIDE EL SERVIDOR
 *
 * Lo único que se manda es el token, en `auth.token` del apretón de manos, que
 * es exactamente donde el servidor lo busca (`socket.handshake.auth?.token`).
 * Él verifica la firma, busca al usuario y decide `{ userId, role }`.
 *
 * Aquí NO se manda `userId`, ni `role`, ni `driverId`. Mandarlos daría a
 * entender que sirven para algo, y el día que alguien los leyera del payload en
 * vez de la sesión, la autorización se podría falsificar desmontando la
 * aplicación.
 *
 * SIN SERVIDOR CONFIGURADO NO SE CONECTA
 *
 * La dirección sale de la MISMA configuración que la API. No hay respaldo a
 * localhost ni a producción: un teléfono de desarrollo que se conecte solo a
 * producción es una fuga de datos esperando a ocurrir.
 */

import { io, type Socket } from 'socket.io-client';

import { configuracion } from '../config/environment';
import { leerToken } from '../services/session';
import { esObjeto, type EventoDelServidor } from './eventos';

/** `true` sólo cuando Metro sirve la aplicación. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Registro de desarrollo.
 *
 * NUNCA el token, ni las cabeceras, ni el contenido de un evento. Sólo el
 * hecho: conectado, desconectado, reintentando. Un registro con el JWT dentro
 * acaba en un informe de fallos, y de ahí en cualquier parte.
 */
function anotar(mensaje: string): void {
  if (EN_DESARROLLO) console.log(`[+58express tiempo real] ${mensaje}`);
}

export type EstadoDeConexion = 'apagado' | 'conectando' | 'conectado' | 'reintentando';

type Escucha = (payload: unknown) => void;

let socket: Socket | null = null;
let estado: EstadoDeConexion = 'apagado';

const observadores = new Set<(estado: EstadoDeConexion) => void>();
/** Quien quiere enterarse de una reconexión, para volver a preguntar por HTTP. */
const observadoresDeResync = new Set<() => void>();

function cambiarEstado(siguiente: EstadoDeConexion): void {
  if (estado === siguiente) return;
  estado = siguiente;
  for (const observador of observadores) observador(siguiente);
}

export function estadoDeConexion(): EstadoDeConexion {
  return estado;
}

/** Avisa de los cambios de estado. Devuelve cómo dejar de escuchar. */
export function observarConexion(observador: (estado: EstadoDeConexion) => void): () => void {
  observadores.add(observador);
  return () => { observadores.delete(observador); };
}

/**
 * Avisa cuando hace falta volver a preguntar por HTTP.
 *
 * Se dispara al RECONECTAR, no al conectar por primera vez: mientras el
 * teléfono estuvo sin red, el servidor siguió mandando eventos que nadie oyó, y
 * el socket no los guarda. Un socket reconectado NO es una fuente histórica.
 */
export function observarResync(observador: () => void): () => void {
  observadoresDeResync.add(observador);
  return () => { observadoresDeResync.delete(observador); };
}

/**
 * Conecta, si hay sesión y configuración.
 *
 * Llamarla dos veces no abre dos conexiones: si ya hay socket, no hace nada.
 * Esa es la garantía de «una sesión, un socket», y no depende de que quien
 * llame se acuerde.
 */
export async function conectar(): Promise<void> {
  if (socket !== null) return;

  if (!configuracion.ok) {
    // Fallo cerrado. Sin dirección configurada no se adivina ninguna: ni
    // localhost, ni la de producción.
    anotar('sin configuración: no se conecta');
    return;
  }

  const token = await leerToken();
  if (!token) {
    anotar('sin sesión: no se conecta');
    return;
  }

  // Entre la comprobación de arriba y esta línea puede haber entrado otra
  // llamada —`leerToken` es asíncrono—. Si ya hay socket, gana el primero.
  if (socket !== null) return;

  cambiarEstado('conectando');
  const cliente = io(configuracion.urlBase, {
    // El token va en el apretón de manos, que es donde el servidor lo lee.
    auth: { token },
    // WebSocket directo: el sondeo largo abre y cierra peticiones HTTP sin
    // parar, y en una red móvil venezolana eso se nota en la batería y en los
    // datos. Si falla, socket.io reintenta igual.
    transports: ['websocket'],
    // La reconexión la lleva socket.io, que está probada. Un bucle propio
    // acabaría siendo más agresivo y peor: reintentos sin tope contra un
    // servidor caído son una forma de tumbarlo entre todos los teléfonos.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    // Sin esto, socket.io reutiliza el token del primer intento aunque la
    // sesión haya cambiado.
    autoConnect: true
  });

  cliente.on('connect', () => {
    cambiarEstado('conectado');
    anotar('conectado');
  });

  cliente.on('disconnect', razon => {
    // Una desconexión NO cierra la sesión. Puede ser el metro, el ascensor o
    // el servidor reiniciándose.
    cambiarEstado('reintentando');
    anotar(`desconectado (${String(razon)})`);
  });

  cliente.io.on('reconnect', () => {
    anotar('reconectado: pidiendo estado por HTTP');
    // Aquí está la pieza que hace correcta toda la arquitectura: al volver, no
    // se confía en lo que llegó por el socket. Se vuelve a preguntar.
    for (const observador of observadoresDeResync) observador();
  });

  cliente.io.on('reconnect_attempt', () => { cambiarEstado('reintentando'); });

  cliente.on('connect_error', error => {
    // El mensaje del servidor es un código —AUTH_REQUIRED, INVALID_SESSION,
    // DRIVER_NOT_APPROVED— y nunca lleva nada sensible, así que se puede
    // anotar. El token no aparece por ninguna parte.
    cambiarEstado('reintentando');
    anotar(`no se pudo conectar: ${error.message}`);
  });

  socket = cliente;
}

/**
 * Corta y limpia.
 *
 * Quita TODOS los escuchas antes de desconectar: un socket desconectado con
 * escuchas vivos vuelve a dispararlos al reconectar, y si la sesión cambió por
 * medio, los dispara con los datos de la anterior.
 */
export function desconectar(): void {
  if (socket === null) {
    cambiarEstado('apagado');
    return;
  }
  socket.removeAllListeners();
  socket.io.removeAllListeners();
  socket.disconnect();
  socket = null;
  cambiarEstado('apagado');
  anotar('desconectado y limpio');
}

/**
 * Escucha un evento del servidor. Devuelve cómo dejar de escucharlo.
 *
 * El payload llega sin comprobar a propósito: cada consumidor sabe qué forma
 * necesita. Lo que sí se garantiza es que un payload malformado no llegue como
 * `null` ni tumbe nada — se normaliza a objeto vacío.
 */
export function escuchar(evento: EventoDelServidor, escucha: Escucha): () => void {
  const envoltorio: Escucha = payload => {
    try {
      escucha(esObjeto(payload) ? payload : {});
    } catch (error) {
      // Un consumidor que falla no puede llevarse por delante el transporte.
      anotar(`fallo al procesar ${evento}: ${error instanceof Error ? error.message : 'desconocido'}`);
    }
  };

  socket?.on(evento, envoltorio);
  return () => { socket?.off(evento, envoltorio); };
}

/**
 * Mandar la posición del conductor.
 *
 * POR QUÉ NO HAY UN `emitir(evento, payload)` GENÉRICO
 *
 * Porque entonces cualquier componente podría mandar cualquier cosa, y la
 * lista de lo que este cliente es capaz de emitir dejaría de poder leerse en
 * ningún sitio. Con funciones concretas, lo que sale por el socket son estas
 * dos cosas y se puede comprobar de un vistazo — y con una prueba.
 *
 * LA IDENTIDAD NO VA EN EL PAYLOAD
 *
 * Ni `driverId`, ni `userId`, ni el rol. El servidor los saca de la sesión
 * firmada (`socket.data.auth.userId`) y **ignora** lo que venga en el mensaje.
 * Mandarlos sugeriría que sirven para algo, y el día que alguien se fiara de
 * ellos tendría un agujero de suplantación.
 *
 * EL RUMBO SÓLO SI SE SABE
 *
 * El servidor rellena `heading: 0` cuando no llega, así que mandar un cero
 * inventado es indistinguible de decir «mira al norte». Si no se sabe, no se
 * manda el campo.
 */
export function enviarUbicacionDeConductor(
  posicion: { lat: number; lng: number; rumbo?: number | null }
): boolean {
  if (socket === null || !socket.connected) return false;
  socket.emit('driver:location', {
    latitude: posicion.lat,
    longitude: posicion.lng,
    ...(typeof posicion.rumbo === 'number' && Number.isFinite(posicion.rumbo)
      ? { heading: posicion.rumbo }
      : {})
  });
  return true;
}

/**
 * Mandar la posición de la pasajera.
 *
 * El servidor sólo la acepta si esa pasajera tiene un viaje en curso, y con
 * ella actualiza el punto de recogida del viaje. Por eso `viajeId` viaja en el
 * mensaje: no como autoridad —el servidor busca el viaje por la sesión— sino
 * porque el contrato ya probado en la web lo incluye.
 */
export function enviarUbicacionDePasajera(
  posicion: { lat: number; lng: number; rumbo?: number | null },
  viajeId: string | null
): boolean {
  if (socket === null || !socket.connected) return false;
  socket.emit('passenger:location_update', {
    ...(viajeId === null ? {} : { tripId: viajeId }),
    latitude: posicion.lat,
    longitude: posicion.lng,
    ...(typeof posicion.rumbo === 'number' && Number.isFinite(posicion.rumbo)
      ? { heading: posicion.rumbo }
      : {})
  });
  return true;
}

/** Sólo para las pruebas: si hay socket abierto ahora mismo. */
export function hayConexion(): boolean {
  return socket !== null;
}
