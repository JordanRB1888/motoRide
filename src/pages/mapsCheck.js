import { isGoogleMapsConfigured, loadGoogleMaps } from '../services/googleMapsLoader.js';

/**
 * Pantalla de diagnóstico de Google Maps.
 *
 * No forma parte del producto: sirve para comprobar de una vez que la clave, la
 * facturación y las restricciones están bien antes de tocar los mapas reales.
 * Los errores de Google llegan por consola y por `gm_authFailure`, con nombres
 * poco explícitos, así que aquí se traducen a algo accionable.
 *
 * No usa ni muestra ningún dato de personas: centra el mapa en Maracaibo y hace
 * una única búsqueda de prueba.
 */

const MARACAIBO = { lat: 10.6427, lng: -71.6125 };

const PISTAS = {
  RefererNotAllowedMapError: 'La clave no admite este dominio. Añade el referente exacto en Google Cloud → Credenciales → tu clave de navegador → Restricciones de aplicación.',
  InvalidKeyMapError: 'La clave no es válida o se copió con espacios. Revísala en Google Cloud → Credenciales.',
  ApiNotActivatedMapError: 'La clave es válida pero falta habilitar la API. Ve a APIs y servicios → Biblioteca y habilita Maps JavaScript API.',
  BillingNotEnabledMapError: 'El proyecto no tiene facturación activa. Google Maps no funciona sin una cuenta de facturación asociada.',
  ExpiredKeyMapError: 'La clave caducó o fue revocada. Genera una nueva.'
};

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function renderMapsCheck(container) {
  container.innerHTML = `
    <div style="max-width:820px;margin:0 auto;padding:24px 16px 80px;font-family:inherit;">
      <h1 style="margin:0 0 4px;font-size:1.4rem;">Diagnóstico de Google Maps</h1>
      <p style="margin:0 0 20px;opacity:.75;font-size:.9rem;">
        Pantalla temporal de verificación. No usa datos de personas.
      </p>
      <div id="maps-check-results" style="display:grid;gap:10px;margin-bottom:20px;"></div>
      <div id="maps-check-map"
           style="height:340px;border-radius:16px;overflow:hidden;background:var(--surface-elevated,#1a1d27);"></div>
      <div id="maps-check-places" style="margin-top:20px;"></div>
    </div>
  `;

  const resultados = container.querySelector('#maps-check-results');

  const fila = (estado, titulo, detalle = '') => {
    const colores = { ok: '#00E676', fallo: '#FF5252', espera: '#FFC107' };
    const simbolos = { ok: '✓', fallo: '✗', espera: '…' };
    const div = document.createElement('div');
    div.style.cssText = `display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--surface-elevated,#1a1d27);border-left:4px solid ${colores[estado]};`;
    div.innerHTML = `
      <strong style="color:${colores[estado]};font-size:1.1rem;line-height:1.2;">${simbolos[estado]}</strong>
      <div>
        <div style="font-weight:600;">${escape(titulo)}</div>
        ${detalle ? `<div style="opacity:.8;font-size:.85rem;margin-top:4px;line-height:1.45;">${escape(detalle)}</div>` : ''}
      </div>`;
    resultados.appendChild(div);
    return div;
  };

  // Google avisa de los errores de clave por este global, no por la promesa.
  const avisoAutenticacion = new Promise(resolve => {
    window.gm_authFailure = () => resolve(true);
  });

  (async () => {
    if (!isGoogleMapsConfigured()) {
      fila('fallo', 'Falta la clave del navegador',
        'Crea un archivo .env en la raíz del proyecto con VITE_GOOGLE_MAPS_BROWSER_KEY=tu-clave y reinicia npm run dev. Vite solo lee .env al arrancar.');
      return;
    }
    fila('ok', 'Clave presente', `Origen actual: ${window.location.origin}`);

    const cargando = fila('espera', 'Cargando la API de Google Maps…');

    let maps;
    try {
      maps = await Promise.race([
        loadGoogleMaps(),
        avisoAutenticacion.then(() => { throw Object.assign(new Error('gm_authFailure'), { code: 'AUTH' }); })
      ]);
    } catch (error) {
      cargando.remove();
      fila('fallo', 'La API no cargó',
        error.code === 'AUTH'
          ? 'Google rechazó la clave. Abre la consola del navegador (F12): el mensaje exacto aparece ahí y empieza por algo como RefererNotAllowedMapError o BillingNotEnabledMapError. Debajo tienes qué significa cada uno.'
          : String(error.message || error));
      for (const [nombre, pista] of Object.entries(PISTAS)) fila('espera', nombre, pista);
      return;
    }

    cargando.remove();
    fila('ok', 'API cargada', `Versión ${maps.version || 'desconocida'}`);

    // 1. Mapa
    try {
      const map = new maps.Map(container.querySelector('#maps-check-map'), {
        center: MARACAIBO,
        zoom: 13,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        zoomControl: true
      });
      new maps.marker.AdvancedMarkerElement({ map, position: MARACAIBO, title: 'Maracaibo' });
      fila('ok', 'Maps JavaScript API', 'El mapa se dibujó y el marcador avanzado funciona.');
    } catch (error) {
      fila('fallo', 'Maps JavaScript API', String(error.message || error));
    }

    // 2. Places — el que sustituirá a Nominatim
    try {
      const { AutocompleteSuggestion } = await maps.importLibrary('places');
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: 'Bella Vista',
        includedRegionCodes: ['ve'],
        locationBias: { center: MARACAIBO, radius: 20000 }
      });
      const cuantas = suggestions?.length || 0;
      fila(cuantas ? 'ok' : 'fallo', 'Places API (New)',
        cuantas ? `Devolvió ${cuantas} sugerencias para «Bella Vista».` : 'Respondió sin sugerencias. Comprueba que Places API (New) esté habilitada.');
      if (cuantas) {
        const lista = suggestions.slice(0, 4)
          .map(s => `<li style="margin:4px 0;">${escape(s.placePrediction?.text?.text || '')}</li>`).join('');
        container.querySelector('#maps-check-places').innerHTML =
          `<div style="padding:14px;border-radius:12px;background:var(--surface-elevated,#1a1d27);">
             <strong style="font-size:.9rem;">Sugerencias de prueba</strong>
             <ul style="margin:8px 0 0;padding-left:18px;font-size:.88rem;opacity:.85;">${lista}</ul>
           </div>`;
      }
    } catch (error) {
      fila('fallo', 'Places API (New)',
        `${String(error.message || error)} — si menciona que no está habilitada, actívala en APIs y servicios → Biblioteca. Ojo: debe ser Places API (New), no la clásica.`);
    }

    // 3. Geocoding
    try {
      const { Geocoder } = await maps.importLibrary('geocoding');
      const { results } = await new Geocoder().geocode({ location: MARACAIBO });
      fila(results?.length ? 'ok' : 'fallo', 'Geocoding API',
        results?.length ? `Resolvió la coordenada de prueba a: ${results[0].formatted_address}` : 'No devolvió resultados.');
    } catch (error) {
      fila('fallo', 'Geocoding API', String(error.message || error));
    }

    fila('espera', 'Routes API', 'No se comprueba aquí: se llama desde el servidor con la otra clave. Se verificará en el paso 6.');
  })();
}
