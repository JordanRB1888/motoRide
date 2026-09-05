import { createGoogleMapEngine } from '../googleMapEngine.js';
import { getGoogleMapsLoader } from '../../services/googleMapsService.js';
import { readAppliedTheme } from '../../utils/themePreference.js';

const unavailableCopy = code => code === 'NO_KEY'
  ? ['Google Maps requiere configuración', 'Agrega VITE_GOOGLE_MAPS_API_KEY al entorno local para habilitar el mapa operativo.']
  : ['Google Maps no respondió', 'La operación sigue disponible, pero el mapa no pudo cargarse en este momento.'];

export function renderGoogleMapsUnavailable(container, error) {
  const [title, detail] = unavailableCopy(error?.message);
  container.innerHTML = `<div class="cc-map-unavailable" role="status"><span>MAP</span><h3>${title}</h3><p>${detail}</p></div>`;
}

/** Uses the shared application loader; this module never injects a script. */
export async function createAdminGoogleMap({ container, center = { lat: 10.6427, lng: -71.6125 }, zoom = 13 } = {}) {
  try {
    const maps = await getGoogleMapsLoader().load();
    if (!container?.isConnected) return null;
    container.replaceChildren();
    const engine = createGoogleMapEngine({
      maps,
      container,
      center,
      zoom,
      theme: readAppliedTheme(document.documentElement)
    });
    const onTheme = event => engine.setTheme(event.detail?.theme || readAppliedTheme(document.documentElement));
    window.addEventListener('58express:theme-change', onTheme);
    const destroyEngine = engine.destroy.bind(engine);
    engine.destroy = () => {
      window.removeEventListener('58express:theme-change', onTheme);
      destroyEngine();
    };
    return engine;
  } catch (error) {
    if (container?.isConnected) renderGoogleMapsUnavailable(container, error);
    return null;
  }
}
