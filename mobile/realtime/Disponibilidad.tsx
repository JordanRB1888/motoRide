/**
 * El conductor, en servicio o fuera.
 *
 * EL SERVIDOR ES LA AUTORIDAD, SIEMPRE
 *
 * Tocar el interruptor no cambia el estado: lo PIDE. Lo que se pinta es lo que
 * el servidor confirma por `driverStatusChanged`. Si se pintara el deseo del
 * usuario, un conductor podría verse «en línea» mientras el servidor lo tiene
 * fuera, esperando viajes que nunca van a llegar — y culpando a la aplicación
 * de que no le entra trabajo.
 *
 * Y el estado no siempre lo pide él: administración puede suspenderlo, y el
 * flujo del viaje lo pone `IN_TRIP`. Escuchar el evento cubre los tres casos
 * con el mismo camino.
 *
 * DE DÓNDE SALE EL ESTADO AL ARRANCAR
 *
 * Del perfil, que el backend confirma al abrir la aplicación. A partir de ahí
 * manda el socket. Sin ese arranque, un conductor que dejó la aplicación en
 * servicio la abriría con el disco apagado y creería que se ha desconectado.
 *
 * LO QUE NO HACE
 *
 * No acepta viajes ni los rechaza —eso es despacho—, no toca el GPS, y no
 * inventa estados: `SUSPENDED` y `PENDING_APPROVAL` son de administración y ni
 * siquiera caben en el tipo de lo que se puede pedir.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import { conectarComoConductor, escuchar, pedirEstadoDeConductor } from './socket';
import { useTiempoReal } from './ProveedorDeTiempoReal';
import { useSesion } from '../context/AuthContext';
import {
  alTocarElInterruptor,
  confirmada,
  DISPONIBILIDAD_INICIAL,
  enServicio,
  leerEstadoDelConductor,
  pidiendo,
  rechazada,
  type Disponibilidad
} from '../domain/disponibilidad';

interface ValorDeDisponibilidad {
  readonly disponibilidad: Disponibilidad;
  /** `true` si el disco de la barra debe estar encendido. */
  readonly enLinea: boolean;
  /** Pide entrar o salir de servicio. No cambia nada por su cuenta. */
  readonly alternar: () => void;
}

const APAGADO: ValorDeDisponibilidad = {
  disponibilidad: DISPONIBILIDAD_INICIAL,
  enLinea: false,
  alternar: () => undefined
};

const Contexto = createContext<ValorDeDisponibilidad>(APAGADO);

export function ProveedorDeDisponibilidad({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const { estado: conexion } = useTiempoReal();

  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad>(DISPONIBILIDAD_INICIAL);

  const usuario = sesion.estado === 'AUTENTICADO' ? sesion.usuario : null;
  const esConductor = usuario?.role === 'driver';
  const conectado = conexion === 'conectado';

  // El identificador propio, para descartar eventos de otros conductores: el
  // servidor manda `driverStatusChanged` también al pasajero de un viaje, y
  // ese payload habla de OTRA persona.
  const miId = usuario?.id ?? null;

  // Sólo se registra en la flota una vez por conexión. Registrarse en cada
  // repintado mandaría al servidor a reescribir el conductor sin motivo.
  const registrado = useRef(false);

  // ---------------------------------------------------------------------
  // El estado de arranque, del perfil que el backend ya confirmó
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!esConductor) return;
    const delPerfil = leerEstadoDelConductor(usuario?.driverStatus);
    if (delPerfil === null) return;

    setDisponibilidad(previa => (
      // Sólo si todavía no se sabía nada: una confirmación del socket es más
      // reciente que el perfil con el que se abrió la aplicación.
      previa.fase === 'DESCONOCIDA' ? confirmada(delPerfil) : previa
    ));
  }, [esConductor, usuario?.driverStatus]);

  // ---------------------------------------------------------------------
  // La autoridad: lo que el servidor diga
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!esConductor || !conectado) return;

    const dejarDeEscucharEstado = escuchar('driverStatusChanged', payload => {
      const dato = payload as Record<string, unknown>;
      const dueño = String(dato.driverId ?? dato.userId ?? '');
      // El mismo evento llega al pasajero hablando de SU conductor: sólo
      // cuenta cuando habla de uno mismo.
      if (miId !== null && dueño !== '' && dueño !== miId) return;

      const estado = leerEstadoDelConductor(dato.status);
      if (estado !== null) setDisponibilidad(confirmada(estado));
    });

    const dejarDeEscucharAlta = escuchar('driver:connected', payload => {
      const dato = payload as Record<string, unknown>;
      const conductor = dato.driver as Record<string, unknown> | undefined;
      const estado = leerEstadoDelConductor(conductor?.status);
      if (estado !== null) setDisponibilidad(confirmada(estado));
    });

    const dejarDeEscucharRechazo = escuchar('driver:status_rejected', payload => {
      const motivo = String((payload as Record<string, unknown>).error ?? 'RECHAZO_SIN_MOTIVO');
      // El estado anterior se conserva: si el cambio no se aceptó, el
      // conductor sigue donde estaba, y apagarle el disco le haría creer que
      // salió de servicio.
      setDisponibilidad(previa => rechazada(previa, motivo));
    });

    return () => {
      dejarDeEscucharEstado();
      dejarDeEscucharAlta();
      dejarDeEscucharRechazo();
    };
  }, [esConductor, conectado, miId]);

  // ---------------------------------------------------------------------
  // Entrar en la flota
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!esConductor || !conectado) {
      // Al perderse la conexión hay que volver a registrarse cuando vuelva: el
      // servidor guarda el socket, y el viejo ya no sirve para ofrecerle nada.
      registrado.current = false;
      return;
    }
    if (registrado.current) return;

    // Se entra con el estado que el servidor ya tenía, no con `AVAILABLE` por
    // defecto: reconectar no puede poner a trabajar a quien se había ido.
    const actual = disponibilidad.estado;
    registrado.current = conectarComoConductor(enServicio(actual) ? 'AVAILABLE' : 'OFFLINE');
  }, [esConductor, conectado, disponibilidad.estado]);

  // ---------------------------------------------------------------------
  // El interruptor
  // ---------------------------------------------------------------------
  const alternar = useCallback(() => {
    if (!esConductor || !conectado) return;

    // Desde `IN_TRIP` no hay nada que alternar: no se sale de servicio con
    // alguien montado en la moto.
    const pedido = alTocarElInterruptor(disponibilidad.estado);
    if (pedido === null) return;

    setDisponibilidad(pidiendo);
    if (!pedirEstadoDeConductor(pedido)) {
      setDisponibilidad(previa => rechazada(previa, 'SIN_CONEXION'));
    }
  }, [esConductor, conectado, disponibilidad.estado]);

  const valor = useMemo(() => ({
    disponibilidad,
    enLinea: enServicio(disponibilidad.estado),
    alternar
  }), [disponibilidad, alternar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDisponibilidad(): ValorDeDisponibilidad {
  return useContext(Contexto);
}
