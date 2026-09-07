/**
 * El control del centro de la barra, según de quién sea la barra.
 *
 * POR QUÉ EXISTE
 *
 * Historial y Perfil los ven los dos roles, y el hueco del centro **no es el
 * mismo**: en el shell de la pasajera va el botón amarillo que abre los
 * servicios; en el del conductor, su disco de disponibilidad.
 *
 * En el hotfix de navegación se le dio al conductor su barra, pero el control
 * central se dejó en `undefined` razonando que el botón de pedir carreras no
 * era suyo. Cierto, pero incompleto: **sí tiene un control central**, y al
 * quitarlo el disco desaparecía al entrar en Historial o Perfil y volvía al
 * salir. Aquí se le devuelve el suyo.
 *
 * EL ESTADO SALE DE DONDE SIEMPRE
 *
 * `useDisponibilidad` es la única autoridad de si el conductor está en
 * servicio, y quien decide es el servidor. Este componente no guarda ningún
 * estado propio: lee y pinta, igual que hace la pantalla del conductor.
 */

import { ControlDeDisponibilidad, ControlDePedido } from '../ui/Navegacion';
import { useDisponibilidad } from '../realtime/Disponibilidad';

export function ControlCentralDelRol({ barra }: { readonly barra: 'pasajera' | 'conductor' }) {
  const { enLinea, alternar } = useDisponibilidad();

  if (barra === 'conductor') {
    return <ControlDeDisponibilidad enLinea={enLinea} onAlternar={() => { void alternar(); }} />;
  }
  // La pasajera: el botón amarillo. `abierto` es `false` porque su hoja de
  // servicios vive en el inicio, y desde aquí el botón lleva allí.
  return <ControlDePedido abierto={false} />;
}
