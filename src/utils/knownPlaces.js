/**
 * Destinos predefinidos — ÚNICO lugar donde viven sus coordenadas.
 *
 * Antes cada acceso rápido llevaba data-lat/data-lon escritos a mano en el
 * HTML de la pantalla: cuatro copias frágiles imposibles de auditar. Ahora la
 * pantalla los genera desde aquí y una corrección se hace en un solo sitio.
 *
 * PRESETS-1: la Basílica y el Sambil llevan las coordenadas CANÓNICAS
 * verificadas contra Google Places en producción (la auditoría de activación
 * midió 335 m y 2,8 km de error en las heredadas) — `verified: true`. La
 * Vereda del Lago y 5 de Julio/Calle 72 conservan sus coordenadas heredadas
 * a propósito: el parque es enorme (¿qué entrada?) y la esquina de la Calle
 * 72 no es el «5 de julio» genérico que resuelve Google (Calle 76); ambos
 * esperan la decisión explícita del propietario — `verified: false`. Un
 * preset sin `googlePlaceId` es normal: los Place IDs no se inventan.
 */

export const KNOWN_PLACES = Object.freeze([
  Object.freeze({
    id: 'basilica-chiquinquira',
    label: 'Basílica de La Chiquinquirá',
    secondary: 'Casco Central, Maracaibo',
    searchName: 'Basílica de Nuestra Señora de Chiquinquirá, Maracaibo',
    // Canónica de Google Places (auditoría de activación MAPS-2A): la
    // heredada era el centro nominal del área de servicio, a ~335 m.
    lat: 10.64290,
    lng: -71.61556,
    icon: 'home',
    tone: 'rgba(255,193,7,0.15)',
    color: 'var(--x58-yellow-text)',
    googlePlaceId: null,
    verified: true
  }),
  Object.freeze({
    id: 'sambil-maracaibo',
    label: 'Sambil Maracaibo',
    secondary: 'Av. Goajira, Maracaibo',
    searchName: 'Centro Comercial Sambil Maracaibo',
    // Canónica de Google Places (auditoría de activación MAPS-2A): la
    // heredada caía a ~2,8 km del centro comercial.
    lat: 10.72277,
    lng: -71.63268,
    icon: 'briefcase',
    tone: 'rgba(0,210,255,0.15)',
    color: 'var(--accent-secondary)',
    googlePlaceId: null,
    verified: true
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
