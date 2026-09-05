/**
 * La carrera que el conductor lleva encima, y el botón que le toca.
 *
 * QUÉ RESUELVE
 *
 * Después de aceptar, la carrera pasa por tres manos suyas —llegué, arranco,
 * termino— y cada una es un evento al servidor que puede tardar, fallar o
 * salir con la conexión caída. Este enganche junta las tres cosas que hacen
 * falta para eso: qué viaje es, qué botón toca, y en qué punto está el envío.
 *
 * DE DÓNDE SALE EL ESTADO
 *
 * De `useViajeActivo`, que ya pregunta por HTTP y se recarga con
 * `tripStatusUpdated`. No se guarda aquí una copia del viaje: dos copias del
 * mismo estado acaban discrepando, y la que se ve en pantalla sería la
 * equivocada justo cuando importa.
 *
 * EL SERVIDOR CONFIRMA, NOSOTROS NO ADIVINAMOS
 *
 * Al mandar la acción NO se pinta el estado nuevo. Se queda «enviando» hasta
 * que el servidor anuncia la transición y el viaje llega cambiado por su
 * cuenta. Adelantarse sería enseñar «viaje en curso» de un viaje que el
 * servidor rechazó, y eso es mentir con confianza.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  accionParaElEstado,
  motivoDelFallo,
  sePuedePulsar,
  type AccionDelConductor,
  type FaseDeLaAccion
} from '../domain/accionesDelConductor';
import type { DetalleReal } from '../domain/viajes';
import { cambiarEstadoDeCarrera } from './socket';
import { useEvento, useTiempoReal } from './ProveedorDeTiempoReal';
import { useViajeActivo } from './ViajeActivo';

export interface CarreraDelConductor {
  /** El viaje que lleva ahora, o `null` si no lleva ninguno. */
  readonly viaje: DetalleReal | null;
  /** El botón que toca, o `null` si en este estado no hay nada que pulsar. */
  readonly accion: AccionDelConductor | null;
  readonly fase: FaseDeLaAccion;
  /** Qué salió mal, en castellano, o `null`. */
  readonly fallo: string | null;
  /** Si el botón acepta el toque ahora mismo. */
  readonly sePuede: boolean;
  readonly pulsar: () => void;
}

export function useCarreraDelConductor(): CarreraDelConductor {
  const { viaje } = useViajeActivo();
  const { estado: conexion } = useTiempoReal();
  const [fase, setFase] = useState<FaseDeLaAccion>('IDLE');
  const [fallo, setFallo] = useState<string | null>(null);

  // Lo que se pidió y todavía no ha contestado el servidor. Sirve para no
  // confundir el rechazo de OTRA carrera con el de la que se acaba de mandar.
  const enVuelo = useRef<{ viajeId: string; estado: string } | null>(null);

  const accion = accionParaElEstado(viaje?.estado);
  const hayConexion = conexion === 'conectado';

  // AL CAMBIAR EL ESTADO, EL BOTÓN VUELVE A EMPEZAR.
  //
  // El viaje cambia porque el servidor confirmó la transición, así que lo que
  // estuviera en vuelo ya llegó. Sin esto, el botón siguiente heredaría el
  // «enviando» del anterior y se quedaría muerto.
  useEffect(() => {
    enVuelo.current = null;
    setFase('IDLE');
    setFallo(null);
  }, [viaje?.estado, viaje?.id]);

  // El servidor rechazó lo que se pidió: se dice y se deja volver a intentar.
  useEvento('tripStatusRejected', useCallback((cuerpo: unknown) => {
    const dato = cuerpo as { tripId?: unknown; error?: unknown } | null;
    const pedido = enVuelo.current;
    if (pedido === null) return;
    if (typeof dato?.tripId === 'string' && dato.tripId !== pedido.viajeId) return;
    enVuelo.current = null;
    setFallo(motivoDelFallo(typeof dato?.error === 'string' ? dato.error : null));
    setFase('ERROR');
  }, []));

  // La carrera no era suya. Mismo tratamiento: se dice y no se reintenta solo.
  useEvento('authorization:error', useCallback((cuerpo: unknown) => {
    const dato = cuerpo as { tripId?: unknown } | null;
    const pedido = enVuelo.current;
    if (pedido === null) return;
    if (typeof dato?.tripId === 'string' && dato.tripId !== pedido.viajeId) return;
    enVuelo.current = null;
    setFallo(motivoDelFallo('FORBIDDEN'));
    setFase('ERROR');
  }, []));

  const pulsar = useCallback(() => {
    if (viaje === null || accion === null) return;
    // La guarda del doble toque. Vale tanto para dos dedos rápidos como para un
    // toque mientras el anterior sigue en vuelo.
    if (!sePuedePulsar(fase, hayConexion)) {
      if (!hayConexion) { setFase('OFFLINE'); setFallo(null); }
      return;
    }

    setFallo(null);
    const salio = cambiarEstadoDeCarrera(viaje.id, accion.estadoQuePide);
    if (!salio) {
      // Sin conexión no es un error: es «ahora no», y se recupera solo.
      enVuelo.current = null;
      setFase('OFFLINE');
      return;
    }
    enVuelo.current = { viajeId: viaje.id, estado: accion.estadoQuePide };
    setFase('SUBMITTING');
  }, [viaje, accion, fase, hayConexion]);

  return {
    viaje,
    accion,
    fase,
    fallo,
    sePuede: accion !== null && sePuedePulsar(fase, hayConexion),
    pulsar
  };
}
