/**
 * Lo que hay que hacer ANTES de soltar el token al cerrar sesión.
 *
 * Cerrar sesión borra el token y, con él, la posibilidad de hablar con el
 * servidor en nombre de quien se va. Hay cosas que sólo se pueden hacer
 * mientras todavía se puede: dar de baja el dispositivo de los avisos push,
 * por ejemplo. Si se hacen después, salen sin autenticación y no valen.
 *
 * Cada parte de la aplicación apunta aquí su despedida; `salir()` las ejecuta
 * todas antes de borrar el token. Con tope de tiempo: una despedida lenta no
 * puede retener a nadie que quiere irse. Y sin poder romper nada: una
 * despedida que falla se ignora, porque cerrar sesión tiene que funcionar
 * siempre.
 */

export type Despedida = () => Promise<void>;

const TOPE_MS = 3000;
const despedidas = new Set<Despedida>();

/** Apunta una despedida. Devuelve cómo retirarla. */
export function alCerrarSesion(despedida: Despedida): () => void {
  despedidas.add(despedida);
  return () => { despedidas.delete(despedida); };
}

/** Ejecuta todas las despedidas, con tope, sin que ninguna pueda fallar. */
export async function despedirse(): Promise<void> {
  const tope = new Promise<void>(resolve => { setTimeout(resolve, TOPE_MS); });
  await Promise.all([...despedidas].map(despedida => Promise.race([despedida().catch(() => undefined), tope])));
}
