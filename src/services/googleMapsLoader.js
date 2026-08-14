/**
 * Carga de la API de Google Maps.
 *
 * El script se inyecta una sola vez y bajo demanda: solo cuando una pantalla
 * necesita de verdad un mapa. No se carga en el arranque de la aplicación, así
 * que quien nunca abre un mapa no genera ninguna petición a Google ni aparece
 * una carga facturable.
 *
 * La clave del navegador es visible en el bundle —no hay forma de evitarlo con
 * la API de JavaScript— y lo que la protege es la restricción por referente
 * HTTP configurada en Google Cloud. Por eso la clave del servidor es otra
 * distinta y nunca llega al cliente.
 */

const CALLBACK = '__plus58ExpressMapsReady';
const SCRIPT_ID = 'google-maps-js-api';

/** Bibliotecas que usa la aplicación. Cargar de más encarece y ralentiza. */
const LIBRARIES = ['maps', 'marker', 'places', 'geometry'];

let cargando = null;

export function googleMapsApiKey(env = import.meta.env) {
  return String(env?.VITE_GOOGLE_MAPS_BROWSER_KEY || '').trim();
}

/** ¿Está configurada la clave? Permite degradar sin romper la pantalla. */
export function isGoogleMapsConfigured(env = import.meta.env) {
  return googleMapsApiKey(env).length > 0;
}

/**
 * Carga la API y resuelve con `google.maps`.
 *
 * Llamarla varias veces devuelve siempre la misma promesa: el script se inyecta
 * una vez. Si la clave falta o el script no carga, rechaza con un error tipado
 * para que la pantalla pueda mostrar un estado degradado en vez de quedarse en
 * blanco.
 */
export function loadGoogleMaps({ env = import.meta.env } = {}) {
  if (cargando) return cargando;

  cargando = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(fallo('GOOGLE_MAPS_NO_BROWSER', 'no hay ventana disponible'));
      return;
    }
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const key = googleMapsApiKey(env);
    if (!key) {
      reject(fallo('GOOGLE_MAPS_KEY_MISSING', 'falta VITE_GOOGLE_MAPS_BROWSER_KEY'));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;

    const params = new URLSearchParams({
      key,
      libraries: LIBRARIES.join(','),
      callback: CALLBACK,
      language: 'es',
      region: 'VE',
      loading: 'async'
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

    const limpiar = () => { delete window[CALLBACK]; };

    window[CALLBACK] = () => {
      limpiar();
      if (window.google?.maps) resolve(window.google.maps);
      else reject(fallo('GOOGLE_MAPS_LOAD_FAILED', 'la API cargó sin google.maps'));
    };

    script.addEventListener('error', () => {
      limpiar();
      script.remove();
      // Se permite reintentar: una caída de red no debe dejar la aplicación
      // sin mapa para el resto de la sesión.
      cargando = null;
      reject(fallo('GOOGLE_MAPS_LOAD_FAILED', 'no se pudo cargar el script'));
    });

    document.head.appendChild(script);
  });

  return cargando;
}

/** Solo para pruebas: olvida la carga en curso. */
export function resetGoogleMapsLoader() {
  cargando = null;
}

function fallo(code, detalle) {
  const error = new Error(detalle ? `${code}: ${detalle}` : code);
  error.code = code;
  return error;
}
