/**
 * El transporte HTTP de los envios de codigo. Uno solo para los tres canales.
 *
 * POR QUE UNO SOLO
 *
 * WhatsApp (Meta), SMS (Twilio) y el correo transaccional hablan HTTP. Con un
 * unico transporte hay una sola forma de poner un timeout, una sola forma de
 * clasificar un fallo y una sola forma de NO reintentar. Un segundo mecanismo
 * seria una segunda manera de equivocarse.
 *
 * TRES RESULTADOS, NO DOS
 *
 *   delivered  -- el proveedor acepto el mensaje. Hay desafio.
 *   rejected   -- el proveedor lo rechazo y el mensaje NO salio: numero
 *                 invalido, plantilla no aprobada, credenciales malas. No hay
 *                 desafio y el usuario puede probar otro canal en el acto.
 *   ambiguous  -- la peticion se mando y no sabemos que paso: timeout, red
 *                 caida, 5xx. El mensaje PUDO salir.
 *
 * El tercero es el importante. Tratar un timeout como fracaso hace que un
 * codigo que si llego deje de valer; tratarlo como exito deja al usuario
 * esperando un mensaje que nunca vino. Se le da su propio estado y decide el
 * usuario, no el servidor.
 *
 * NUNCA SE REINTENTA
 *
 * Un reintento automatico de un envio OTP es un segundo mensaje al telefono de
 * alguien, cobrado. Aunque el fallo parezca transitorio, aqui se responde una
 * sola vez y quien llama decide.
 *
 * NUNCA SE REGISTRA NADA DESDE AQUI. Ni el codigo, ni la peticion, ni la
 * respuesta del proveedor, ni las credenciales que viajan en las cabeceras.
 */

/** Diez segundos: de sobra para un POST, poco para dejar a nadie esperando. */
export const TIMEOUT_POR_OMISION_MS = 10_000;

export const RESULTADO_DE_ENVIO = Object.freeze({
  ENTREGADO: 'delivered',
  RECHAZADO: 'rejected',
  AMBIGUO: 'ambiguous'
});

/**
 * Clasifica una respuesta HTTP del proveedor.
 *
 * 2xx entrega. 4xx es un rechazo definitivo: repetir la misma peticion daria
 * el mismo error, asi que el mensaje no salio y no saldra. 429 y 5xx son del
 * lado del proveedor y no dicen si el mensaje se proceso: ambiguos.
 */
export function clasificarRespuesta(status) {
  if (status >= 200 && status < 300) return RESULTADO_DE_ENVIO.ENTREGADO;
  if (status === 408 || status === 429) return RESULTADO_DE_ENVIO.AMBIGUO;
  if (status >= 400 && status < 500) return RESULTADO_DE_ENVIO.RECHAZADO;
  return RESULTADO_DE_ENVIO.AMBIGUO;
}

/** El motivo que se propaga hacia arriba. Es una etiqueta, no un mensaje. */
export function motivoDeEstado(status) {
  if (status === 401 || status === 403) return 'PROVIDER_UNAUTHORIZED';
  if (status === 429) return 'PROVIDER_THROTTLED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (status >= 400) return 'PROVIDER_REJECTED';
  return null;
}

function cuerpoDeLaPeticion(peticion) {
  if (peticion.form) return new URLSearchParams(peticion.form).toString();
  return peticion.body === undefined ? undefined : JSON.stringify(peticion.body);
}

/**
 * Manda una peticion ya construida por un adaptador y devuelve
 * `{ resultado, motivo, status, latenciaMs }`.
 *
 * `fetchImpl` se inyecta para las pruebas: lo que se prueba es esta
 * clasificacion, no la red.
 */
export async function crearTransporteHttp({
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_POR_OMISION_MS,
  now = () => Date.now()
} = {}) {
  return async function enviarPeticion(_canal, peticion) {
    const empezo = now();
    let respuesta;
    try {
      respuesta = await fetchImpl(peticion.url, {
        method: peticion.method ?? 'POST',
        headers: peticion.headers,
        body: cuerpoDeLaPeticion(peticion),
        // `AbortSignal.timeout` cancela la peticion en el reloj del sistema,
        // sin dejar el socket colgado. Sin esto, un proveedor que no responde
        // bloquea la peticion del usuario hasta el timeout del servidor.
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      // Aqui NO se sabe si el proveedor llego a procesar el mensaje: la
      // peticion salio y la respuesta no volvio. Ambiguo, siempre.
      const abortado = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return {
        resultado: RESULTADO_DE_ENVIO.AMBIGUO,
        motivo: abortado ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR',
        status: null,
        latenciaMs: now() - empezo
      };
    }

    const resultado = clasificarRespuesta(respuesta.status);
    return {
      resultado,
      motivo: resultado === RESULTADO_DE_ENVIO.ENTREGADO ? null : motivoDeEstado(respuesta.status),
      status: respuesta.status,
      latenciaMs: now() - empezo
    };
  };
}
