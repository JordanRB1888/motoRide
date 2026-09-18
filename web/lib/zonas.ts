/**
 * Zonas de enfoque de +58Express.
 *
 * Viven en su propio módulo, sin Leaflet: el componente del mapa lo importa de
 * forma estática, así que si estos datos salieran de allí, cualquier pantalla
 * que los leyera arrastraría Leaflet al servidor — y Leaflet toca `window` al
 * importarse, lo que rompe el render con un 500.
 *
 * Coordenadas aproximadas de cada localidad: sitúan el mapa, no navegan.
 *
 * LAS FOTOS SON LAS MISMAS QUE LAS DE /nosotros, y eso es deliberado.
 *
 * Antes la portada tiraba de `/zonas/*.webp` y `/nosotros` de `/zulia/*.webp`, y
 * eran imágenes distintas: la portada enseñaba una iglesia y `/nosotros` otra
 * para el mismo pueblo. Cualquiera de El Moján lo habría notado. Además, dos de
 * las tres de `/zonas/` eran de procedencia sin confirmar.
 *
 * El tratamiento en blanco y negro de las tarjetas lo hace el CSS
 * (`grayscale` / `grayscale-0` en Cobertura), no el fichero, así que cambiar la
 * fuente no cambia el diseño.
 */
export type Zona = {
  id: string;
  foto: string;
  lugar: string;
  nombre: string;
  nota: string;
  coords: [number, number];
  zoom: number;
};

export const ZONAS: Zona[] = [
  {
    id: "santa-cruz-de-mara",
    foto: "/zulia/santa-cruz-de-mara.webp",
    lugar: "Plaza Bolívar",
    nombre: "Santa Cruz de Mara",
    nota: "Donde arranca la llegada al Municipio Mara.",
    coords: [10.8447, -71.6706],
    zoom: 13,
  },
  {
    id: "el-mojan",
    foto: "/zulia/el-mojan.webp",
    lugar: "San Rafael de El Moján",
    nombre: "El Moján",
    nota: "La capital del municipio, a orillas del lago.",
    coords: [10.9464, -71.7533],
    zoom: 13,
  },
  {
    id: "maracaibo",
    foto: "/zulia/maracaibo.webp",
    lugar: "Basílica de La Chinita",
    nombre: "Maracaibo",
    nota: "La ciudad donde la aplicación abre su mapa.",
    coords: [10.6427, -71.6125],
    zoom: 12,
  },
];
