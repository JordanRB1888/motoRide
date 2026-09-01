/**
 * La ficha de un comercio.
 *
 * Un envoltorio de tres lineas: el componente real de `preview/` con la
 * navegacion enchufada. La pantalla no sabe de rutas —habla en claves— y el
 * router no sabe de diseno.
 */

import { C2Comercio } from '../../preview/pantallasAliados';

export default function Pantalla() {
  return <C2Comercio />;
}
