/**
 * Vigilancia de errores del navegador.
 *
 * Una excepción no capturada en el arranque deja la aplicación a medio pintar
 * sin que ninguna aserción de contenido lo note: la pantalla se ve «bien»
 * porque lo que falta es lo que nunca llegó a dibujarse. Esa fue exactamente
 * la forma de un fallo real del proyecto —`renderDriverApp` reventaba tras
 * pintar la plantilla y antes de enganchar los oyentes, y los cuatro botones
 * de abajo no hacían nada—, así que aquí se mira de frente.
 *
 * NO se falla por cualquier ruido: se falla por lo que de verdad indica un
 * defecto, y lo tolerado está enumerado y justificado abajo.
 */

/**
 * Ruido conocido e inofensivo, con su motivo.
 *
 * Cada entrada tiene que explicar POR QUÉ es inofensiva. Una lista de
 * excepciones sin explicación acaba tapando defectos de verdad.
 */
export const RUIDO_TOLERADO = [
  {
    patron: /Failed to load resource.*\b(404|403)\b/i,
    motivo: 'un recurso opcional que falta en la vista previa (iconos de plataforma, mapas) '
      + 'no impide que la aplicación funcione'
  },
  {
    patron: /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_REFUSED)/i,
    motivo: 'sin backend local levantado, las llamadas a la API fallan por red. '
      + 'La aplicación lo contempla y sigue pintando el armazón'
  },
  {
    patron: /unpkg\.com|leaflet/i,
    motivo: 'Leaflet se carga desde CDN; sin salida a internet el mapa no se dibuja '
      + 'pero ninguna pantalla depende de él para montarse'
  },
  {
    patron: /\[\+58express\] No se pudo cargar la experiencia visual aprobada/i,
    motivo: 'aviso deliberado del propio producto cuando la capa visual opcional no carga; '
      + 'ya se degrada solo'
  },
  {
    patron: /Download the (React|Vue) DevTools|Lighthouse|favicon/i,
    motivo: 'ruido de herramientas del navegador, ajeno a la aplicación'
  }
];

const esRuidoTolerado = texto => RUIDO_TOLERADO.some(({ patron }) => patron.test(texto));

/**
 * Engancha la vigilancia a una página y devuelve con qué consultarla.
 *
 *   const errores = vigilarErrores(page);
 *   ...
 *   expect(errores.graves()).toEqual([]);
 */
export function vigilarErrores(page) {
  const excepciones = [];
  const consola = [];
  const peticionesFallidas = [];

  // `pageerror` es una excepción NO capturada: siempre significa algo.
  page.on('pageerror', error => {
    excepciones.push({ mensaje: error?.message ?? String(error), pila: error?.stack ?? null });
  });

  page.on('console', mensaje => {
    if (mensaje.type() !== 'error') return;
    consola.push(mensaje.text());
  });

  page.on('requestfailed', peticion => {
    peticionesFallidas.push({
      url: peticion.url(),
      metodo: peticion.method(),
      motivo: peticion.failure()?.errorText ?? 'desconocido'
    });
  });

  return {
    /** Excepciones no capturadas. Ninguna es tolerable. */
    excepciones: () => [...excepciones],
    /** Errores de consola que NO están en la lista justificada. */
    consolaRelevante: () => consola.filter(texto => !esRuidoTolerado(texto)),
    /** Peticiones que ni siquiera llegaron a responder. */
    peticionesFallidas: () => [...peticionesFallidas],
    /**
     * Lo que debe hacer fallar una prueba: toda excepción no capturada, más
     * los errores de consola que nadie ha justificado.
     */
    graves: () => [
      ...excepciones.map(e => `pageerror: ${e.mensaje}`),
      ...consola.filter(texto => !esRuidoTolerado(texto)).map(texto => `console.error: ${texto}`)
    ]
  };
}
