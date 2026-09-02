/**
 * Quién enciende y apaga el seguimiento en segundo plano.
 *
 * UNA SOLA CONDICIÓN, COMPROBADA EN UN SITIO
 *
 * El seguimiento existe mientras el conductor está en servicio, y no existe en
 * ningún otro caso. Esa comprobación vive en `domain/seguimientoEnSegundoPlano`
 * y aquí sólo se aplica: repartida por la aplicación, cualquiera podría
 * olvidarse de un caso y dejar a alguien siendo seguido después de terminar su
 * jornada.
 *
 * LOS DOS TRANSPORTES NO SE PISAN
 *
 *   pantalla encendida   socket, en tiempo real, fino
 *   pantalla apagada     HTTP cada quince segundos, desde la tarea
 *
 * Nunca los dos a la vez mandando la misma posición: sería el doble de datos
 * del conductor y el doble de escrituras en el servidor. La exclusión la marca
 * el estado de la aplicación, que es lo único que sabe de verdad dónde está la
 * pantalla.
 *
 * EL PERMISO SE PIDE CUANDO SE ENTIENDE
 *
 * No al instalar, ni al abrir. Al ponerse en servicio, que es el momento en que
 * la explicación se sostiene sola: acaba de decir que quiere trabajar, y esto
 * es lo que hace falta para que le lleguen viajes con el teléfono guardado.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';

import { useSesion } from '../context/AuthContext';
import { useDisponibilidad } from '../realtime/Disponibilidad';
import { enServicio } from '../domain/disponibilidad';
import { debeSeguirEnSegundoPlano } from '../domain/seguimientoEnSegundoPlano';
import { arrancarSeguimiento, estaSiguiendo, pararSeguimiento } from './tareaDeUbicacion';

/**
 * En qué punto está el permiso de segundo plano.
 *
 * DESCONOCIDO   todavía no se preguntó
 * CONCEDIDO     puede seguir midiendo con la aplicación cerrada
 * DENEGADO      dijo que no, o el sistema manda a los ajustes
 * NO_DISPONIBLE la plataforma no lo ofrece — el navegador, sin ir más lejos
 */
export type PermisoDeFondo = 'DESCONOCIDO' | 'CONCEDIDO' | 'DENEGADO' | 'NO_DISPONIBLE';

interface ValorDelSeguimiento {
  readonly permiso: PermisoDeFondo;
  /** Lo que el SISTEMA dice: si la tarea está corriendo ahora mismo. */
  readonly siguiendo: boolean;
  /**
   * Pide el permiso de segundo plano. Se llama al entrar en servicio.
   *
   * Devuelve si quedó concedido, para que quien llame pueda decidir qué contar
   * — no para bloquear nada por su cuenta.
   */
  readonly pedirPermisoDeFondo: () => Promise<boolean>;
}

const APAGADO: ValorDelSeguimiento = {
  permiso: 'DESCONOCIDO',
  siguiendo: false,
  pedirPermisoDeFondo: async () => false
};

const Contexto = createContext<ValorDelSeguimiento>(APAGADO);

export function ProveedorDeSeguimiento({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const { disponibilidad } = useDisponibilidad();

  const [permiso, setPermiso] = useState<PermisoDeFondo>('DESCONOCIDO');
  const [siguiendo, setSiguiendo] = useState(false);

  const haySesion = sesion.estado === 'AUTENTICADO';
  const esConductor = haySesion && sesion.usuario.role === 'driver';

  // Evita dos arranques o dos paradas a la vez: el efecto puede dispararse por
  // varios cambios seguidos, y arrancar dos veces la misma tarea confunde al
  // sistema sobre cuál está corriendo.
  const trabajando = useRef(false);

  // Al montar se pregunta al SISTEMA, no se supone. La tarea sobrevive a que se
  // cierre la aplicación: al volver a abrirla puede seguir corriendo de la
  // sesión anterior, y hay que saberlo antes de decidir nada.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      if (Platform.OS === 'web') {
        if (vigente) setPermiso('NO_DISPONIBLE');
        return;
      }
      const actual = await Location.getBackgroundPermissionsAsync();
      const corriendo = await estaSiguiendo();
      if (!vigente) return;
      setPermiso(actual.granted ? 'CONCEDIDO' : 'DESCONOCIDO');
      setSiguiendo(corriendo);
    })();
    return () => { vigente = false; };
  }, []);

  const pedirPermisoDeFondo = async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setPermiso('NO_DISPONIBLE');
      return false;
    }

    // El de primer plano va SIEMPRE antes: Android e iOS rechazan el de
    // segundo plano si no se tiene el primero, y pedirlos al revés gasta el
    // único intento que da el sistema.
    const primerPlano = await Location.getForegroundPermissionsAsync();
    if (!primerPlano.granted) {
      setPermiso('DENEGADO');
      return false;
    }

    const actual = await Location.getBackgroundPermissionsAsync();
    if (actual.granted) {
      setPermiso('CONCEDIDO');
      return true;
    }

    // Si el sistema ya no pregunta —Android 11 en adelante manda a los
    // ajustes— no se insiste: el diálogo no aparecería y sólo se repetiría el
    // «no». Tampoco se abre nada por sorpresa.
    if (!actual.canAskAgain) {
      setPermiso('DENEGADO');
      return false;
    }

    const respuesta = await Location.requestBackgroundPermissionsAsync();
    setPermiso(respuesta.granted ? 'CONCEDIDO' : 'DENEGADO');
    return respuesta.granted;
  };

  // ---------------------------------------------------------------------
  // Pedir el permiso, en el único momento en que se entiende
  // ---------------------------------------------------------------------
  //
  // No al instalar ni al abrir, sino cuando el servidor confirma que este
  // conductor acaba de entrar en servicio: acaba de decir que quiere trabajar,
  // y esto es lo que hace falta para que le lleguen viajes con el teléfono
  // guardado. Pedirlo sin nada en pantalla que lo justifique se deniega casi
  // siempre, y una vez denegado el sistema deja de preguntar.
  //
  // Se pide UNA vez: en cuanto hay respuesta el permiso deja de ser
  // `DESCONOCIDO` y esta condición no vuelve a cumplirse. Si dijo que no, no se
  // le insiste cada vez que se pone en línea.
  //
  // Y decir que no NO le impide entrar en servicio: eso sería una decisión de
  // negocio que no me corresponde inventar. Trabajará con la pantalla
  // encendida, igual que antes de esta fase.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!esConductor || permiso !== 'DESCONOCIDO') return;
    if (!enServicio(disponibilidad.estado)) return;
    void pedirPermisoDeFondo();
    // `pedirPermisoDeFondo` se recrea en cada repintado; ponerla de dependencia
    // dispararía el efecto solo, y el sistema sólo concede un intento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esConductor, permiso, disponibilidad.estado]);

  // ---------------------------------------------------------------------
  // Encender y apagar, según la condición única
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const debe = debeSeguirEnSegundoPlano({
      haySesion,
      esConductor,
      estado: disponibilidad.estado,
      permisoDeSegundoPlano: permiso === 'CONCEDIDO'
    });

    let vigente = true;
    void (async () => {
      if (trabajando.current) return;
      trabajando.current = true;
      try {
        // Se pregunta al sistema cada vez en vez de fiarse del estado de
        // React: la tarea puede haber quedado viva de una sesión anterior.
        const corriendo = await estaSiguiendo();
        if (debe && !corriendo) await arrancarSeguimiento();
        if (!debe && corriendo) await pararSeguimiento();
        if (vigente) setSiguiendo(await estaSiguiendo());
      } finally {
        trabajando.current = false;
      }
    })();

    return () => { vigente = false; };
  }, [haySesion, esConductor, disponibilidad.estado, permiso]);

  // ---------------------------------------------------------------------
  // Que los dos transportes no se pisen
  // ---------------------------------------------------------------------
  //
  // Al volver a primer plano se vuelve a preguntar al sistema: mientras la
  // pantalla estuvo apagada pudo pasar cualquier cosa —el sistema mató la
  // tarea, el usuario quitó el permiso desde la notificación— y creerse lo
  // último que se supo sería contar una verdad vieja.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const suscripcion = AppState.addEventListener('change', async siguiente => {
      if (siguiente !== 'active') return;
      const actual = await Location.getBackgroundPermissionsAsync();
      setPermiso(previo => (
        actual.granted ? 'CONCEDIDO' : (previo === 'CONCEDIDO' ? 'DENEGADO' : previo)
      ));
      setSiguiendo(await estaSiguiendo());
    });

    return () => suscripcion.remove();
  }, []);

  const valor = useMemo(
    () => ({ permiso, siguiendo, pedirPermisoDeFondo }),
    // `pedirPermisoDeFondo` se recrea en cada repintado y no pasa nada: no se
    // usa como dependencia de ningún efecto, sólo lo llama el interruptor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permiso, siguiendo]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSeguimiento(): ValorDelSeguimiento {
  return useContext(Contexto);
}
