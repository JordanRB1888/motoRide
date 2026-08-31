/**
 * Los tokens de diseño de +58express en móvil.
 *
 * DERIVADOS, NO INVENTADOS
 *
 * Los valores salen de la identidad que ya existe en la web
 * (`src/styles/design-system.css`, variables `--x58-*`) y del manifiesto PWA.
 * No se ha rediseñado nada ni se ha elegido ningún color nuevo: el amarillo es
 * el mismo `#ffd21f` que declara `theme_color`, y el grafito el mismo `#0e0d0b`
 * de `background_color`.
 *
 * POR QUÉ NO SE COPIA EL CSS
 *
 * React Native no tiene cascada, ni variables CSS, ni unidades relativas al
 * documento. Traducir la hoja de estilos entera produciría un objeto enorme del
 * que el 90% no aplica. Lo que se traslada es la ESCALA: los mismos escalones
 * de superficie, la misma familia de amarillos y la misma jerarquía de texto.
 *
 * EL TEMA OSCURO ES EL PRINCIPAL
 *
 * Igual que en la web. La estructura admite un tema claro —los tokens están
 * agrupados por rol, no por color— pero esta fase no lo termina: prometer dos
 * temas y entregar uno a medias es peor que entregar uno bien.
 */

/** La familia de amarillos de la marca. */
const AMARILLO = {
  base: '#ffd21f',
  hover: '#ffc400',
  active: '#ffb800',
  /** Tinta sobre amarillo: el texto que va ENCIMA del botón amarillo. */
  ink: '#1a1500'
} as const;

/** Los escalones de superficie del tema oscuro, de más hundido a más elevado. */
const GRAFITO = {
  sunken: '#0a0908',
  base: '#0e0d0b',
  raised: '#161512',
  overlay: '#1e1c19',
  elevated: '#262420'
} as const;

export const colores = {
  /** Fondo de la aplicación. */
  fondo: GRAFITO.base,
  fondoHundido: GRAFITO.sunken,
  superficie: GRAFITO.raised,
  superficieElevada: GRAFITO.elevated,
  borde: '#2e2b26',

  /** La acción principal. Amarillo sobre grafito: la marca. */
  acento: AMARILLO.base,
  acentoPresionado: AMARILLO.active,
  /** Lo que se escribe ENCIMA del acento. Nunca blanco: no contrasta. */
  sobreAcento: AMARILLO.ink,

  textoPrimario: '#f7f6f3',
  textoSecundario: '#a3a09a',
  textoTenue: '#817e77',

  exito: '#55e29a',
  aviso: '#ffa726',
  peligro: '#ff6878',
  informacion: '#63c9ff'
} as const;

/**
 * Escala de espaciado, en múltiplos de 4.
 *
 * Un solo sistema para márgenes, rellenos y huecos. Sin números sueltos
 * repartidos por las pantallas.
 */
export const espaciado = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48
} as const;

export const radios = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  /** Para píldoras y avatares. */
  completo: 999
} as const;

/**
 * Escala tipográfica.
 *
 * Los tamaños son puntos de React Native, que ya se escalan con los ajustes de
 * accesibilidad del sistema. No se fija `allowFontScaling: false` en ningún
 * sitio: quien necesita el texto grande tiene derecho a verlo grande.
 */
export const tipografia = {
  display: { tamano: 32, alto: 38, peso: '700' },
  titulo: { tamano: 24, alto: 30, peso: '700' },
  subtitulo: { tamano: 18, alto: 24, peso: '600' },
  cuerpo: { tamano: 16, alto: 22, peso: '400' },
  cuerpoFuerte: { tamano: 16, alto: 22, peso: '600' },
  pie: { tamano: 13, alto: 18, peso: '400' }
} as const;

/**
 * Elevación.
 *
 * iOS y Android la expresan distinto —sombra frente a `elevation`— así que cada
 * nivel trae las dos. Quien la usa no tiene que acordarse de la diferencia.
 */
export const elevacion = {
  ninguna: {
    shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 }, elevation: 0
  },
  suave: {
    shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3
  },
  media: {
    shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 8
  }
} as const;

/**
 * Área táctil mínima.
 *
 * 48 puntos. Las guías de Apple piden 44 y las de Material 48; se toma el mayor
 * de los dos, que cumple con ambas. No es un detalle estético: por debajo de eso
 * la gente falla el toque, y esto es una aplicación que se usa en la calle, con
 * una mano y en movimiento.
 */
export const AREA_TACTIL_MINIMA = 48;

export const tema = {
  colores,
  espaciado,
  radios,
  tipografia,
  elevacion,
  AREA_TACTIL_MINIMA
} as const;

export type Tema = typeof tema;
