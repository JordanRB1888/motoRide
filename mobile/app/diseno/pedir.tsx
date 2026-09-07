/**
 * Pedir un viaje: el mapa con la peticion desplegada.
 *
 * Un envoltorio de tres lineas: el componente real de `preview/` con la
 * navegacion enchufada. La pantalla no sabe de rutas —habla en claves— y el
 * router no sabe de diseno.
 */

import { C2PedirViaje } from '../../preview/pantallasC2';

export default function Pantalla() {
  return <C2PedirViaje />;
}
