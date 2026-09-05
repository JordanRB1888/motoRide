/**
 * La ruta del viaje, viva en una pantalla.
 *
 * Junta las tres piezas que ya existen y no decide nada por su cuenta: el
 * servicio que la pide (`services/ruta`), las reglas de cuándo pedirla
 * (`domain/rutaEnPantalla`, puras) y el estado de React que la sostiene entre
 * fotogramas.
 *
 * POR QUÉ UN GANCHO Y NO CÓDIGO EN CADA PANTALLA
 *
 * Porque son dos pantallas —la pasajera y el conductor— mirando exactamente la
 * misma ruta desde los dos lados, y dos copias del mismo ritmo de peticiones se
 * desincronizan a la primera corrección. La única diferencia entre ellas es
 * quién mira; el tramo lo decide el servidor igual para ambos.
 *
 * DOS TRAMPAS DE REACT, Y LAS DOS COSTARON UN BUCLE
 *
 * La primera versión de esto colgó la aplicación del conductor con «Maximum
 * update depth exceeded», y las dos causas merecen quedar escritas porque
 * ninguna salta a la vista:
 *
 *   1. ESCRIBIR ESTADO SIN COMPARAR. Sin viaje activo, el efecto hacía
 *      `setUltima({ clase: 'SIN_RUTA', motivo: null })` en cada pasada. Ese
 *      objeto es NUEVO cada vez, así que React lo tomaba por un cambio, volvía
 *      a renderizar, y el efecto volvía a escribirlo. Ahora sólo se escribe
 *      cuando de verdad cambia algo.
 *
 *   2. DEPENDER DE UN OBJETO RECIÉN CREADO. Las pantallas pasan `{ lat, lng }`
 *      construido en el propio render, así que su identidad cambia siempre
 *      aunque las coordenadas sean idénticas. Las dependencias son ahora los
 *      NÚMEROS, que sí se comparan por valor.
 *
 * Lo encontró el emulador, no la suite: un bucle de render no rompe ninguna
 * aserción, sólo deja la pantalla clavada con un aviso rojo.
 *
 * NO PIDE EN BUCLE
 *
 * Se pide al montar, cuando cambia el estado del viaje, y cuando la moto se ha
 * movido lo bastante. Entre medias, nada: el efecto consulta la decisión pura
 * antes de tocar la red. Un GPS cada dos segundos no produce una llamada cada
 * dos segundos.
 */

import { useEffect, useRef, useState } from 'react';

import {
  CADUCIDAD_MS,
  estadoDeLaRuta,
  puntosParaElMapa,
  tocaPedirRuta,
  type EstadoDeRuta,
  type RutaVigente
} from '../domain/rutaEnPantalla';
import { tramoDelEstado, type PuntoDeRuta } from '../domain/rutaDelViaje';
import { pedirRutaDelViaje } from '../services/ruta';

/** Se reexporta: vive en el dominio, que es donde se puede comprobar. */
export { tramoDelEstado };

export interface RutaEnVivo {
  readonly estado: EstadoDeRuta;
  readonly puntos: readonly PuntoDeRuta[];
  /** Por qué no hay ruta, cuando no la hay. Para poder decirlo sin inventar. */
  readonly motivo: string | null;
  /** La ruta dibujada ya no es fresca. No se borra: se avisa. */
  readonly vieja: boolean;
}

const SIN_RUTA: EstadoDeRuta = { clase: 'SIN_RUTA', motivo: null };

export function useRutaDelViaje(
  viajeId: string | null,
  estadoDelViaje: string,
  conductorEn: PuntoDeRuta | null
): RutaEnVivo {
  const [estado, setEstado] = useState<EstadoDeRuta>(SIN_RUTA);

  /**
   * La ruta vigente vive en una REFERENCIA y no en el estado.
   *
   * Es lo que se compara para decidir si toca pedir otra, y meterla en las
   * dependencias del efecto lo haría dispararse cada vez que ella misma cambia
   * — que es la mitad del bucle que explica la cabecera.
   */
  const vigente = useRef<RutaVigente | null>(null);
  const pidiendo = useRef(false);

  const tramo = tramoDelEstado(estadoDelViaje);
  // Números, no el objeto: su identidad cambia en cada render de la pantalla.
  const lat = conductorEn?.lat ?? null;
  const lng = conductorEn?.lng ?? null;

  useEffect(() => {
    // Sin viaje o sin tramo no hay nada que pedir, y lo que hubiera se retira:
    // al llegar y al terminar, una ruta en pantalla diría algo que no pasa.
    if (viajeId === null || viajeId === '' || tramo === null) {
      vigente.current = null;
      // Sólo si había algo que quitar. Escribir siempre es lo que hacía el bucle.
      setEstado(anterior => (
        anterior.clase === 'SIN_RUTA' && anterior.motivo === null ? anterior : SIN_RUTA
      ));
      return;
    }

    if (pidiendo.current) return;

    const moto = lat === null || lng === null ? null : { lat, lng };
    if (!tocaPedirRuta(vigente.current, tramo, moto, Date.now())) return;

    let vivo = true;
    pidiendo.current = true;
    void (async () => {
      const respuesta = await pedirRutaDelViaje(viajeId);
      pidiendo.current = false;
      if (!vivo) return;
      const siguiente = estadoDeLaRuta(vigente.current, respuesta, Date.now());
      vigente.current = siguiente.clase === 'SIN_RUTA' ? null : siguiente.ruta;
      setEstado(siguiente);
    })();

    return () => { vivo = false; };
  }, [viajeId, tramo, lat, lng]);

  const puesta = vigente.current;
  return {
    estado,
    puntos: puntosParaElMapa(estado),
    motivo: estado.clase === 'SIN_RUTA' ? estado.motivo : null,
    vieja: puesta !== null && Date.now() - puesta.pedidaEn > CADUCIDAD_MS
  };
}
