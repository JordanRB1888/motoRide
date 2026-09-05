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
 * NO PIDE EN BUCLE
 *
 * Se pide al montar, cuando cambia el estado del viaje, y cuando la moto se ha
 * movido lo bastante. Entre medias, nada: el `useEffect` mira la decisión pura
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
  const [vigente, setVigente] = useState<RutaVigente | null>(null);
  const [ultima, setUltima] = useState<EstadoDeRuta>(SIN_RUTA);
  const pidiendo = useRef(false);

  const tramo = tramoDelEstado(estadoDelViaje);

  useEffect(() => {
    // Sin viaje o sin tramo no hay nada que pedir, y lo que hubiera se retira:
    // al llegar y al terminar, una ruta en pantalla diría algo que no pasa.
    if (viajeId === null || viajeId === '' || tramo === null) {
      setVigente(null);
      setUltima({ clase: 'SIN_RUTA', motivo: null });
      return;
    }

    if (pidiendo.current) return;
    if (!tocaPedirRuta(vigente, tramo, conductorEn, Date.now())) return;

    let vivo = true;
    pidiendo.current = true;
    void (async () => {
      const respuesta = await pedirRutaDelViaje(viajeId);
      if (!vivo) return;
      const siguiente = estadoDeLaRuta(vigente, respuesta, Date.now());
      setUltima(siguiente);
      setVigente(siguiente.clase === 'SIN_RUTA' ? null : siguiente.ruta);
      pidiendo.current = false;
    })();

    return () => { vivo = false; pidiendo.current = false; };
  }, [viajeId, tramo, conductorEn, vigente]);

  const vieja = vigente !== null && Date.now() - vigente.pedidaEn > CADUCIDAD_MS;

  return {
    estado: ultima,
    puntos: puntosParaElMapa(ultima),
    motivo: ultima.clase === 'SIN_RUTA' ? ultima.motivo : null,
    vieja
  };
}
