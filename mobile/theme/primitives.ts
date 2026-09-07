/**
 * Los valores crudos. La capa de abajo del sistema.
 *
 * Aquí no hay decisiones de diseño, sólo materia prima: qué amarillos existen,
 * qué grafitos existen. Ninguna pantalla debe importar de este fichero — lo
 * hacen las direcciones visuales, que asignan cada valor a un ROL
 * (`fondo`, `acento`, `textoPrimario`) y son lo que consume la interfaz.
 *
 * Separarlo importa: cuando el dueño diga «el amarillo un punto más cálido», se
 * cambia aquí una vez y las tres direcciones lo heredan. Si cada pantalla
 * escribiera `#ffd21f`, habría que buscarlo por toda la aplicación.
 *
 * DE DÓNDE SALEN
 *
 * De la identidad que ya existe: `src/styles/design-system.css` (variables
 * `--x58-*`) y el manifiesto PWA. No se ha inventado ningún color.
 */

/** Los amarillos de la marca. `base` es el `theme_color` del manifiesto. */
export const AMARILLO = {
  /** Para acentos muy tenues sobre grafito. */
  tenue: '#4a3d00',
  suave: '#8a6f00',
  base: '#ffd21f',
  vivo: '#ffc400',
  intenso: '#ffb800',
  /** La tinta que va ENCIMA del amarillo. Nunca blanco: no contrasta. */
  tinta: '#1a1500'
} as const;

/**
 * Los grafitos, del más hundido al más elevado.
 *
 * Ninguno es `#000000` puro, y es deliberado: el negro absoluto aplasta la
 * profundidad —todo lo que se ponga encima parece flotar igual— y en pantallas
 * OLED produce bordes duros donde debería haber transición.
 */
export const GRAFITO = {
  abismo: '#070605',
  fondo: '#0e0d0b',
  superficie: '#161512',
  elevada: '#1e1c19',
  flotante: '#262420',
  borde: '#2e2b26',
  bordeVivo: '#3d3933'
} as const;

/** La escala de texto sobre fondo oscuro. */
export const TEXTO = {
  primario: '#f7f6f3',
  secundario: '#a3a09a',
  tenue: '#817e77',
  desactivado: '#5d5a54'
} as const;

/** Estados. Elegidos para leerse sobre grafito, no sobre blanco. */
export const ESTADO = {
  exito: '#55e29a',
  exitoTenue: '#153a2c',
  aviso: '#ffa726',
  avisoTenue: '#3d2c10',
  peligro: '#ff6878',
  peligroTenue: '#3d1a20',
  informacion: '#63c9ff',
  informacionTenue: '#12303f'
} as const;

/**
 * La escala de espaciado, en múltiplos de 4.
 *
 * Las direcciones eligen cuánta usan —una es más aireada, otra más compacta—
 * pero todas parten de los mismos escalones. Así dos pantallas de direcciones
 * distintas siguen alineando entre sí.
 */
export const ESPACIO = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 32,
  '8': 40,
  '9': 48,
  '10': 64
} as const;

/** Área táctil mínima: el mayor entre los 44 de Apple y los 48 de Material. */
export const AREA_TACTIL_MINIMA = 48;

/**
 * La tinta sobre fotografía con velo oscuro. Blanco cálido, el mismo que el
 * texto principal de noche, porque lo que hay debajo es siempre una imagen
 * oscurecida y no una superficie del tema. La usan los dos esquemas y las
 * direcciones; el número vive sólo aquí.
 */
export const SOBRE_IMAGEN = '#faf9f6';
