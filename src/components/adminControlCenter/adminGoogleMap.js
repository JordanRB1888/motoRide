import { createGoogleMapEngine } from '../googleMapEngine.js';
import { createLeafletEngine } from '../leafletMapEngine.js';
import { getGoogleMapsLoader } from '../../services/googleMapsService.js';
import { readAppliedTheme } from '../../utils/themePreference.js';

const unavailableCopy = () => [
  'El mapa no pudo cargarse',
  'La información operativa sigue disponible. Revisa la conexión e inténtalo de nuevo.'
];

export function renderGoogleMapsUnavailable(container, error) {
  const [title, detail] = unavailableCopy(error?.message);
  container.innerHTML = `<div class="cc-map-unavailable" role="status"><span>MAP</span><h3>${title}</h3><p>${detail}</p></div>`;
}

function attachThemeLifecycle(engine) {
  if (!engine) return null;
  const onTheme = event => engine.setTheme(event.detail?.theme || readAppliedTheme(document.documentElement));
  window.addEventListener('58express:theme-change', onTheme);
  const destroyEngine = engine.destroy.bind(engine);
  engine.destroy = () => {
    window.removeEventListener('58express:theme-change', onTheme);
    destroyEngine();
  };
  return engine;
}

function createFreeFallback({ container, center, zoom }) {
  if (!container?.isConnected) return null;
  container.replaceChildren();
  container.classList.add('cc-admin-map', 'cc-admin-map--leaflet');
  const engine = createLeafletEngine({
    container,
    center,
    zoom,
    theme: readAppliedTheme(document.documentElement)
  });
  const destroyEngine = engine.destroy.bind(engine);
  engine.destroy = () => {
    destroyEngine();
    container.classList.remove('cc-admin-map', 'cc-admin-map--leaflet');
  };
  return engine;
}

/**
 * Google sigue siendo el proveedor preferido cuando tenga una clave válida.
 * Hasta entonces —o si su script falla— el Admin usa el respaldo gratuito
 * Leaflet + OpenStreetMap que ya forma parte de la aplicación.
 */
export async function createAdminGoogleMap({ container, center = { lat: 10.6427, lng: -71.6125 }, zoom = 13 } = {}) {
  const loader = getGoogleMapsLoader();
  try {
    if (!loader.isConfigured()) {
      return attachThemeLifecycle(createFreeFallback({ container, center, zoom }));
    }

    const maps = await loader.load();
    if (!container?.isConnected) return null;
    container.replaceChildren();
    container.classList.add('cc-admin-map', 'cc-admin-map--google');
    const engine = createGoogleMapEngine({
      maps,
      container,
      center,
      zoom,
      theme: readAppliedTheme(document.documentElement)
    });
    const destroyEngine = engine.destroy.bind(engine);
    engine.destroy = () => {
      destroyEngine();
      container.classList.remove('cc-admin-map', 'cc-admin-map--google');
    };
    return attachThemeLifecycle(engine);
  } catch (error) {
    try {
      return attachThemeLifecycle(createFreeFallback({ container, center, zoom }));
    } catch (fallbackError) {
      if (container?.isConnected) renderGoogleMapsUnavailable(container, fallbackError || error);
      return null;
    }
  }
}
