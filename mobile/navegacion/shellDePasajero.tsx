/**
 * El shell de pasajero: la guarda de rol y la navegación entre pestañas, en un
 * solo sitio.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Antes cada pantalla traía su propia función `irA`, y ninguna las traía todas:
 * el Home entendía «pedir» y «servicio» pero no «seguro»; Historial y Perfil
 * entendían «inicio», «historial» y «perfil» pero no «pedir», así que el botón
 * amarillo no hacía nada desde ellas; y Pedir sólo entendía «inicio». Cuatro
 * versiones incompletas de la misma tabla.
 *
 * Y la guarda de rol faltaba justo donde más se notaba: `app/pasajero.tsx` no
 * comprobaba de quién era la sesión, así que un conductor veía el Home de
 * pasajero y sólo descubría el cruce al pulsar «Viajes».
 *
 * EL BOTÓN AMARILLO NO SE TOCA
 *
 * Ni su tamaño, ni su color, ni su icono, ni su posición, ni su sombra, ni su
 * área de toque: sigue siendo `ControlDePedido` tal cual. Lo único que cambia
 * es que ahora hace algo desde las cuatro pestañas.
 *
 * UNA SOLA HOJA DE SERVICIOS
 *
 * «¿Qué necesitas hoy?» vive dentro del Home, ya aprobada. Desde las otras
 * pestañas el botón lleva al Home **pidiéndole que la abra**, en vez de montar
 * una segunda hoja por pestaña. Una sola implementación, y como las pestañas ya
 * no se deslizan, se ve como si la hoja se abriera y no como un viaje.
 */

import { useCallback } from 'react';
import { Redirect, router } from 'expo-router';

import { useSesion } from '../context/AuthContext';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { destinoSiNoLeCorresponde, puedeEstarEn } from '../domain/shellDeRol';

/** El parámetro con el que el Home sabe que tiene que abrir la hoja. */
export const ABRIR_SERVICIOS = 'servicios';

/**
 * La tabla de navegación del shell, completa. Cualquier pantalla de pasajero
 * la usa entera: ninguna vuelve a tener su propia versión a medias.
 *
 * `enPedir` distingue el único caso en que el botón amarillo no abre la hoja:
 * estando ya en Pedir, cierra y vuelve al inicio, que es lo que hacía antes.
 */
export function crearNavegacionDePasajero({ enPedir = false } = {}) {
  return (clave: string, parametros?: Record<string, string>) => {
    switch (clave) {
      // Las cuatro pestañas. `replace` y no `push`: son hermanas, no una
      // encima de otra, y apilarlas haría que «atrás» recorriera la historia
      // de pestañas en vez de salir.
      case 'inicio':
        router.replace('/pasajero');
        return;
      case 'seguro':
        router.replace('/seguro');
        return;
      case 'historial':
        router.replace('/historial');
        return;
      case 'perfil':
        router.replace('/perfil');
        return;

      // El saldo YA NO ES UNA PESTAÑA: vive en una fila del perfil. Por eso va
      // con `push` y no con `replace` — se entra en profundidad desde el perfil
      // y «atrás» tiene que devolver ahí. Con `replace` se saldría del shell.
      case 'saldo':
        router.push('/saldo');
        return;

      // El botón amarillo. Desde cualquier pestaña abre la hoja de servicios;
      // desde Pedir, vuelve al inicio.
      case 'pedir':
        if (enPedir) router.replace('/pasajero');
        else router.replace({ pathname: '/pasajero', params: { [ABRIR_SERVICIOS]: '1' } });
        return;

      // La casilla «Viajes» de la hoja es la puerta real a pedir una carrera.
      // El resto de casillas todavía no llevan a ningún sitio, y por eso no
      // hacen nada: mandar a una pantalla vacía sería peor.
      case 'servicio':
        if (parametros?.servicio === 'viajes') router.push('/pedir');
        return;

      case 'avisos':
        router.push('/avisos');
        return;
      case 'viaje-detalle':
        if (parametros?.viaje) router.push(`/viaje/${encodeURIComponent(parametros.viaje)}` as never);
        return;
      default:
    }
  };
}

/**
 * Envuelve una pantalla de pasajero: comprueba el rol y le da la navegación.
 *
 * Mientras la sesión se resuelve no decide nada —`cargando` se pinta y ya—,
 * porque expulsar a alguien por un estado que aún no ha llegado es el otro
 * error clásico de las guardas.
 */
export function ShellDePasajero({
  children,
  cargando,
  enPedir = false
}: {
  readonly children: React.ReactNode;
  /** Qué enseñar mientras la sesión se confirma. */
  readonly cargando: React.ReactNode;
  readonly enPedir?: boolean;
}) {
  const { sesion } = useSesion();
  const ir = useCallback(crearNavegacionDePasajero({ enPedir }), [enPedir]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') return <>{cargando}</>;
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;
  // LA GUARDA QUE FALTABA. El rol lo dice el servidor, no la ruta ni la
  // intención con la que alguien pulsó un botón.
  if (!puedeEstarEn('pasajero', sesion.usuario.role)) {
    return <Redirect href={destinoSiNoLeCorresponde('pasajero', sesion.usuario.role)} />;
  }

  return <ProveedorDeNavegacion ir={ir}>{children}</ProveedorDeNavegacion>;
}
