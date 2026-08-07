export const APP_NAME = '+58express';
export const APP_VERSION = '1.0.0';
export const DEFAULT_CENTER = [10.6427, -71.6125]; // Maracaibo Basílica
export const DEFAULT_ZOOM = 14;
export const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const MAP_TILE_ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO';
export const OSRM_API = 'https://router.project-osrm.org/route/v1/driving';
export const NOMINATIM_API = 'https://nominatim.openstreetmap.org';

// Trip States FSM
export const TRIP_STATES = {
  DRAFT: 'DRAFT',
  SEARCHING: 'SEARCHING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_EN_ROUTE: 'DRIVER_EN_ROUTE',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  IN_TRIP: 'IN_TRIP',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

// Valid state transitions
export const TRIP_TRANSITIONS = {
  DRAFT: ['SEARCHING', 'CANCELLED'],
  SEARCHING: ['DRIVER_ASSIGNED', 'CANCELLED'],
  DRIVER_ASSIGNED: ['DRIVER_EN_ROUTE', 'CANCELLED'],
  DRIVER_EN_ROUTE: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['IN_TRIP', 'CANCELLED'],
  IN_TRIP: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

export const PAYMENT_METHODS = {
  WALLET: { id: 'WALLET', name: 'Wallet +58express', icon: 'wallet', color: '#FFC107' },
  PAGO_MOVIL: { id: 'PAGO_MOVIL', name: 'Pago Móvil', icon: 'smartphone', color: '#00E676' },
  ZELLE: { id: 'ZELLE', name: 'Zelle', icon: 'dollar-sign', color: '#6C2BD9' },
  ZINLI: { id: 'ZINLI', name: 'Zinli', icon: 'credit-card', color: '#00D2FF' },
  EFECTIVO: { id: 'EFECTIVO', name: 'Efectivo', icon: 'banknote', color: '#94A3B8' }
};

export const PRICING_CONFIG = {
  MOTO: {
    baseFareUSD: 0.50,
    perKmUSD: 0.30,
    perMinUSD: 0.05,
    minimumFareUSD: 1.50,
    label: 'MotoTaxi',
    icon: 'bike'
  }
};

export const BCV_RATE = 874.50; // VES per EUR/USD BCV Rate
export const SYSTEM_COMMISSION = 0.15; // 15%
export const DRIVER_ACCEPT_TIMEOUT = 15; // seconds
export const SEARCH_RADIUS_KM = 3.0;
export const GPS_UPDATE_INTERVAL = 1500; // ms
export const SIMULATION_SPEED_KMH = 30;

export const DRIVER_STATUS = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  BUSY: 'BUSY',
  EN_ROUTE: 'EN_ROUTE',
  IN_TRIP: 'IN_TRIP'
};

export const USER_ROLES = {
  PASSENGER: 'passenger',
  DRIVER: 'driver',
  ADMIN: 'admin'
};
