/**
 * Las dos peticiones que convierten un pedido en un viaje.
 *
 *   POST /api/pricing/estimate   cuánto cuesta
 *   POST /api/trips/create        créalo
 *
 * Los dos contratos están LEÍDOS del servidor, no supuestos:
 *
 *   `/api/pricing/estimate` (server/index.js) pide `distanceKm` y `durationMin`
 *   —sin ellos responde `INVALID_ROUTE_METRICS`— y devuelve lo que produce
 *   `calculateFare`: `fareUSD`, `fareVES`, `exchangeRate`, `distanceKm`,
 *   `durationMin`, `rideType`, `isNight`, `isPeak`, `multiplier`.
 *
 *   `/api/trips/create` exige sesión de PASAJERA, valida las coordenadas con
 *   `normalizeLocation`, y —esto es lo importante— con métricas de ruta
 *   utilizables calcula la tarifa él mismo y DESCARTA la que venga del cliente,
 *   marcándola `fareSource: 'SERVER_CALCULATED'`.
 *
 * Por eso aquí no viaja ningún precio: sólo el recorrido.
 */

import { llamar } from './api';
import type { Resultado } from '../domain/apiResult';
import { leerDetalle, type DetalleReal } from '../domain/viajes';
import {
  cuerpoParaCrear,
  leerEstimacion,
  tipoParaElServidor,
  type Estimacion,
  type MetricasDelRecorrido,
  type PuntoDelViaje,
  type TipoEnLaPantalla
} from '../domain/pedirViaje';

/**
 * Preguntar el precio.
 *
 * No se manda la moneda: el servidor usa `BCV` por defecto y esta fase no toca
 * el cambio. Tampoco se manda la hora: la pone él, que es quien decide si es
 * noche u hora pico según la zona horaria del negocio.
 */
export async function pedirEstimacion(
  tipo: TipoEnLaPantalla,
  metricas: MetricasDelRecorrido
): Promise<Resultado<Estimacion>> {
  const respuesta = await llamar<unknown>('/api/pricing/estimate', {
    metodo: 'POST',
    cuerpo: {
      distanceKm: metricas.distanciaKm,
      durationMin: metricas.minutos,
      rideType: tipoParaElServidor(tipo)
    }
  });

  if (!respuesta.ok) return respuesta;

  const estimacion = leerEstimacion(respuesta.datos);
  if (estimacion === null) {
    // El servidor respondió, pero con algo que no es una tarifa utilizable.
    // Enseñar un precio a medias sería peor que decir que no se pudo.
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: 'ESTIMACION_ILEGIBLE',
      mensaje: 'No se pudo leer el precio',
      detalle: null,
      estadoHttp: null
    };
  }

  return { ok: true, datos: estimacion };
}

/**
 * Crear el viaje.
 *
 * Devuelve el viaje que el servidor creó, leído con el MISMO lector que usa el
 * resto de la aplicación: si aquí se leyera de otra forma, la pantalla siguiente
 * podría entender el viaje distinto que la que lo creó.
 *
 * Que esto responda bien NO es la autoridad del viaje. La autoridad es
 * `GET /api/trips/active/me`, que el almacén del viaje activo consulta después.
 * Esto sólo dice que la creación salió.
 */
export async function crearViaje({
  origen,
  destino,
  tipo,
  metricas
}: {
  readonly origen: PuntoDelViaje;
  readonly destino: PuntoDelViaje;
  readonly tipo: TipoEnLaPantalla;
  readonly metricas: MetricasDelRecorrido;
}): Promise<Resultado<DetalleReal>> {
  const respuesta = await llamar<unknown>('/api/trips/create', {
    metodo: 'POST',
    cuerpo: cuerpoParaCrear({ origen, destino, tipo, metricas })
  });

  if (!respuesta.ok) return respuesta;

  const cuerpo = respuesta.datos as { trip?: unknown } | null;
  const viaje = leerDetalle(cuerpo?.trip ?? cuerpo);
  if (viaje === null) {
    return {
      ok: false,
      motivo: 'RESPUESTA_INVALIDA',
      codigo: 'VIAJE_ILEGIBLE',
      mensaje: 'El viaje se creó pero no se pudo leer',
      detalle: null,
      estadoHttp: null
    };
  }

  return { ok: true, datos: viaje };
}
