export const MARACAIBO_SERVICE_CENTER = Object.freeze({ lat: 10.6427, lng: -71.6125 });
export const MARACAIBO_SERVICE_RADIUS_KM = 60;

function radians(value) {
  return Number(value) * Math.PI / 180;
}

export function distanceFromMaracaiboKm(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng ?? location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Infinity;

  const center = MARACAIBO_SERVICE_CENTER;
  const dLat = radians(lat - center.lat);
  const dLng = radians(lng - center.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(center.lat)) * Math.cos(radians(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideMaracaiboServiceArea(location) {
  return distanceFromMaracaiboKm(location) <= MARACAIBO_SERVICE_RADIUS_KM;
}
