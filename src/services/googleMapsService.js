/**
 * Cargador centralizado de Google Maps.
 *
 * UNICO punto del proyecto que inyecta el script de Google: ninguna pantalla
 * carga la API por su cuenta, y cargarla dos veces --que Google castiga con
 * avisos y comportamiento indefinido-- es imposible por construccion, porque
 * todas las llamadas comparten la misma promesa.
 *
 * La clave llega por la convencion Vite del proyecto:
 *
 *   VITE_GOOGLE_MAPS_API_KEY
 *
 * y NUNCA se registra en consola ni viaja en un error. Que la clave del Maps
 * JavaScript API acabe visible en el navegador es inherente al producto --el
 * script se descarga con ella en la URL--, asi que su proteccion real no es el
 * secreto sino las restricciones en Google Cloud: referentes HTTP
 * (https://plus58express.vercel.app/* en produccion, localhost en desarrollo)
 * y la lista de APIs permitidas reducida a Maps JavaScript API.
 *
 * Sin clave no se toca la red: el resultado es NO_KEY y quien llama decide su
 * respaldo. Un fallo de Google NUNCA debe tumbar la aplicacion.
 */

export const GOOGLE_MAPS_STATUS = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  READY: 'READY',
  NO_KEY: 'NO_KEY',
  FAILED: 'FAILED'
});

const TIMEOUT_POR_DEFECTO_MS = 10000;

/**
 * @param {object} opciones
 * @param {() => string} opciones.getKey       lectura diferida de la clave
 * @param {Document} [opciones.documentRef]
 * @param {Window}   [opciones.windowRef]
 * @param {number}   [opciones.timeoutMs]
 */
export function createGoogleMapsLoader({
  getKey,
  documentRef = typeof document !== 'undefined' ? document : undefined,
  windowRef = typeof window !== 'undefined' ? window : undefined,
  timeoutMs = TIMEOUT_POR_DEFECTO_MS
} = {}) {
  if (typeof getKey !== 'function') throw new Error('GOOGLE_MAPS_LOADER_REQUIRES_KEY_GETTER');

  let estado = GOOGLE_MAPS_STATUS.IDLE;
  let promesa = null;

  const isConfigured = () => {
    const clave = getKey();
    return typeof clave === 'string' && clave.trim() !== '';
  };

  const getStatus = () => estado;

  /**
   * Carga la API una sola vez. Todas las llamadas posteriores reciben la MISMA
   * promesa: no existe camino por el que se inyecte un segundo script.
   *
   * Resuelve con el espacio `google.maps`; rechaza con un Error cuyo mensaje
   * es un codigo escueto (NO_KEY, LOAD_FAILED, LOAD_TIMEOUT, AUTH_FAILED,
   * NO_DOCUMENT). La clave no aparece en ninguno.
   */
  function load() {
    if (promesa) return promesa;

    promesa = new Promise((resolve, reject) => {
      const clave = String(getKey() ?? '').trim();
      if (!clave) {
        estado = GOOGLE_MAPS_STATUS.NO_KEY;
        reject(new Error('NO_KEY'));
        return;
      }
      if (!documentRef || !windowRef) {
        estado = GOOGLE_MAPS_STATUS.FAILED;
        reject(new Error('NO_DOCUMENT'));
        return;
      }

      // Si el script ya vive en la pagina y la API esta disponible --por
      // ejemplo tras una navegacion interna-- se reutiliza sin tocar el DOM.
      if (windowRef.google?.maps?.Map) {
        estado = GOOGLE_MAPS_STATUS.READY;
        resolve(windowRef.google.maps);
        return;
      }

      estado = GOOGLE_MAPS_STATUS.LOADING;
      let terminado = false;

      const finalizar = (error) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        if (error) {
          estado = GOOGLE_MAPS_STATUS.FAILED;
          reject(error);
        } else {
          estado = GOOGLE_MAPS_STATUS.READY;
          resolve(windowRef.google.maps);
        }
      };

      const temporizador = setTimeout(() => finalizar(new Error('LOAD_TIMEOUT')), timeoutMs);

      // Google invoca gm_authFailure cuando la clave es rechazada (invalida,
      // restringida a otro referente, API no habilitada). Llega DESPUES del
      // onload del script, asi que sin este gancho un rechazo de clave
      // pareceria una carga correcta con un mapa en gris.
      windowRef.gm_authFailure = () => finalizar(new Error('AUTH_FAILED'));

      const nombreCallback = '__plus58GoogleMapsReady';
      windowRef[nombreCallback] = () => {
        delete windowRef[nombreCallback];
        if (windowRef.google?.maps?.Map) finalizar(null);
        else finalizar(new Error('LOAD_FAILED'));
      };

      const script = documentRef.createElement('script');
      // loading=async es la forma que Google recomienda; el callback evita
      // sondear. La clave viaja en la URL del script: es el funcionamiento
      // normal de esta API y la razon de las restricciones por referente.
      script.src = 'https://maps.googleapis.com/maps/api/js'
        + `?key=${encodeURIComponent(clave)}`
        + '&loading=async'
        + `&callback=${nombreCallback}`
        + '&v=weekly';
      script.async = true;
      // El fallo se reporta con un codigo: el atributo src contiene la clave y
      // no debe citarse en el error.
      script.onerror = () => finalizar(new Error('LOAD_FAILED'));
      documentRef.head.appendChild(script);
    });

    return promesa;
  }

  return { load, isConfigured, getStatus };
}

let instancia = null;

/** Singleton de la aplicacion. La clave se lee en el momento, nunca se copia. */
export function getGoogleMapsLoader() {
  if (!instancia) {
    instancia = createGoogleMapsLoader({
      getKey: () => (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GOOGLE_MAPS_API_KEY : '') || ''
    });
  }
  return instancia;
}
