const normalizeVehicleType = (value = '') => {
  const normalized = String(value).trim().toUpperCase();
  return ['CAR', 'AUTO', 'AUTOMOVIL', 'AUTOMÓVIL'].includes(normalized) ? 'CAR' : 'MOTO';
};

const VEHICLE_ASSETS = Object.freeze({
  MOTO: Object.freeze({
    card: '/vehicles/moto-real.png',
    map: '/vehicles/moto-map-real.png',
    label: 'Motocicleta'
  }),
  CAR: Object.freeze({
    card: '/vehicles/car-real.png',
    map: '/vehicles/car-map-real.png',
    label: 'Automóvil'
  })
});

export function getVehicleAsset(type, variant = 'card') {
  const vehicle = VEHICLE_ASSETS[normalizeVehicleType(type)];
  return vehicle[variant] || vehicle.card;
}

export function vehicleImage(type, options = {}) {
  const normalizedType = normalizeVehicleType(type);
  const vehicle = VEHICLE_ASSETS[normalizedType];
  const className = options.className ? ` ${options.className}` : '';
  const variant = options.variant === 'map' ? 'map' : 'card';
  const alt = options.decorative ? '' : (options.alt || vehicle.label);
  const ariaHidden = options.decorative ? ' aria-hidden="true"' : '';

  return `<img class="real-vehicle-image real-vehicle-${normalizedType.toLowerCase()}${className}" src="${vehicle[variant]}" alt="${alt}" draggable="false" decoding="async"${ariaHidden}>`;
}

export { normalizeVehicleType };
