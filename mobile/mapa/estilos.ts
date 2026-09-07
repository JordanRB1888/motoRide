/**
 * Cómo se ve el mapa de día y de noche — CUANDO NO MANDA GOOGLE CLOUD.
 *
 * QUIÉN MANDA AHORA
 *
 * El dueño diseñó el mapa en Cloud-based Maps Styling y lo asoció a un
 * identificador por plataforma. Con identificador, **la autoridad visual es
 * Google Cloud** y esto no se aplica: el aspecto se cambia en la consola de
 * Google, sin tocar código ni publicar una versión.
 *
 * Y no es que se prefiera uno: **no pueden convivir**. Google ignora el JSON
 * de estilo en cuanto hay identificador de mapa y lo avisa por consola. Tener
 * los dos puestos sería mentir sobre de dónde sale lo que se ve, y el día que
 * alguien cambie estos colores no pasaría nada y no sabría por qué.
 * `estiloLocalSiHaceFalta()` es el único sitio donde se decide.
 *
 * ENTONCES ¿POR QUÉ SIGUE ESTO AQUÍ?
 *
 * Porque sin identificador el mapa saldría con los colores de fábrica de
 * Google —carreteras naranjas, agua azul brillante— dentro de una aplicación
 * grafito y amarilla. Esto es la red: cubre el arranque de un entorno recién
 * clonado y el día que un identificador se borre o caduque.
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
  { elementType: 'geometry', stylers: [{ color: '#fcfaf6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6862' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e2decb' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#f3eccf' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a867f' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fef3c7' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#fde68a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde047' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#eab308' }] },

  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#faf6ea' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d8eae8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9aa5a4' }] }
]);

/** El estilo que le toca al esquema que se esté viendo. */
export function estiloDelMapa(esquema: 'claro' | 'oscuro'): readonly ReglaDeEstilo[] {
  return esquema === 'oscuro' ? MAPA_DE_NOCHE : MAPA_DE_DIA;
}

/**
 * UNA SOLA AUTORIDAD SOBRE EL ASPECTO DEL MAPA.
 *
 * Con identificador de mapa devuelve `undefined`, y quien llama no debe pasar
 * ningún JSON de estilo: manda Google Cloud. Sin identificador devuelve el
 * estilo local, que es la red de seguridad.
 *
 * Los dos adaptadores —navegador y teléfono— preguntan aquí. Que la decisión
 * viva en una función y no repartida en dos ficheros es lo que evita que un
 * día uno de ellos aplique las dos cosas.
 */
export function estiloLocalSiHaceFalta(
  esquema: 'claro' | 'oscuro',
  identificadorDeMapa: string
): readonly ReglaDeEstilo[] | undefined {
  return identificadorDeMapa === '' ? estiloDelMapa(esquema) : undefined;
}
