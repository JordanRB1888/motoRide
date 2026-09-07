/**
 * La oferta de carrera, en vivo.
 *
 * Junta tres cosas que ya existían y no se hablaban: el evento `rideRequested`
 * que el servidor lleva emitiendo desde siempre, las decisiones puras de
 * `domain/ofertaDeViaje`, y el reloj que hace falta para contar los segundos.
 *
 * NO HAY COLA, PORQUE EL DESPACHO NO LA TIENE
 *
 * El servidor ofrece de uno en uno. Si llega una oferta nueva es porque la
 * anterior ya no vale, así que sustituye. La única excepción es con una
 * aceptación en vuelo: ahí la nueva espera, porque cambiar la pantalla debajo
 * del dedo mientras se resuelve es la forma más fácil de que alguien acepte una
 * carrera que no quería.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useEvento, useTiempoReal } from './ProveedorDeTiempoReal';
import { aceptarCarrera, rechazarCarrera } from './socket';
import {
  debeSustituirLaOferta,
  estaVencida,
  estadoTrasRechazoDeAceptacion,
  leerOferta,
  segundosRestantes,
  sePuedeAceptar,
  sePuedeRechazar,
  seQuedoSinRespuesta,
  type EstadoDeOferta,
  type OfertaDeViaje
} from '../domain/ofertaDeViaje';

// Traza sólo en desarrollo, como las del tiempo real. Sin datos de nadie: qué
// ventana se anunció y cuánta se ancló, que es lo que permite comprobar desde
// fuera que el conductor y el despacho cuentan lo mismo.
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;
function trazar(mensaje: string): void {
  if (EN_DESARROLLO) console.log(`[+58express oferta] ${mensaje}`);
}

export interface OfertaEnVivo {
  readonly estado: EstadoDeOferta;
  readonly oferta: OfertaDeViaje | null;
  readonly segundos: number;
  readonly puedeAceptar: boolean;
  readonly puedeRechazar: boolean;
  readonly aceptar: () => void;
  readonly rechazar: () => void;
  /** Vuelve a esperar. Para cerrar el aviso de aceptada, rechazada o vencida. */
  readonly descartar: () => void;
}

/**
 * NO RECIBE SI EL CONDUCTOR ESTA EN SERVICIO, Y ES DELIBERADO
 *
 * Tuvo un parametro `activo` que filtraba las ofertas. Sobra: el despacho solo
 * ofrece a quien tiene por disponible, asi que recibir una oferta ES la prueba
 * de estarlo. Quien monta la pantalla sigue decidiendo si la ensena o no.
 */
export function useOfertaEnVivo(): OfertaEnVivo {
  const { estado: estadoDeConexion } = useTiempoReal();
  const [oferta, setOferta] = useState<OfertaDeViaje | null>(null);
  const [estado, setEstado] = useState<EstadoDeOferta>('ESPERANDO');
  const [ahora, setAhora] = useState(() => Date.now());

  // El estado se lee dentro de los manejadores del socket, que se suscriben una
  // vez. Sin esto verían siempre el primer valor.
  const estadoActual = useRef<EstadoDeOferta>(estado);
  estadoActual.current = estado;

  // ---------------------------------------------------------------------
  // El reloj
  // ---------------------------------------------------------------------
  //
  // Sólo tictaquea si hay algo que contar. Un intervalo corriendo para siempre
  // en la pantalla de un conductor que lleva horas en servicio gasta batería
  // por nada.
  //
  // Y AL VOLVER DE SEGUNDO PLANO SE RECALCULA, NO SE REANUDA
  //
  // Android puede congelar los temporizadores de una aplicación que no está
  // delante. El vencimiento es una marca absoluta del reloj de este aparato
  // --ver `leerOferta`--, así que basta con volver a preguntar la hora para
  // saber el tiempo REAL que queda; lo que no puede hacerse es seguir
  // descontando desde donde se quedó el contador, que enseñaría segundos que
  // ya se gastaron con la pantalla apagada. El intervalo lo haría solo en su
  // siguiente tic; esto lo adelanta al instante en que se vuelve a mirar.
  const contando = estado === 'OFERTA' || estado === 'ACEPTANDO';
  useEffect(() => {
    if (!contando) return undefined;
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 250);
    const suscripcion = AppState.addEventListener('change', (siguiente: AppStateStatus) => {
      if (siguiente === 'active') setAhora(Date.now());
    });
    return () => {
      clearInterval(reloj);
      suscripcion.remove();
    };
  }, [contando]);

  // Se acabó el tiempo. El servidor ya habrá pasado al siguiente candidato.
  useEffect(() => {
    if (estado !== 'OFERTA' || oferta === null) return;
    if (estaVencida(oferta, ahora)) setEstado('EXPIRADA');
  }, [estado, oferta, ahora]);

  // LA RED DE SEGURIDAD DE LA ACEPTACIÓN EN VUELO
  //
  // El efecto de arriba sólo mira el estado `OFERTA`, así que una aceptación
  // pulsada en el último segundo no vencía nunca: se quedaba en «aceptando…»
  // para siempre, sin poder recibir la siguiente carrera y sin más salida que
  // cerrar la aplicación.
  //
  // Lo normal es que el servidor conteste, y ahora se le escucha —ahí abajo—.
  // Esto es para cuando esa respuesta no llega: la red se cayó justo entre el
  // toque y el acuse. Pasado el vencimiento más un margen se cierra como
  // perdida. Nunca como aceptada: eso sólo puede decirlo el servidor.
  useEffect(() => {
    if (seQuedoSinRespuesta(estado, oferta, ahora)) setEstado('EXPIRADA');
  }, [estado, oferta, ahora]);

  // Sin conexión no puede llegar ninguna oferta, y la que hubiera ya no vale.
  useEffect(() => {
    if (estadoDeConexion === 'conectado') return;
    setOferta(null);
    setEstado('OFFLINE');
  }, [estadoDeConexion]);

  useEffect(() => {
    if (estadoDeConexion !== 'conectado') return;
    setEstado(previo => (previo === 'OFFLINE' ? 'ESPERANDO' : previo));
  }, [estadoDeConexion]);

  // ---------------------------------------------------------------------
  // Lo que llega del servidor
  // ---------------------------------------------------------------------
  // NO SE VUELVE A FILTRAR POR DISPONIBILIDAD, Y ES DELIBERADO
  //
  // Aquí había un `if (!activo) return`. Sobra: el despacho sólo ofrece a
  // conductores que él tiene por disponibles, así que recibir una oferta ES la
  // prueba de estarlo. Volver a decidirlo con el estado local duplica una
  // decisión que ya tomó la autoridad, y si ese estado va un instante por
  // detrás --justo al ponerse en servicio, que es cuando llegan las primeras--
  // descarta en silencio una carrera perfectamente válida.
  //
  // `activo` sigue entrando en el hook para lo único que le corresponde: montar
  // o no la superficie.
  useEvento('rideRequested', useCallback((cuerpo: unknown) => {
    // El instante de recepción es el ancla del vencimiento: el servidor manda
    // cuánto queda, y eso vale contra el reloj de este aparato, no contra el
    // suyo.
    const recibidaEn = Date.now();
    const leida = leerOferta(cuerpo, recibidaEn);
    // Media oferta no se enseña: quien decide en quince segundos no puede
    // permitirse un dato a medias.
    if (leida === null) return;
    // Y una oferta que llega SIN tiempo tampoco. Puede pasar si el mensaje se
    // demoró más que la ventana. Pintarla sería ofrecer una carrera que el
    // despacho ya le pasó a otro: el botón no haría nada y quien conduce
    // pensaría que la perdió por lento.
    if (estaVencida(leida, recibidaEn)) {
      trazar('llegó una oferta ya vencida: no se enseña');
      return;
    }
    if (!debeSustituirLaOferta(estadoActual.current)) return;
    trazar(`oferta anclada con ${segundosRestantes(leida.venceEn, recibidaEn)} s`);
    setOferta(leida);
    setAhora(recibidaEn);
    setEstado('OFERTA');
  }, []));

  // La confirmación de que la carrera es suya NO es `rideAccepted` --el
  // servidor no lo emite-- sino la transición del viaje.
  useEvento('tripStatusUpdated', useCallback((cuerpo: unknown) => {
    const dato = cuerpo as { tripId?: unknown; driver?: unknown } | null;
    if (estadoActual.current !== 'ACEPTANDO') return;
    if (typeof dato?.tripId !== 'string') return;
    setOferta(previa => {
      if (previa !== null && previa.viajeId === dato.tripId) setEstado('ACEPTADA');
      return previa;
    });
  }, []));

  // El servidor dijo que no: otro llegó antes, o la sesión de despacho ya pasó.
  useEvento('authorization:error', useCallback(() => {
    if (estadoActual.current === 'ACEPTANDO') setEstado('ERROR');
  }, []));

  // EL SERVIDOR RECHAZÓ LA ACEPTACIÓN, Y LO DICE CON SU MOTIVO.
  //
  // Este evento existía desde siempre y este cliente no lo escuchaba. Por eso
  // aceptar en el último segundo dejaba la pantalla girando: el viaje ya estaba
  // cancelado, el servidor contestaba `NO_ACTIVE_OFFER`, y aquí no lo oía nadie.
  //
  // El motivo decide cómo se cuenta: haber llegado tarde no es lo mismo que no
  // poder tomar carreras.
  useEvento('rideAcceptanceFailed', useCallback((cuerpo: unknown) => {
    if (estadoActual.current !== 'ACEPTANDO') return;
    const dato = cuerpo as { tripId?: unknown; reason?: unknown } | null;
    setOferta(previa => {
      // Si el rechazo es de OTRA carrera, no se toca la que está en pantalla.
      if (previa === null) return previa;
      if (typeof dato?.tripId === 'string' && dato.tripId !== previa.viajeId) return previa;
      setEstado(estadoTrasRechazoDeAceptacion(dato?.reason));
      return previa;
    });
  }, []));

  // ---------------------------------------------------------------------
  // Lo que hace el conductor
  // ---------------------------------------------------------------------
  const aceptar = useCallback(() => {
    // El candado del doble toque vive AQUÍ, no en el botón: un botón
    // deshabilitado es una cortesía visual, y entre el primer toque y el
    // repintado cabe un segundo toque.
    if (!sePuedeAceptar(estadoActual.current, oferta, Date.now()) || oferta === null) return;
    setEstado('ACEPTANDO');
    if (!aceptarCarrera(oferta.viajeId)) setEstado('ERROR');
  }, [oferta]);

  const rechazar = useCallback(() => {
    if (!sePuedeRechazar(estadoActual.current, oferta, Date.now()) || oferta === null) return;
    rechazarCarrera(oferta.viajeId);
    setEstado('RECHAZADA');
  }, [oferta]);

  const descartar = useCallback(() => {
    setOferta(null);
    setEstado(estadoDeConexion === 'conectado' ? 'ESPERANDO' : 'OFFLINE');
  }, [estadoDeConexion]);

  return useMemo(() => ({
    estado,
    oferta,
    segundos: oferta === null ? 0 : segundosRestantes(oferta.venceEn, ahora),
    puedeAceptar: sePuedeAceptar(estado, oferta, ahora),
    puedeRechazar: sePuedeRechazar(estado, oferta, ahora),
    aceptar,
    rechazar,
    descartar
  }), [estado, oferta, ahora, aceptar, rechazar, descartar]);
}
