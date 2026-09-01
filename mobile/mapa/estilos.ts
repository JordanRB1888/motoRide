/**
 * Cómo se ve el mapa de día y de noche.
 *
 * POR QUÉ HAY QUE ESTILARLO
 *
 * El mapa de Google viene claro, con carreteras naranjas y agua azul brillante.
 * Puesto tal cual dentro de +58express en modo noche, la aplicación pasa de
 * grafito y amarillo a un cuadro de colores ajenos, y la moto amarilla —que es
 * la marca— deja de destacar porque compite con todo.
 *
 * Estos estilos hacen lo mismo que el lienzo dibujado: bajar el mapa a fondo y
 * dejar que la información —los vehículos, el origen, el destino— sea lo único
 * que pide atención.
 *
 * LOS COLORES SALEN DEL TEMA
 *
 * No se inventa ninguno: son los mismos grafitos y grises que ya usa la
 * aplicación. Así el mapa parece parte de la pantalla y no una ventana a otra.
 *
 * FORMATO
 *
 * Es el JSON de estilo de Google Maps, el mismo en Android, iOS y navegador.
 * Un solo estilo por tema, aquí; ninguna pantalla define el suyo.
 */

/** Una entrada del estilo de Google. */
export interface ReglaDeEstilo {
  readonly featureType?: string;
  readonly elementType?: string;
  readonly stylers: readonly Record<string, string | number>[];
}

/**
 * Noche: grafito, calles apenas más claras que el fondo, agua más oscura.
 *
 * Los puntos de interés se apagan del todo. Un mapa de movilidad no es un mapa
 * turístico: los restaurantes y los parques compiten con lo único que importa,
 * que es dónde está tu moto.
 */
export const MAPA_DE_NOCHE: readonly ReglaDeEstilo[] = Object.freeze([
  { elementType: 'geometry', stylers: [{ color: '#12110f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6f6b63' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0a09' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2721' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f1d18' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#12110f' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#817e77' }] },
  // Las vías principales, un punto más claras: son la referencia para
  // orientarse de un vistazo.
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#26231d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2e2a23' }] },

  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#141310' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08110f' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a4740' }] }
]);

/**
 * Día: claro y legible, sin la saturación de fábrica.
 *
 * Mismo criterio que la noche: el mapa es el suelo. Se quitan los mismos
 * puntos de interés, para que las dos versiones enseñen lo mismo y cambiar de
 * tema no cambie la información.
 */
export const MAPA_DE_DIA: readonly ReglaDeEstilo[] = Object.freeze([
  { elementType: 'geometry', stylers: [{ color: '#f2f1ee' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6862' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#dcd9d2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e6e3dc' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a867f' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fdf6df' }] },

  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#eeece7' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d9e4e3' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9aa5a4' }] }
]);

/** El estilo que le toca al esquema que se esté viendo. */
export function estiloDelMapa(esquema: 'claro' | 'oscuro'): readonly ReglaDeEstilo[] {
  return esquema === 'oscuro' ? MAPA_DE_NOCHE : MAPA_DE_DIA;
}
