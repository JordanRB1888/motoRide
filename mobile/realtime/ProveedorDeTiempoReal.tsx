/**
 * Quién decide cuándo hay socket.
 *
 * EL CICLO DE VIDA, ATADO A LA SESIÓN
 *
 *   sin sesión        → desconectado
 *   AUTENTICADO       → conecta
 *   cierre de sesión  → quita escuchas, desconecta y limpia
 *   fallo de red      → socket.io reintenta; la sesión NO se toca
 *
 * Va en el layout raíz, dentro del proveedor de sesión: es lo que garantiza que
 * haya UNA conexión para toda la aplicación. Montarlo en cada pantalla abriría
 * una por pantalla.
 *
 * EL RECORRIDO DE DISEÑO NO CONECTA
 *
 * `/diseno` y `/preview` son maquetas: no llaman a ninguna API y no deben abrir
 * un socket contra ningún servidor. Se comprueba por la RUTA y no sólo por si
 * hay sesión, porque alguien con sesión abierta puede entrar ahí a mirar el
 * diseño y no tiene por qué arrastrar una conexión.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSegments } from 'expo-router';

import { useSesion } from '../context/AuthContext';
import {
  conectar,
  desconectar,
  escuchar,
  estadoDeConexion,
  observarConexion,
  observarResync,
  type EstadoDeConexion
} from './socket';
import type { EventoDelServidor } from './eventos';

/** Las zonas que NUNCA abren socket. */
const ZONAS_SIN_TIEMPO_REAL = ['diseno', 'preview'];

export interface ValorDeTiempoReal {
  readonly estado: EstadoDeConexion;
  /**
   * Escucha un evento mientras el componente esté montado.
   *
   * Devuelve la función de limpieza, para usarla dentro de un `useEffect`. Sin
   * ella, cada montaje añadiría un escucha más y el mismo evento se procesaría
   * dos, tres, diez veces.
   */
  readonly escuchar: (evento: EventoDelServidor, escucha: (payload: unknown) => void) => () => void;
  /**
   * Se llama cuando el socket vuelve tras una caída.
   *
   * Es la señal de «vuelve a preguntar por HTTP»: mientras no había red, el
   * servidor siguió emitiendo y nadie lo oyó.
   */
  readonly alReconectar: (accion: () => void) => () => void;
}

const Contexto = createContext<ValorDeTiempoReal | null>(null);

export function ProveedorDeTiempoReal({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const segmentos = useSegments();
  const [estado, setEstado] = useState<EstadoDeConexion>(estadoDeConexion);

  const enLaMaqueta = ZONAS_SIN_TIEMPO_REAL.includes(String(segmentos[0] ?? ''));
  const debeConectar = sesion.estado === 'AUTENTICADO' && !enLaMaqueta;

  // Para no pedir dos conexiones seguidas mientras la primera está a medias.
  const pidiendo = useRef(false);

  useEffect(() => observarConexion(setEstado), []);

  useEffect(() => {
    if (!debeConectar) {
      // Cubre las dos salidas: cerrar sesión y entrar en la maqueta.
      desconectar();
      return;
    }
    if (pidiendo.current) return;
    pidiendo.current = true;
    void conectar().finally(() => { pidiendo.current = false; });
  }, [debeConectar]);

  // Al desmontarse la aplicación entera, no queda ninguna conexión huérfana.
  useEffect(() => () => { desconectar(); }, []);

  const suscribir = useCallback(
    (evento: EventoDelServidor, escucha: (payload: unknown) => void) => escuchar(evento, escucha),
    []
  );
  const alReconectar = useCallback((accion: () => void) => observarResync(accion), []);

  return (
    <Contexto.Provider value={{ estado, escuchar: suscribir, alReconectar }}>
      {children}
    </Contexto.Provider>
  );
}

/**
 * El tiempo real, para quien lo necesite.
 *
 * Sin proveedor devuelve algo inerte en vez de fallar: el laboratorio monta
 * pantallas sueltas y no puede reventar porque una de ellas quiera escuchar un
 * evento.
 */
export function useTiempoReal(): ValorDeTiempoReal {
  return useContext(Contexto) ?? {
    estado: 'apagado',
    escuchar: () => () => undefined,
    alReconectar: () => () => undefined
  };
}

/**
 * Escucha un evento del servidor mientras el componente viva.
 *
 * La limpieza va incluida: es el punto entero de que esto exista en vez de que
 * cada pantalla llame a `escuchar` y se acuerde de deshacerlo.
 */
export function useEvento(
  evento: EventoDelServidor,
  escucha: (payload: unknown) => void
): void {
  const { escuchar: suscribir, estado } = useTiempoReal();

  // La función cambia en cada render; guardarla en una referencia evita
  // resuscribirse sesenta veces por segundo.
  const vigente = useRef(escucha);
  useEffect(() => { vigente.current = escucha; }, [escucha]);

  useEffect(
    () => suscribir(evento, payload => vigente.current(payload)),
    // `estado` entra a propósito: los escuchas se registran sobre el socket
    // vivo, así que al reconectar hay que volver a ponerlos.
    [evento, suscribir, estado]
  );
}

/** Vuelve a preguntar por HTTP cada vez que el socket se recupera. */
export function useResync(accion: () => void): void {
  const { alReconectar } = useTiempoReal();

  const vigente = useRef(accion);
  useEffect(() => { vigente.current = accion; }, [accion]);

  useEffect(() => alReconectar(() => vigente.current()), [alReconectar]);
}
