/**
 * Los dos esquemas de C2: noche y día.
 *
 * NO SON EL MISMO TEMA CON LOS COLORES INVERTIDOS
 *
 * Invertir un tema oscuro produce un tema claro que se ve barato: los grises
 * que funcionan sobre negro se vuelven ilegibles sobre blanco, el amarillo de
 * marca desaparece, y las sombras dejan de significar nada porque en claro la
 * profundidad se hace con superficies, no con oscuridad.
 *
 * DE DÓNDE SALEN LOS VALORES DEL DÍA
 *
 * De `src/styles/design-system.css`, donde el tema claro ya existe **y ya está
 * auditado**. Los comentarios de aquel fichero traen las mediciones hechas:
 *
 *   #8f6400  amarillo de texto     4,62:1 sobre el marfil · 5,26:1 sobre blanco
 *   #6f6b61  texto atenuado        4,67:1 sobre el fondo
 *   #0f7350  verde de éxito        5,14:1
 *
 * Y traen también lo que se descartó y por qué: el `#ffd21f` puro como texto
 * daba 1,27:1 y era prácticamente invisible; el `#12855a` daba 4,07 y no
 * llegaba a AA. Copiar esos valores en lugar de elegir otros nuevos es lo único
 * sensato: ese trabajo ya está hecho y comprobado.
 *
 * EL AMARILLO TIENE DOS PAPELES, Y EN CLARO NO PUEDEN SER EL MISMO
 *
 * Sobre grafito, `#ffd21f` sirve tanto de fondo de botón como de color de
 * texto. Sobre marfil no: como fondo sigue siendo perfecto —con tinta oscura
 * encima— pero como texto desaparece.
 *
 * Por eso hay dos tokens. `acento` es la superficie de marca; `acentoTexto` es
 * el amarillo que se puede leer. En noche coinciden; en día no.
 */

import { AMARILLO, ESTADO, GRAFITO, SOBRE_IMAGEN, TEXTO } from './primitives';

/** Los colores de un esquema. Es lo único que cambia entre día y noche. */
export interface EsquemaDeColor {
  readonly fondo: string;
  readonly superficie: string;
  readonly superficieElevada: string;
  /**
   * Lo que se hunde: campos de texto, chips, filas de dato.
   *
   * No es lo mismo que `fondo`, aunque en oscuro coincidan. En oscuro, un campo
   * con el color del fondo dentro de una hoja se hunde y se ve; en claro, el
   * fondo y la superficie están a seis puntos de luminancia y el campo
   * desaparece. Aquí cada esquema decide cuánto hay que hundir para que se vea.
   */
  readonly superficieHundida: string;
  readonly borde: string;
  /** La superficie de marca: fondo de botón, filo, marcadores. */
  readonly acento: string;
  readonly acentoPresionado: string;
  /** La tinta que va ENCIMA del acento. */
  readonly sobreAcento: string;
  /**
   * El amarillo que se puede LEER.
   *
   * En noche es el mismo de marca. En día es un ámbar profundo, porque el
   * `#ffd21f` sobre marfil da 1,27:1 y no se lee.
   */
  readonly acentoTexto: string;
  readonly textoPrimario: string;
  readonly textoSecundario: string;
  readonly textoTenue: string;
  readonly exito: string;
  readonly aviso: string;
  readonly peligro: string;
  readonly informacion: string;
  /**
   * El velo sobre el mapa cuando algo tiene que destacar por encima.
   *
   * Cambia de color con el esquema: oscurecer un mapa claro y aclarar uno
   * oscuro son operaciones distintas, y usar negro en los dos deja el mapa
   * claro sucio.
   */
  readonly veloDelMapa: string;
  /**
   * Las manzanas del mapa.
   *
   * Tiene token propio porque el mapa no es una superficie más: las calles se
   * pintan ENCIMA, y necesitan contraste contra las manzanas.
   *
   * En noche coincide con `superficie` y funciona. En día no: con las calles en
   * blanco sobre el marfil de superficie, los dos tonos quedaban a un paso uno
   * de otro y el mapa se veía lavado, sin calles. Aquí baja un escalón más para
   * que el blanco se lea.
   */
  readonly fondoDelMapa: string;
  /**
   * Las calles del mapa.
   *
   * En noche son gris sobre grafito; en dia, BLANCAS sobre marfil. Una calle
   * es lo que queda entre las manzanas, y en un mapa claro eso es mas claro
   * que ellas, no mas oscuro.
   */
  readonly calleDelMapa: string;
  /**
   * La ruta trazada sobre el mapa.
   *
   * VERDE, Y NO AMARILLO. El amarillo es la identidad de +58express: el botón
   * de pedir, el disco del conductor, la cabecera. Una ruta amarilla competía
   * con todos ellos y, sobre las calles amarillas del propio mapa de Maracaibo,
   * directamente se perdía.
   *
   * El verde no significa nada más en esta aplicación —el de «activo» del
   * conductor es otro token— así que al aparecer sólo puede querer decir «por
   * aquí vas». Y aguanta los dos esquemas: sobre marfil y sobre grafito
   * mantiene contraste sin encenderse.
   */
  readonly rutaDelMapa: string;
  /**
   * La tinta que va ENCIMA de una fotografía con velo oscuro (el hero y las
   * promociones del inicio).
   *
   * No cambia con el esquema: el velo es el mismo de día que de noche, y lo que
   * hay debajo es una imagen, no una superficie del tema. Existe como token
   * para que ninguna pieza escriba un blanco a mano —que es exactamente lo que
   * `inicioPasajera.test.mjs` prohíbe— y para que, si el velo cambia, la tinta
   * cambie en un solo sitio.
   */
  readonly sobreImagen: string;
  /**
   * El amarillo de marca como TEXTO, sólo sobre fotografía con velo oscuro.
   *
   * `acento` no vale como tinta de día (1,27:1 sobre marfil) y por eso existe
   * `acentoTexto`, que baja a ámbar. Pero sobre un velo oscuro el ámbar se
   * ensucia y el amarillo de marca se lee de sobra: es la palabra destacada
   * del hero y de las promociones. Es el mismo valor en los dos esquemas,
   * como `sobreImagen`, y por la misma razón.
   */
  readonly acentoSobreImagen: string;
}

/**
 * NOCHE. Es C2 tal cual se aprobó, sin tocar un valor.
 */
export const ESQUEMA_OSCURO: EsquemaDeColor = {
  fondo: '#0b0a09',
  superficie: '#15140f',
  superficieElevada: '#1f1d18',
  // Coincide con el fondo: sobre grafito, eso ya se lee como un hueco.
  superficieHundida: '#0b0a09',
  borde: '#2a2721',
  acento: AMARILLO.base,
  acentoPresionado: AMARILLO.vivo,
  sobreAcento: AMARILLO.tinta,
  acentoTexto: AMARILLO.base,
  textoPrimario: '#faf9f6',
  textoSecundario: '#adaaa2',
  textoTenue: TEXTO.tenue,
  exito: ESTADO.exito,
  aviso: ESTADO.aviso,
  peligro: ESTADO.peligro,
  informacion: ESTADO.informacion,
  veloDelMapa: '#0b0a09',
  fondoDelMapa: '#15140f',
  calleDelMapa: TEXTO.tenue,
  // Sobre grafito el verde puede subir un punto sin deslumbrar.
  rutaDelMapa: '#22C55E',
  sobreImagen: SOBRE_IMAGEN,
  acentoSobreImagen: AMARILLO.base
};

/**
 * DÍA. Marfil cálido, no blanco.
 *
 * El fondo es `#f2f0ec` y las superficies suben hacia el blanco: así la
 * profundidad se lee por escalones de claridad, igual que en noche se lee por
 * escalones de oscuridad. Con todo en `#ffffff` no habría jerarquía, sólo
 * bordes.
 */
export const ESQUEMA_CLARO: EsquemaDeColor = {
  fondo: '#f2f0ec',
  superficie: '#f8f7f4',
  superficieElevada: '#ffffff',
  // Dos escalones por debajo, no uno. Es el `--x58-surface-sunken` de la web.
  superficieHundida: '#e8e5df',
  // Un borde con alfa se adapta a la superficie que tenga debajo; uno sólido
  // se ve gris sobre blanco y casi negro sobre el marfil.
  borde: 'rgba(20, 18, 14, 0.14)',
  acento: AMARILLO.base,
  acentoPresionado: AMARILLO.intenso,
  sobreAcento: '#1a1500',
  acentoTexto: '#8f6400',
  textoPrimario: '#191713',
  textoSecundario: '#56534c',
  textoTenue: '#6f6b61',
  exito: '#0f7350',
  aviso: '#a35c00',
  peligro: '#c62839',
  informacion: '#1668a8',
  // Blanco: sobre un mapa claro, un velo negro lo ensucia.
  veloDelMapa: '#ffffff',
  // Un escalón por debajo del fondo. Es el `--x58-surface-sunken` de la web, y
  // aquí hace de asfalto: sobre él, las calles blancas se ven.
  fondoDelMapa: '#e8e5df',
  calleDelMapa: '#ffffff',
  // Un punto mas profundo que en noche: sobre marfil y calles blancas, el
  // #22C55E puro empieza a lavarse.
  rutaDelMapa: '#15A34A',
  sobreImagen: SOBRE_IMAGEN,
  acentoSobreImagen: AMARILLO.base
};

/**
 * Las sombras.
 *
 * En noche casi no hay: la profundidad viene del contraste entre superficies, y
 * una sombra fuerte sobre grafito se ve como una mancha sucia.
 *
 * En día son al revés: sobre marfil las superficies claras se confunden entre
 * sí y la sombra es lo único que las separa. Los valores salen del mismo sitio
 * que los colores, `--x58-shadow-*`.
 */
export const SOMBRA_POR_ESQUEMA = {
  oscuro: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  claro: {
    shadowColor: '#18140c',
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  }
} as const;

/** Cuánto aclaran las calles sobre las manzanas, en cada esquema. */
export const OPACIDAD_DE_CALLE_POR_ESQUEMA = {
  // Calles claras sobre manzanas oscuras.
  oscuro: 0.28,
  // Al revés: en un mapa claro las calles son BLANCAS y las manzanas, marfil.
  // Con el mismo tratamiento que en noche, el mapa de día saldría con rayas
  // grises sobre blanco y parecería roto.
  claro: 0.55
} as const;

/** Los grafitos siguen aquí para el arranque, que es oscuro en los dos temas. */
export { GRAFITO };
