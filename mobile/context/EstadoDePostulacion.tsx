/**
 * El estado del expediente, para la pantalla que quiera enseñarlo.
 *
 * CUÁNDO SE VUELVE A PREGUNTAR
 *
 * Tres momentos, y ninguno es un temporizador:
 *
 *   - Al aparecer la pantalla, y cada vez que se vuelve a ella.
 *   - Al volver la aplicación del segundo plano. Es el caso de verdad: la
 *     persona deja el teléfono, administración aprueba, la persona vuelve.
 *   - Cuando algo cambió el expediente —subir un documento, mandarlo a
 *     revisión—, porque entonces lo que hubiera guardado ya no vale.
 *
 * NO SE PREGUNTA CADA SEGUNDO
 *
 * Nada de intervalos. Una solicitud tarda horas o días en decidirse; consultar
 * cada segundo gastaría la batería y los datos de quien menos le sobran, para
 * enterarse un minuto antes. Volver a mirar el teléfono ya es la señal.
 *
 * UN FALLO NO INVENTA UN ESTADO
 *
 * Si la consulta falla, esto devuelve `null` y quien lo use no pinta nada. Una
 * red caída no puede parecerse a «no tienes solicitud» ni, mucho menos, a
 * «rechazada»: el inicio se queda como estaba y se vuelve a intentar solo la
 * próxima vez que la pantalla aparezca.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { consultarEstadoDePostulacion } from '../services/estadoDePostulacion';
import { alCambiarElExpediente } from '../services/expedienteCambiado';
import type { SolicitudPropia } from '../services/postulacion';

export interface EstadoDePostulacionEnPantalla {
  /** El expediente, o `null` mientras no se sepa: cargando, sin él, o falló. */
  readonly solicitud: SolicitudPropia | null;
  /** `true` sólo la primera vez, para que nadie tape la pantalla con un cargador. */
  readonly cargando: boolean;
  /** Vuelve a preguntar saltándose el margen de gracia. */
  readonly refrescar: () => void;
}

export function useEstadoDePostulacion({ activo = true }: { readonly activo?: boolean } = {}): EstadoDePostulacionEnPantalla {
  const [solicitud, setSolicitud] = useState<SolicitudPropia | null>(null);
  const [cargando, setCargando] = useState(activo);
  // Sobrevive a los re-renders: una respuesta que llega tarde, cuando la
  // pantalla ya se fue, no debe escribir en un componente desmontado.
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const consultar = useCallback((forzar: boolean) => {
    if (!activo) return;
    void consultarEstadoDePostulacion({ forzar }).then(lectura => {
      if (!montado.current) return;
      setCargando(false);
      // Sólo se pisa lo que hay con una respuesta buena. Un fallo deja en
      // pantalla lo último que dijo el servidor, que es más cierto que nada.
      if (lectura.ok) setSolicitud(lectura.solicitud);
    });
  }, [activo]);

  // Al entrar y al volver a esta pantalla: se salta el margen de gracia, porque
  // volver al inicio es exactamente cuando alguien espera ver la novedad.
  useFocusEffect(useCallback(() => { consultar(true); }, [consultar]));

  useEffect(() => {
    if (!activo) return undefined;
    const suscripcion = AppState.addEventListener('change', (siguiente: AppStateStatus) => {
      if (siguiente === 'active') consultar(true);
    });
    const dejarDeEscuchar = alCambiarElExpediente(() => { consultar(true); });
    return () => {
      suscripcion.remove();
      dejarDeEscuchar();
    };
  }, [activo, consultar]);

  const refrescar = useCallback(() => { consultar(true); }, [consultar]);

  return { solicitud, cargando, refrescar };
}
