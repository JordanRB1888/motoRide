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
 * Cuánto se espera antes de recargar.
 *
 * Una difusión a toda la plataforma llega a la vez a todos los teléfonos. Sin
 * esta pausa, cada uno respondería con una petición inmediata y el servidor
 * recibiría de golpe tantas como usuarios conectados.
 */
const ESPERA_MS = 400;

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

  const pedirRecarga = useCallback(() => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      vigente.current();
    }, ESPERA_MS);
  }, []);

  // Sin esto, una recarga pendiente se dispararía sobre una pantalla ya
  // desmontada.
  useEffect(() => () => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
  }, []);

  // El payload no se mira: da igual qué traiga, la respuesta es la misma.
  useEvento('platform:notification', pedirRecarga);
  useResync(pedirRecarga);
}
