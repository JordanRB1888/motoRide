/**
 * Los avisos, en vivo.
 *
 * POR QUÉ EL EVENTO NO SE PINTA DIRECTAMENTE
 *
 * `platform:notification` llega con DOS formas distintas, y esto lo decide todo:
 *
 *   · la difusión del panel de administración manda la notificación ENTERA,
 *     con `id` y `createdAt`, y esa sí está guardada en la base;
 *   · la liquidación y Transporte Seguro mandan sólo `{title, message,
 *     category, icon}` — sin identificador y SIN estar guardada.
 *
 * Insertar el evento en la lista tendría dos problemas a la vez: las de la
 * segunda forma no se podrían marcar como leídas —no tienen identificador— y
 * las de la primera aparecerían dos veces en cuanto alguien recargara.
 *
 * Así que el evento se trata como lo que es: una SEÑAL de que hay algo nuevo.
 * Quien manda sigue siendo `GET /api/notifications/me`.
 *
 *   HTTP    → el estado autoritativo
 *   Socket  → «vuelve a preguntar»
 *
 * Es más tráfico que insertar el objeto, y a cambio es imposible que la bandeja
 * enseñe algo que el servidor no tiene, o lo mismo dos veces.
 *
 * Y RESUELVE EL RECONNECT GRATIS
 *
 * Un socket que vuelve tras una caída no trae lo que se perdió: mientras no
 * había red, el servidor siguió emitiendo. Como aquí lo único que se hace es
 * volver a preguntar, la reconexión usa exactamente el mismo camino.
 */

import { useCallback, useEffect, useRef } from 'react';

import { useEvento, useResync } from './ProveedorDeTiempoReal';

/**
 * De dónde sale el retraso.
 *
 * La primera versión esperaba 400 ms fijos, y eso NO reparte el pico: lo mueve.
 * Diez mil teléfonos que reciben la misma difusión esperan los mismos 400 ms y
 * preguntan todos a la vez, 400 ms después. El servidor recibe el mismo golpe.
 *
 * `retrasoDeRecarga` vive en el dominio, es pura y se prueba con un aleatorio
 * inyectado. Aquí sólo se usa.
 */
import { retrasoDeRecarga } from '../domain/viajeActivo';

/**
 * Mantiene la bandeja al día.
 *
 * `recargar` es la misma función que carga por HTTP. No hay un segundo camino
 * para los datos: eso es lo que evita que el estado en vivo y el estado cargado
 * puedan discrepar.
 */
export function useAvisosEnVivo(recargar: () => void): void {
  const vigente = useRef(recargar);
  useEffect(() => { vigente.current = recargar; }, [recargar]);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Agrupa y reparte.
   *
   * AGRUPA: varios eventos seguidos reinician el temporizador, así que tres
   * avisos en un segundo producen UNA recarga y no tres.
   *
   * REPARTE: cada teléfono elige su propio retraso dentro de una ventana, para
   * que una difusión a toda la plataforma llegue al servidor como una pendiente
   * y no como una pared.
   */
  const pedirRecarga = useCallback((repartir: boolean) => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      vigente.current();
    }, retrasoDeRecarga(Math.random(), repartir));
  }, []);

  // Sin esto, una recarga pendiente se dispararía sobre una pantalla ya
  // desmontada.
  useEffect(() => () => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
  }, []);

  // El payload no se mira: da igual qué traiga, la respuesta es la misma.
  //
  // Un aviso PUEDE ser una difusión a toda la plataforma, así que se reparte.
  // Una reconexión es de este teléfono solo —y además vuelve de estar sin red,
  // que es cuando más urge saber la verdad— así que no.
  useEvento('platform:notification', useCallback(() => pedirRecarga(true), [pedirRecarga]));
  useResync(useCallback(() => pedirRecarga(false), [pedirRecarga]));
}
