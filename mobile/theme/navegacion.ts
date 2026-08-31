/**
 * Los destinos de las dos barras.
 *
 * Están aquí y no dentro del componente porque son una decisión de producto
 * —qué merece uno de los cinco sitios— y no un detalle de cómo se pinta.
 *
 * Separarlos tiene una ventaja concreta: el dibujo de revisión los importa de
 * aquí en lugar de repetirlos. Si estuvieran escritos en dos sitios, renombrar
 * una pestaña dejaría el navegador enseñando la de antes.
 */

/** Los iconos que existen. Coincide con `ui/Icono.tsx`. */
export type NombreDeIcono =
  | 'inicio' | 'destino' | 'viajes' | 'perfil' | 'moto' | 'escudo'
  | 'reloj' | 'rayo' | 'maletin' | 'campana' | 'ajustes' | 'dolar';

export interface DestinoDeNavegacion {
  readonly clave: string;
  readonly icono: NombreDeIcono;
  readonly etiqueta: string;
}

/**
 * Los destinos de la pasajera.
 *
 * «Historial» y no «Viajes»: lo que hay ahí son los que YA hiciste, y «Viajes»
 * en una aplicación de viajes no distingue nada.
 *
 * «Viaje seguro» y no «Seguridad»: dice de qué va y es el nombre que la marca
 * ya usa. «Seguridad» a secas suena a ajustes de contraseña.
 *
 * Son los que la aplicación tiene de verdad. No hay comida, ni tienda, ni
 * paquetería: +58express es mototaxi, y una rejilla de servicios que no existen
 * sería prometer lo que no hay.
 */
export const DESTINOS_DE_PASAJERA: readonly DestinoDeNavegacion[] = Object.freeze([
  { clave: 'inicio', icono: 'inicio', etiqueta: 'Inicio' },
  { clave: 'historial', icono: 'reloj', etiqueta: 'Historial' },
  { clave: 'viaje-seguro', icono: 'escudo', etiqueta: 'Viaje seguro' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);

/**
 * Los del conductor. Cuatro, con la disponibilidad en el centro.
 *
 * «Saldo» ocupa el sitio que tenía «Jornada»: las cifras de la jornada ya salen
 * al tocar el disco, así que una pestaña para repetirlas gastaba uno de los
 * cuatro sitios en algo que ya estaba a un toque.
 */
export const DESTINOS_DE_CONDUCTOR: readonly DestinoDeNavegacion[] = Object.freeze([
  { clave: 'mapa', icono: 'inicio', etiqueta: 'Mapa' },
  { clave: 'saldo', icono: 'dolar', etiqueta: 'Saldo' },
  { clave: 'historial', icono: 'viajes', etiqueta: 'Historial' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);
