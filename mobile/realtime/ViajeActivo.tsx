/**
 * La ÚNICA autoridad móvil del viaje activo.
 *
 * Una sola, para los dos roles. El servidor ya decide qué viaje es de quién
 * —`GET /api/trips/active/me` filtra por `passengerId` o `driverId`— así que un
 * almacén por rol sería duplicar lógica para llegar al mismo sitio, con el
 * riesgo de que los dos discrepen.
 *
 * HTTP MANDA. EL SOCKET AVISA.
 *
 * El payload de `tripStatusUpdated` NO sustituye a la autoridad, y no por
 * prudencia abstracta: viene con cinco formas distintas según quién lo emita,
 * a veces sin `canonicalStatus`, a veces sin `updatedAt`, y nunca con el viaje
 * entero. Aplicarlo dejaría el modelo a medias.
 *
 * Así que cada evento relevante dispara una consulta HTTP. Son unas seis por
 * viaje —una por transición— y a cambio lo que se enseña es siempre lo que el
 * servidor tiene.
 *
 * LO QUE VIEJO NO PISA A LO NUEVO
 *
 * Cada consulta lleva número de generación. Sólo la última escribe. Sin eso,
 * una respuesta lenta que llega después de una rápida deja el modelo en el
 * pasado, y con red mala eso pasa constantemente.
 *
 * El número también salta al cambiar de sesión: las respuestas en vuelo de la
 * cuenta anterior no pueden escribir sobre la nueva.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSesion } from '../context/AuthContext';
import { pedirViajeActivo } from '../services/viajes';
import {
  alCerrarSesion,
  alEmpezarAPreguntar,
  alFallar,
  alNoHaberViaje,
  alRecibirViaje,
  ESTADO_INICIAL,
  retrasoDeRecarga,
  superficieDe,
  viajeConocido,
  type EstadoDelViajeActivo
} from '../domain/viajeActivo';
import type { DetalleReal } from '../domain/viajes';
import { useEvento, useResync } from './ProveedorDeTiempoReal';

export interface ValorDelViajeActivo {
  readonly estado: EstadoDelViajeActivo;
  /** El viaje que se conoce, esté fresco o no. Para pintar. */
  readonly viaje: DetalleReal | null;
  /** La pantalla que le toca, o `null` si no hay ninguna aprobada. */
  readonly superficie: string | null;
  /** Vuelve a preguntar al servidor. */
  readonly refrescar: () => void;
  /**
   * El despacho se quedó sin conductores a quien ofrecer este viaje.
   *
   * Se recuerda AQUÍ y no en la pantalla del viaje porque el aviso puede
   * llegar antes de que esa pantalla exista: sin ningún conductor elegible, el
   * servidor cancela en el mismo instante de crear. Quien lo enseñe lo lee de
   * aquí y lo olvida cuando ya lo ha contado.
   */
  readonly sinConductores: boolean;
  readonly olvidarSinConductores: () => void;
}

const Contexto = createContext<ValorDelViajeActivo | null>(null);

export function ProveedorDeViajeActivo({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const [estado, setEstado] = useState<EstadoDelViajeActivo>(ESTADO_INICIAL);

  // Sólo la consulta más reciente puede escribir. Es una referencia y no
  // estado: cambia dentro de una petición en vuelo y no debe repintar nada.
  const generacion = useRef(0);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // Quién tiene la sesión ahora. Cambiar de cuenta invalida todo lo anterior.
  const identidad = sesion.estado === 'AUTENTICADO' ? sesion.usuario.id : null;

  const refrescar = useCallback(async () => {
    if (identidad === null) return;

    const mia = ++generacion.current;
    setEstado(alEmpezarAPreguntar);

    const respuesta = await pedirViajeActivo();

    // Llegó tarde: otra consulta —o un cambio de sesión— la adelantó.
    if (!montado.current || mia !== generacion.current) return;

    if (respuesta.ok) {
      setEstado(respuesta.datos === null ? alNoHaberViaje() : alRecibirViaje(respuesta.datos));
      return;
    }

    // Un fallo de red NO borra el viaje: se conserva lo último conocido y se
    // marca que hace falta volver a preguntar. Decirle a alguien que va montado
    // en la moto que no tiene ningún viaje es peor que decirle que no se pudo
    // comprobar.
    setEstado(anterior => alFallar(anterior, respuesta.mensaje));
  }, [identidad]);

  // Arranque, y limpieza al cerrar sesión o cambiar de cuenta.
  useEffect(() => {
    if (identidad === null) {
      // El número salta aunque no haya consulta en vuelo: si la hubiera, su
      // respuesta ya no podría escribir.
      generacion.current += 1;
      setEstado(alCerrarSesion());
      return;
    }
    void refrescar();
  }, [identidad, refrescar]);

  // Al volver el socket tras una caída. Mientras no había red, el servidor
  // siguió cambiando el viaje y nadie lo oyó.
  useResync(() => { void refrescar(); });

  // Los tres eventos que pueden cambiar MI viaje. Ninguno se aplica: se usan
  // para saber QUE algo cambió.
  const alCambiarElViaje = useCallback(() => { void refrescar(); }, [refrescar]);
  useEvento('tripStatusUpdated', alCambiarElViaje);
  useEvento('rideCancelled', alCambiarElViaje);
  useEvento('dispatch:no_drivers', alCambiarElViaje);

  // Y ESE ADEMÁS SE RECUERDA
  //
  // Es la única explicación que tendrá quien vea desaparecer su viaje recién
  // pedido. Va en su propia escucha para no tocar la de arriba: los eventos
  // siguen sin aplicarse ni leerse: sólo dicen QUE algo cambió.
  const [sinConductores, setSinConductores] = useState(false);
  useEvento('dispatch:no_drivers', useCallback(() => setSinConductores(true), []));
  const olvidarSinConductores = useCallback(() => setSinConductores(false), []);

  // Al volver del segundo plano. No se usa temporizador: el sistema los
  // suspende con la aplicación, así que un intervalo «cada minuto» puede haber
  // estado dormido tres horas y despertar creyendo que pasó un minuto.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', siguiente => {
      if (siguiente === 'active' && identidad !== null) void refrescar();
    });
    return () => { suscripcion.remove(); };
  }, [identidad, refrescar]);

  const viaje = viajeConocido(estado);

  return (
    <Contexto.Provider
      value={{
        estado,
        viaje,
        superficie: superficieDe(viaje),
        refrescar: () => { void refrescar(); },
        sinConductores,
        olvidarSinConductores
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

/**
 * El viaje activo.
 *
 * Sin proveedor devuelve algo inerte, como el resto de contextos de la
 * aplicación: el laboratorio monta pantallas sueltas y no puede reventar.
 */
export function useViajeActivo(): ValorDelViajeActivo {
  return useContext(Contexto) ?? {
    estado: ESTADO_INICIAL,
    viaje: null,
    superficie: null,
    refrescar: () => undefined,
    sinConductores: false,
    olvidarSinConductores: () => undefined
  };
}

/** Reexportado para quien reparta recargas sin importar el dominio entero. */
export { retrasoDeRecarga };
