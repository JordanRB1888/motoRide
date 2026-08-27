/**
 * Ubicación canónica — MAPS-2A.
 *
 * Un destino elegido se convierte en UN objeto inmutable con identidad y
 * coordenadas definitivas. A partir de ahí, lat/lng son LA autoridad: el
 * marcador, la ruta y el payload del viaje leen del mismo objeto, y ningún
 * texto vuelve a geocodificarse. Aquí muere la deriva de coordenadas.
 *
 * El contrato es neutro de proveedor y de plataforma: hoy lo llenan Google
 * Places, Nominatim, los destinos predefinidos y el GPS del dispositivo;
 * mañana podrán llenarlo los buscadores nativos de Android/iOS. El estado de
 * la aplicación JAMÁS guarda objetos crudos del SDK de un proveedor.
 */

export const LOCATION_PROVIDER = Object.freeze({
  GOOGLE: 'google',
  NOMINATIM: 'nominatim',
  PRESET: 'preset',
  GPS: 'gps',
  /** Punto tocado directamente en el mapa: coordenadas elegidas a dedo. */
  MANUAL: 'manual'
});

const PROVEEDORES = new Set(Object.values(LOCATION_PROVIDER));

const coordenada = (valor, limite) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && Math.abs(numero) <= limite ? numero : null;
};

const texto = valor => {
  const limpio = String(valor ?? '').trim();
  return limpio.length ? limpio.slice(0, 240) : null;
};

/**
 * Construye la ubicación canónica. Devuelve null si falta lo esencial:
 * proveedor válido, nombre visible y coordenadas reales.
 * El objeto sale CONGELADO: una vez elegido, nadie lo muta.
 */
export function createCanonicalLocation({
  provider,
  placeId = null,
  displayName,
  formattedAddress = null,
  lat,
  lng
} = {}) {
  if (!PROVEEDORES.has(provider)) return null;
  const nombre = texto(displayName);
  const latitud = coordenada(lat, 90);
  const longitud = coordenada(lng, 180);
  if (!nombre || latitud === null || longitud === null) return null;

  return Object.freeze({
    provider,
    placeId: texto(placeId),
    displayName: nombre,
    formattedAddress: texto(formattedAddress),
    lat: latitud,
    lng: longitud
  });
}

/** Resultado de Nominatim ({display_name, lat, lon}) → canónico. */
export function fromNominatimResult(item) {
  return createCanonicalLocation({
    provider: LOCATION_PROVIDER.NOMINATIM,
    placeId: item?.place_id != null ? String(item.place_id) : null,
    displayName: item?.display_name,
    formattedAddress: item?.display_name,
    lat: item?.lat,
    lng: item?.lon ?? item?.lng
  });
}

/** Destino predefinido del módulo knownPlaces → canónico. */
export function fromPreset(preset) {
  return createCanonicalLocation({
    provider: LOCATION_PROVIDER.PRESET,
    placeId: preset?.googlePlaceId ?? null,
    displayName: preset?.label,
    formattedAddress: preset?.secondary ?? null,
    lat: preset?.lat,
    lng: preset?.lng
  });
}

/**
 * Muestra GPS aceptada (GPS-1) → canónico. Las coordenadas son EXACTAMENTE
 * las de la muestra: cualquier texto es solo presentación y jamás vuelve a
 * convertirse en coordenadas.
 */
export function fromGpsSample(sample, { displayName = 'Mi ubicación actual' } = {}) {
  return createCanonicalLocation({
    provider: LOCATION_PROVIDER.GPS,
    displayName,
    lat: sample?.lat,
    lng: sample?.lng
  });
}

/** Punto tocado en el mapa → canónico. El texto es solo presentación. */
export function fromMapPoint({ lat, lng, displayName = 'Punto de Destino en Maracaibo' } = {}) {
  return createCanonicalLocation({
    provider: LOCATION_PROVIDER.MANUAL,
    displayName,
    lat,
    lng
  });
}

/**
 * Lugar de Google Places (New) YA resuelto a campos planos → canónico.
 * Quien llama extrae los campos del objeto del SDK; aquí no entra ningún
 * objeto crudo de Google.
 */
export function fromGooglePlaceFields({ placeId, displayName, formattedAddress, lat, lng } = {}) {
  return createCanonicalLocation({
    provider: LOCATION_PROVIDER.GOOGLE,
    placeId,
    displayName,
    formattedAddress,
    lat,
    lng
  });
}
