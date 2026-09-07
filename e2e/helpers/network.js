/**
 * Visibilidad de la red, para que las fases siguientes puedan mirarla.
 *
 * QA-FOUNDATION-1 NO implementa la suite sin conexión: aquí solo quedan las
 * herramientas para que exista después, y para que un fallo de red sea algo
 * que se pueda leer en el informe en vez de un cuelgue sin explicación.
 */

/** Las llamadas a la API del producto, no los recursos estáticos. */
const esLlamadaApi = url => /\/api\//.test(url);

/**
 * Registra el tráfico de API de una página.
 *
 *   const red = vigilarRed(page);
 *   ...
 *   expect(red.erroresDeServidor()).toEqual([]);
 */
export function vigilarRed(page) {
  const respuestas = [];
  const fallidas = [];

  page.on('response', async respuesta => {
    const url = respuesta.url();
    if (!esLlamadaApi(url)) return;
    respuestas.push({ url, estado: respuesta.status(), metodo: respuesta.request().method() });
  });

  page.on('requestfailed', peticion => {
    if (!esLlamadaApi(peticion.url())) return;
    fallidas.push({
      url: peticion.url(),
      metodo: peticion.method(),
      motivo: peticion.failure()?.errorText ?? 'desconocido'
    });
  });

  return {
    todas: () => [...respuestas],
    /** Un 5xx es del servidor: nunca es culpa de la prueba. */
    erroresDeServidor: () => respuestas.filter(r => r.estado >= 500),
    /** 4xx: puede ser legítimo (401 sin sesión) o un defecto. Lo juzga quien llama. */
    erroresDeCliente: () => respuestas.filter(r => r.estado >= 400 && r.estado < 500),
    /** Peticiones que no llegaron a responder: sin backend, esto es lo normal. */
    sinRespuesta: () => [...fallidas]
  };
}

/**
 * Simula la caída de la red para la aplicación.
 *
 * Se corta a nivel de RUTA y no con `context.setOffline`, porque así el
 * armazón y sus recursos ya cargados siguen vivos y lo único que se cae es lo
 * que la aplicación intenta pedirle al servidor — que es el escenario real de
 * un móvil que pierde cobertura a mitad de una carrera.
 */
export async function cortarLaApi(page) {
  await page.route('**/api/**', ruta => ruta.abort('internetdisconnected'));
}

/** Devuelve la red a la normalidad. */
export async function restablecerLaApi(page) {
  await page.unroute('**/api/**');
}

/**
 * Responde una llamada concreta sin tocar el servidor.
 *
 * Sirve para probar cómo REACCIONA la aplicación ante una respuesta —un 500,
 * un cuerpo raro— sin necesidad de provocar ese estado de verdad en ningún
 * entorno. No sustituye a las pruebas de integración del backend, que ya
 * existen y se ejecutan aparte.
 */
export async function responderApi(page, patron, { estado = 200, cuerpo = null } = {}) {
  await page.route(patron, ruta => ruta.fulfill({
    status: estado,
    contentType: 'application/json',
    body: JSON.stringify(cuerpo)
  }));
}
