/**
 * De qué carpeta salió el código que se está ejecutando.
 *
 * POR QUÉ HACE FALTA SABERLO
 *
 * Este repositorio se trabaja en varios worktrees a la vez —uno por rama, más
 * el del diseño—, y cada uno levanta su propio Metro. La compilación de
 * depuración pide el bundle a `10.0.2.2:8081`, que es el puerto por omisión: se
 * lo queda el primero que arranca. Si ese primero es otro worktree, el
 * dispositivo ejecuta el código de OTRA rama mientras tú editas la tuya.
 *
 * No falla nada. Simplemente tus cambios no aparecen, y como no aparecen los
 * buscas donde no están. Costó dos fases de trabajo descubrirlo, y sólo salió
 * porque un error de React mostró de pasada una ruta que no era la mía.
 *
 * Así que la aplicación lo dice en voz alta al arrancar, en desarrollo. Una
 * línea en la consola de Metro con la carpeta de procedencia y el bundler que
 * la sirvió. Si dice una carpeta que no es en la que estás trabajando, ya lo
 * sabes en el primer segundo en vez de en el segundo día.
 *
 * QUÉ NO ES
 *
 * No es una comprobación que pueda fallar sola. El nombre viene de
 * `app.config.js`, que se evalúa en el worktree que sirve el bundle: si sirve
 * otro, dirá el suyo, que es exactamente lo que se quiere leer. Nada que
 * comparar contra un valor del propio bundle serviría, porque ese valor
 * también vendría del worktree equivocado.
 *
 * En una compilación de publicación no se ejecuta —quien llama lo hace bajo
 * `__DEV__`— y `app.config.js` tampoco escribe el nombre, así que la ruta del
 * disco de nadie acaba en una aplicación publicada.
 */

/** Lo que se sabe del origen del bundle. Todo puede faltar. */
export interface OrigenDelBundle {
  /** Carpeta del worktree que sirvió el bundle, según `app.config.js`. */
  readonly worktree?: string | null;
  /** Servidor de desarrollo, con o sin esquema: `10.0.2.2:8085` sirve igual. */
  readonly urlDelBundle?: string | null;
}

/**
 * `10.0.2.2:8085`, venga como URL completa o ya como `host:puerto`.
 *
 * Las dos formas circulan: `hostUri` de Expo da la corta y cualquier `scriptURL`
 * la larga. Aceptar ambas evita que quien llama tenga que saber cuál le tocó.
 */
function bundler(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url === '') return null;

  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  if (conEsquema !== null) return conEsquema[1] ?? null;

  // `host:puerto`, o un host suelto. Nada con barras ni espacios: eso sería
  // una URL rota, y una URL rota no se enseña a medias.
  return /^[^\s/?#]+$/.test(url) ? url : null;
}

/**
 * La línea que se enseña al arrancar, o `null` si no hay nada que decir.
 *
 * Sin ningún dato no se escribe nada: una línea que dijera «desconocido» sería
 * ruido en cada arranque y acabaría ignorándose, que es justo lo contrario de
 * lo que se busca.
 */
export function procedenciaDelBundle(origen: OrigenDelBundle): string | null {
  const carpeta = typeof origen.worktree === 'string' && origen.worktree !== ''
    ? origen.worktree
    : null;
  const servidor = bundler(origen.urlDelBundle);

  if (carpeta === null && servidor === null) return null;
  if (servidor === null) return `código de «${carpeta}»`;
  if (carpeta === null) return `código servido por ${servidor}`;
  return `código de «${carpeta}», servido por ${servidor}`;
}
