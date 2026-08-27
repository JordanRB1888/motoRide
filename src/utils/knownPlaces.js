/**
 * Destinos predefinidos — ÚNICO lugar donde viven sus coordenadas.
 *
 * Antes cada acceso rápido llevaba data-lat/data-lon escritos a mano en el
 * HTML de la pantalla: cuatro copias frágiles imposibles de auditar. Ahora la
 * pantalla los genera desde aquí y una corrección se hace en un solo sitio.
 *
 * Las coordenadas son las MISMAS que llevaba el marcado (no se sustituyó
 * ningún lugar): su exactitud física está pendiente de confirmación del
 * propietario, que conoce la ciudad — ver `verified`. Un preset sin
 * `googlePlaceId` es normal: los Place IDs no se inventan; se añadirán solo
 * cuando se conozcan con certeza.
 */

export const KNOWN_PLACES = Object.freeze([
  Object.freeze({
    id: 'basilica-chiquinquira',
    label: 'Basílica de La Chiquinquirá',
    secondary: 'Casco Central, Maracaibo',
    searchName: 'Basílica de Nuestra Señora de Chiquinquirá, Maracaibo',
    lat: 10.6427,
    lng: -71.6125,
    icon: 'home',
    tone: 'rgba(255,193,7,0.15)',
    color: 'var(--x58-yellow-text)',
    googlePlaceId: null,
    verified: false
  }),
  Object.freeze({
    id: 'sambil-maracaibo',
    label: 'Sambil Maracaibo',
    secondary: 'Av. Goajira, Maracaibo',
    searchName: 'Centro Comercial Sambil Maracaibo',
    lat: 10.6975,
    lng: -71.6342,
    icon: 'briefcase',
    tone: 'rgba(0,210,255,0.15)',
    color: 'var(--accent-secondary)',
    googlePlaceId: null,
    verified: false
  }),
  Object.freeze({
    id: 'vereda-del-lago',
    label: 'Vereda del Lago',
    secondary: 'Av. El Milagro, Maracaibo',
    searchName: 'Vereda del Lago Maracaibo',
    lat: 10.6658,
    lng: -71.5975,
    icon: 'mapPin',
    tone: 'rgba(0,230,118,0.15)',
    color: 'var(--success)',
    googlePlaceId: null,
    verified: false
  }),
  Object.freeze({
    id: 'cinco-de-julio-calle-72',
    label: '5 de Julio / Calle 72',
    secondary: 'Sector Tierra Negra, Maracaibo',
    searchName: 'Calle 72 / 5 de Julio, Maracaibo',
    lat: 10.6689,
    lng: -71.6167,
    icon: 'mapPin',
    tone: 'rgba(255,152,0,0.15)',
    color: 'var(--warning)',
    googlePlaceId: null,
    verified: false
  })
]);

export function findKnownPlace(id) {
  return KNOWN_PLACES.find(lugar => lugar.id === id) ?? null;
}
