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
 * EL PERMISO NO SE PIDE AQUÍ
 *
 * Se pide antes de entrar en servicio, que es lo que exige la regla del dueño, y
 * eso ocurre en `Disponibilidad` con lo que le da `PermisoDeSegundoPlano`. Para
 * cuando este componente ve un conductor en servicio, el permiso ya está
 * resuelto. Lo único que hace aquí es leerlo.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { useSesion } from '../context/AuthContext';
import { useDisponibilidad } from '../realtime/Disponibilidad';
import { usePermisoDeSegundoPlano } from './PermisoDeSegundoPlano';
import { debeSeguirEnSegundoPlano } from '../domain/seguimientoEnSegundoPlano';
import { arrancarSeguimiento, estaSiguiendo, pararSeguimiento } from './tareaDeUbicacion';

interface ValorDelSeguimiento {
  /** Lo que el SISTEMA dice: si la tarea está corriendo ahora mismo. */
  readonly siguiendo: boolean;
}

const Contexto = createContext<ValorDelSeguimiento>({ siguiendo: false });

export function ProveedorDeSeguimiento({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const { disponibilidad } = useDisponibilidad();
  const { permiso } = usePermisoDeSegundoPlano();

  const [siguiendo, setSiguiendo] = useState(false);

  const haySesion = sesion.estado === 'AUTENTICADO';
  const esConductor = haySesion && sesion.usuario.role === 'driver';

  // Dos arranques o dos paradas a la vez confunden al sistema sobre cuál tarea
  // está corriendo, así que se hace de uno en uno.
  //
  // Pero NO se descarta lo que llega mientras tanto. Descartarlo fue un fallo
  // real: al quitar el permiso desde los ajustes, el efecto se disparó mientras
  // otra pasada seguía en marcha, se ignoró, y el servicio quedó anunciando en
  // la barra que estaba usando una ubicación que ya no podía leer. Lo último que
  // se pide es lo que vale, así que se guarda y se aplica al terminar.
  const trabajando = useRef(false);
  const pendiente = useRef<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const debe = debeSeguirEnSegundoPlano({
      haySesion,
      esConductor,
      estado: disponibilidad.estado,
      permisoDeSegundoPlano: permiso === 'CONCEDIDO'
    });

    let vigente = true;

    const aplicar = async (quiere: boolean): Promise<void> => {
      // Se pregunta al sistema cada vez en vez de fiarse del estado de React:
      // la tarea sobrevive a que se cierre la aplicación, así que puede haber
      // quedado viva de una sesión anterior.
      const corriendo = await estaSiguiendo();
      if (quiere && !corriendo) await arrancarSeguimiento();
      if (!quiere && corriendo) await pararSeguimiento();
    };

    void (async () => {
      if (trabajando.current) {
        pendiente.current = debe;
        return;
      }

      trabajando.current = true;
      try {
        let quiere = debe;
        // Mientras se aplicaba pudo cambiar la condición. Se sigue aplicando lo
        // último hasta que deje de haber nada nuevo.
        for (;;) {
          await aplicar(quiere);
          if (pendiente.current === null) break;
          quiere = pendiente.current;
          pendiente.current = null;
        }
      } catch {
        // Encender o apagar el seguimiento puede fallar —el sistema puede
        // negarse si acaban de quitarle el permiso—. No se propaga ni se deja
        // el estado a medias: se cuenta lo que el sistema diga de verdad, abajo.
        pendiente.current = null;
      } finally {
        trabajando.current = false;
        if (vigente) setSiguiendo(await estaSiguiendo().catch(() => false));
      }
    })();

    return () => { vigente = false; };
  }, [haySesion, esConductor, disponibilidad.estado, permiso]);

  const valor = useMemo(() => ({ siguiendo }), [siguiendo]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSeguimiento(): ValorDelSeguimiento {
  return useContext(Contexto);
}
