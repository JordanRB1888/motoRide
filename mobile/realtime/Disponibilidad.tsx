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
import { useViajeActivo } from './ViajeActivo';
import { usePermisoDeSegundoPlano } from '../ubicacion/PermisoDeSegundoPlano';
import {
  puertaParaEntrarEnServicio,
  reconciliarSinPermiso
} from '../domain/seguimientoEnSegundoPlano';
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
  /**
   * Pide entrar o salir de servicio.
   *
   * Para ENTRAR se asegura antes el permiso de segundo plano, porque sin él el
   * estado prometería algo que la aplicación no puede cumplir. Para salir no
   * pide nada. El estado lo confirma siempre el servidor.
   */
  readonly alternar: () => Promise<void>;
  /**
   * Está en servicio con un viaje en marcha y SIN permiso de segundo plano.
   *
   * Es el único caso en que ese estado se sostiene, y se sostiene sólo porque
   * romper el viaje sería peor. Quien lo lea debe contarlo como lo que es: algo
   * urgente que arreglar para que el seguimiento vuelva.
   */
  readonly faltaElPermisoDeFondo: boolean;
  /**
   * Se le acaba de sacar de servicio porque el permiso ya no está.
   *
   * Nadie debe salir de servicio sin enterarse: creería que sigue trabajando y
   * esperaría viajes que no van a llegar. Se apaga al recuperar el permiso o al
   * volver a entrar en servicio.
   */
  readonly sacadoDeServicioPorElPermiso: boolean;
  /** Ofrece los ajustes del teléfono. Para el aviso, sin duplicar el camino. */
  readonly abrirAjustesDeUbicacion: () => Promise<void>;
}

const APAGADO: ValorDeDisponibilidad = {
  disponibilidad: DISPONIBILIDAD_INICIAL,
  enLinea: false,
  alternar: async () => undefined,
  faltaElPermisoDeFondo: false,
  sacadoDeServicioPorElPermiso: false,
  abrirAjustesDeUbicacion: async () => undefined
};

const Contexto = createContext<ValorDeDisponibilidad>(APAGADO);

export function ProveedorDeDisponibilidad({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const { estado: conexion } = useTiempoReal();
  const { viaje } = useViajeActivo();
  const { permiso, pedirPermiso, refrescar, abrirAjustes } = usePermisoDeSegundoPlano();
  const [sacadoPorElPermiso, setSacadoPorElPermiso] = useState(false);

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
  const alternar = useCallback(async () => {
    if (!esConductor || !conectado) return;

    // Desde `IN_TRIP` no hay nada que alternar: no se sale de servicio con
    // alguien montado en la moto.
    const pedido = alTocarElInterruptor(disponibilidad.estado);
    if (pedido === null) return;

    // EL PERMISO VA ANTES DE PEDIR EL ESTADO
    //
    // Decisión del dueño: en +58Express no se pasa a `AVAILABLE` sin lo que
    // hace falta para mantener la ubicación con el teléfono guardado.
    //
    // El orden importa. Pedir el estado primero y el permiso después dejaría
    // una ventana en la que el despacho ya cree que hay un conductor
    // trabajando cuando todavía no se sabe si podrá decir dónde está, y habría
    // que deshacer algo ya anunciado. Así que primero el teléfono, y sólo
    // entonces el servidor.
    //
    // Salir de servicio no pide nada: quitarse de en medio siempre se puede.
    if (pedido === 'AVAILABLE') {
      let puerta = puertaParaEntrarEnServicio(permiso);

      // Lo que se sabía del permiso puede ser viejo: pudo cambiar desde los
      // ajustes del teléfono mientras la aplicación estaba al fondo.
      if (puerta !== 'ADELANTE') puerta = puertaParaEntrarEnServicio(await refrescar());

      // Sólo se sigue con la puerta ABIERTA. Está escrito así —y no con una
      // lista de casos que rechazan— para que un motivo nuevo de bloqueo nazca
      // bloqueando: olvidarse de añadirlo aquí dejaría entrar en servicio a
      // quien no debe, que es el error caro.
      if (puerta !== 'ADELANTE') {
        if (puerta === 'PEDIR') {
          if (await pedirPermiso()) {
            // Concedido en el momento: sigue adelante sin tener que volver a
            // pulsar.
            puerta = 'ADELANTE';
          } else {
            // Dijo que no. Se queda fuera de servicio y NO se le insiste:
            // volver a pulsar es la acción explícita que lo intenta otra vez.
            setDisponibilidad(previa => rechazada(previa, 'SIN_PERMISO_DE_FONDO'));
            return;
          }
        } else if (puerta === 'AJUSTES') {
          // El sistema ya no pregunta. `pedirPermiso` ofrece el camino oficial
          // a los ajustes y no pasa de ahí: al volver, el permiso se relee solo
          // y basta con pulsar el botón otra vez.
          await pedirPermiso();
          setDisponibilidad(previa => rechazada(previa, 'PERMISO_EN_AJUSTES'));
          return;
        } else {
          // `SOLO_DESDE_LA_APP`: desde el navegador no se conduce. No hay nada
          // que pedir ni que arreglar aquí, así que ni siquiera se molesta al
          // servidor.
          setDisponibilidad(previa => rechazada(previa, 'SOLO_DESDE_LA_APP'));
          return;
        }
      }
    }

    // Ha vuelto a pulsar el botón: el aviso anterior ya no describe nada.
    setSacadoPorElPermiso(false);

    setDisponibilidad(pidiendo);
    if (!pedirEstadoDeConductor(pedido)) {
      setDisponibilidad(previa => rechazada(previa, 'SIN_CONEXION'));
    }
  }, [esConductor, conectado, disponibilidad.estado, permiso, pedirPermiso, refrescar]);

  // ---------------------------------------------------------------------
  // Cuando el servidor dice que trabaja y el teléfono ya no puede
  // ---------------------------------------------------------------------
  //
  // Pasa de verdad: se puso en servicio ayer con el permiso dado y hoy lo ha
  // quitado desde los ajustes. El servidor sigue diciendo `AVAILABLE` y la
  // aplicación ya no puede cumplir lo que ese estado promete.
  //
  // La corrección la hace el SERVIDOR, no esta pantalla: se le pide el cambio y
  // se espera su confirmación, igual que con cualquier otro. Apagar el disco
  // por nuestra cuenta contaría una verdad que el despacho no comparte.
  //
  // Y si hay un viaje en marcha no se toca NADA: romper un viaje real con
  // alguien subido a la moto es mucho peor que la falta de permiso.
  const reconciliando = useRef(false);

  useEffect(() => {
    if (!esConductor || !conectado) return;
    if (disponibilidad.fase === 'PIDIENDO') return;

    const quePasa = reconciliarSinPermiso({
      estado: disponibilidad.estado,
      permiso,
      hayViajeActivo: viaje !== null
    });

    if (quePasa !== 'SACAR_DE_SERVICIO') return;
    // Una sola vez por incoherencia: el efecto se dispara con cada cambio y
    // pedir `OFFLINE` en bucle inundaría al servidor.
    if (reconciliando.current) return;

    reconciliando.current = true;
    setDisponibilidad(pidiendo);
    if (!pedirEstadoDeConductor('OFFLINE')) {
      setDisponibilidad(previa => rechazada(previa, 'SIN_CONEXION'));
      reconciliando.current = false;
      return;
    }
    // Para que la pantalla pueda contarlo. Nadie debe salir de servicio sin
    // enterarse de por qué: creería que sigue trabajando.
    setSacadoPorElPermiso(true);
  }, [esConductor, conectado, disponibilidad.estado, disponibilidad.fase, permiso, viaje]);

  // Al recuperar el permiso vuelve a poder reconciliarse: si lo quita otra vez
  // más adelante, hay que volver a sacarlo de servicio.
  useEffect(() => {
    if (permiso === 'CONCEDIDO') {
      reconciliando.current = false;
      setSacadoPorElPermiso(false);
    }
  }, [permiso]);

  const valor = useMemo(() => ({
    disponibilidad,
    enLinea: enServicio(disponibilidad.estado),
    alternar,
    // Lo que la pantalla necesita para contarlo sin rediseñarse: en servicio y
    // sin permiso es una condición crítica —el seguimiento no puede existir— y
    // sólo se sostiene mientras haya un viaje que proteger.
    faltaElPermisoDeFondo: reconciliarSinPermiso({
      estado: disponibilidad.estado,
      permiso,
      hayViajeActivo: viaje !== null
    }) === 'AVISAR_SIN_TOCAR_EL_VIAJE',
    sacadoDeServicioPorElPermiso: sacadoPorElPermiso,
    abrirAjustesDeUbicacion: abrirAjustes
  }), [disponibilidad, alternar, permiso, viaje, sacadoPorElPermiso, abrirAjustes]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDisponibilidad(): ValorDeDisponibilidad {
  return useContext(Contexto);
}
