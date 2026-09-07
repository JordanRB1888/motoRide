/**
 * La caché de recorridos, y el reparto de una misma llamada entre quien la pida.
 *
 * POR QUÉ
 *
 * Medir un recorrido es una llamada de red a Google que se paga. Una persona
 * indecisa mueve el destino, vuelve, toca «Pedir», se arrepiente y vuelve a
 * tocar: son cinco llamadas idénticas en diez segundos para responder siempre
 * lo mismo.
 *
 * DOS MECANISMOS DISTINTOS
 *
 *   COALESCING  varios que piden LO MISMO A LA VEZ comparten UNA llamada.
 *               Esto no es caché: es no llamar cinco veces en paralelo.
 *   CACHÉ       lo ya medido se reutiliza durante un rato corto.
 *
 * QUÉ SE GUARDA, Y QUÉ NO
 *
 * Se guardan METRICAS --kilómetros y minutos--, jamás tarifas. La tarifa
 * depende de la hora: cachearla haría que un viaje nocturno se cobrara a precio
 * de tarde. El precio se calcula siempre fresco con las métricas guardadas.
 *
 * `rideType` NO entra en la clave: una moto y un carro recorren la misma
 * geometría. Lo que cambia entre ellos es el multiplicador del precio, y el
 * precio no se cachea.
 *
 * UN FALLO NO SE GUARDA
 *
 * Sólo entra lo que se midió. Si el proveedor falla, la siguiente vuelve a
 * intentarlo en vez de heredar el problema durante un minuto.
 */

/** Un minuto. Suficiente para una sesión de indecisión, corto para el tráfico. */
export const TTL_POR_OMISION_MS = 60_000;

/**
 * Cuánto se redondean las coordenadas para la clave: cuatro decimales son unos
 * once metros. Más grueso empezaría a cobrar el recorrido del vecino; más fino
 * haría que respirar encima del teléfono ya no acertara en la caché.
 */
const DECIMALES_DE_LA_CLAVE = 4;

/** Techo de entradas, para que la memoria no crezca sin final. */
const MAXIMO_DE_ENTRADAS = 500;

function trozo(punto) {
  return `${punto.lat.toFixed(DECIMALES_DE_LA_CLAVE)},${punto.lng.toFixed(DECIMALES_DE_LA_CLAVE)}`;
}

/** La clave de un recorrido: de dónde a dónde, redondeado. */
export function claveDelRecorrido(origen, destino) {
  return `${trozo(origen)}>${trozo(destino)}`;
}

export function crearCacheDeRecorridos({ ttlMs = TTL_POR_OMISION_MS, ahora = () => Date.now() } = {}) {
  /** Lo ya medido: clave → { metricas, expiraEn }. */
  const guardado = new Map();
  /** Lo que se está midiendo AHORA: clave → promesa compartida. */
  const enVuelo = new Map();
  const contadores = { aciertos: 0, fallos: 0, compartidas: 0 };

  function limpiar() {
    const t = ahora();
    for (const [clave, entrada] of guardado) {
      if (entrada.expiraEn <= t) guardado.delete(clave);
    }
    // Si aun asi sobra, se van las mas viejas: `Map` conserva el orden de
    // insercion, asi que las primeras son las que llevan mas tiempo.
    while (guardado.size > MAXIMO_DE_ENTRADAS) {
      const primera = guardado.keys().next().value;
      guardado.delete(primera);
    }
  }

  return {
    /**
     * Devuelve las métricas del recorrido, midiendo sólo si hace falta.
     *
     * @param {{lat:number,lng:number}} origen
     * @param {{lat:number,lng:number}} destino
     * @param {() => Promise<object>} medir  lo que hace la medición de verdad
     */
    async medir(origen, destino, medir) {
      const clave = claveDelRecorrido(origen, destino);
      const t = ahora();

      const entrada = guardado.get(clave);
      if (entrada && entrada.expiraEn > t) {
        contadores.aciertos += 1;
        return entrada.metricas;
      }

      // Ya hay una medición idéntica en el aire: se comparte en vez de abrir
      // otra. Aqui esta el ahorro de los cinco toques seguidos.
      const yaEnCurso = enVuelo.get(clave);
      if (yaEnCurso) {
        contadores.compartidas += 1;
        return await yaEnCurso;
      }

      contadores.fallos += 1;
      const promesa = (async () => {
        const metricas = await medir();
        // Sólo se guarda lo que se midió. Un fallo lanza y no llega aqui.
        guardado.set(clave, { metricas, expiraEn: ahora() + ttlMs });
        limpiar();
        return metricas;
      })();

      enVuelo.set(clave, promesa);
      try {
        return await promesa;
      } finally {
        enVuelo.delete(clave);
      }
    },

    /** Para las pruebas y el informe. No expone ninguna coordenada. */
    estadisticas() {
      return { ...contadores, guardadas: guardado.size, enVuelo: enVuelo.size };
    },

    vaciar() {
      guardado.clear();
    }
  };
}
