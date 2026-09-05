/**
 * Pedir una carrera: de elegir moto a que exista un viaje de verdad.
 *
 * LO QUE ESTE FICHERO DECIDE
 *
 *   qué vehículo se pide      MOTO / AUTO en pantalla, MOTO / CAR en el servidor
 *   si se puede pedir         origen, destino y zona de servicio
 *   qué se manda a estimar    métricas del recorrido, nunca un precio
 *   qué se cree de la respuesta   sólo lo que el servidor devuelve
 *   cuándo NO se puede pedir otra vez   el doble toque
 *
 * LO QUE NO DECIDE
 *
 * El precio. Ni una fórmula de tarifa vive aquí. La calcula el servidor con
 * `calculateFare` y es la única autoridad; lo que esta capa hace es preguntarle
 * y enseñar su respuesta tal cual.
 */

import { dentroDelArea } from '../mapa/modelo';
import { distanciaKm } from '../mapa/modelo';

// ---------------------------------------------------------------------------
// El vehículo: dos vocabularios, una traducción
// ---------------------------------------------------------------------------

/**
 * Cómo lo llama la pantalla. Es lo que el dueño aprobó en las tarjetas de
 * «Pedir», y lo que la gente dice en Maracaibo.
 */
export type TipoEnLaPantalla = 'MOTO' | 'AUTO';

/**
 * Cómo lo llama el servidor. Auditado en `server/domain/pricingService.js`:
 * `DEFAULT_PRICING.vehicleTypes` tiene exactamente `MOTO` y `CAR`, y
 * `calculateFare` hace `rideType === 'CAR' ? 'CAR' : 'MOTO'`.
 */
export type TipoEnElServidor = 'MOTO' | 'CAR';

/**
 * La traducción, explícita y en un solo sitio.
 *
 * Mandar la etiqueta de la pantalla sería mandar «AUTO», que el servidor no
 * conoce: su `calculateFare` lo leería como `MOTO` y cobraría tarifa de moto
 * por un carro. No falla, no avisa, y cobra de menos: el peor tipo de error.
 */
/**
 * La forma de pago que esta fase conecta.
 *
 * Efectivo. La cartera tiene su propio camino en el servidor
 * --`ensureWalletCanCoverTrip`-- y sus banderas siguen apagadas. Vive aqui, y
 * no escrita a mano en dos sitios, porque la usan el cuerpo de la peticion y la
 * huella del intento: si se separaran, cambiar de forma de pago dejaria de
 * contar como intento nuevo.
 */
export const PAGO_DE_ESTA_FASE = 'CASH';

export function tipoParaElServidor(tipo: TipoEnLaPantalla): TipoEnElServidor {
  return tipo === 'AUTO' ? 'CAR' : 'MOTO';
}

/** La vuelta, para leer lo que el servidor devuelve. */
export function tipoParaLaPantalla(tipo: unknown): TipoEnLaPantalla {
  return tipo === 'CAR' ? 'AUTO' : 'MOTO';
}

// ---------------------------------------------------------------------------
// Los dos puntos del recorrido
// ---------------------------------------------------------------------------

/**
 * Un extremo del viaje.
 *
 * `direccion` es `null` mientras nadie la haya escrito o elegido de verdad. El
 * servidor NO la exige —`normalizeLocation` sólo valida coordenadas y
 * `tripLocation` sanea el texto que llegue— así que no hace falta rellenarla
 * con nada, y rellenarla sería peor: «Mi ubicación» viajaría hasta la pantalla
 * del conductor como si fuera una dirección a la que puede ir.
 */
export interface PuntoDelViaje {
  readonly lat: number;
  readonly lng: number;
  /** Sólo si alguien la eligió o la escribió. Nunca inventada. */
  readonly direccion: string | null;
  /** Metros, cuando el GPS lo dijo. */
  readonly precision: number | null;
  /** De dónde salió: del GPS del teléfono o de un toque en el mapa. */
  readonly fuente: 'gps' | 'mapa';
}

/** Lo que el servidor espera en `pickup` y `destination`. */
export function puntoParaElServidor(punto: PuntoDelViaje): Record<string, unknown> {
  return {
    lat: punto.lat,
    lng: punto.lng,
    // Se omite si no hay: `sanitizeText(undefined)` da cadena vacía, que es
    // honesto —no hay dirección— mientras que un texto de relleno no lo sería.
    ...(punto.direccion === null ? {} : { address: punto.direccion }),
    ...(punto.precision === null ? {} : { accuracy: punto.precision }),
    source: punto.fuente
  };
}

// ---------------------------------------------------------------------------
// Si se puede pedir, y si no, por qué
// ---------------------------------------------------------------------------

/**
 * Lo que falta para poder pedir.
 *
 * Cada motivo se responde distinto en la pantalla, así que no se colapsan en un
 * `false`. Y `FUERA_DEL_AREA` NO es lo mismo que un fallo del GPS ni que estar
 * sin red: son tres cosas distintas y confundirlas hace que alguien crea que la
 * aplicación está rota cuando lo que pasa es que está en Cabimas.
 */
export type QueFalta = 'NADA' | 'ORIGEN' | 'DESTINO' | 'ORIGEN_FUERA_DEL_AREA' | 'DESTINO_FUERA_DEL_AREA';

export function queFaltaParaPedir(
  origen: PuntoDelViaje | null,
  destino: PuntoDelViaje | null
): QueFalta {
  if (origen === null) return 'ORIGEN';
  if (!dentroDelArea({ lat: origen.lat, lng: origen.lng })) return 'ORIGEN_FUERA_DEL_AREA';
  if (destino === null) return 'DESTINO';
  if (!dentroDelArea({ lat: destino.lat, lng: destino.lng })) return 'DESTINO_FUERA_DEL_AREA';
  return 'NADA';
}

// ---------------------------------------------------------------------------
// Las métricas del recorrido
// ---------------------------------------------------------------------------

/**
 * DE DÓNDE SALEN LA DISTANCIA Y LOS MINUTOS, Y POR QUÉ ESO IMPORTA
 *
 * El servidor calcula la tarifa —y descarta la que mande el cliente— SÓLO si
 * recibe `distanceKm` y `durationMin`. Sin ellas cae en su otro camino, el que
 * su propio código marca como «RIESGO PENDIENTE (alta)»: conserva la
 * estimación del cliente, y entonces sería el teléfono quien fija el importe.
 *
 * Así que estas métricas se mandan SIEMPRE, precisamente para que el precio no
 * lo ponga el cliente nunca.
 *
 * Ahora la parte incómoda, dicha claramente: el servidor no tiene hoy una
 * fuente propia de distancia. Lo dice él mismo en el comentario de
 * `/api/trips/create`. Mientras eso siga así, la distancia la mide el cliente.
 *
 * Lo que SÍ se puede garantizar, y se garantiza:
 *
 *   · la distancia es una MEDIDA, no una invención: la misma función
 *     geométrica que ya usa el mapa de la aplicación;
 *   · los minutos salen de esa distancia con UNA velocidad urbana declarada
 *     aquí, no de un número escrito a ojo en cada pantalla;
 *   · las mismas métricas van a estimar y a crear, así que el precio que se
 *     enseña es el que se cobra;
 *   · el precio nunca se calcula aquí.
 *
 * Cerrarlo del todo pide ruta calculada en el servidor o cotizaciones
 * firmadas. Es una fase aparte, y el propio backend ya lo tiene anotado.
 */

/**
 * Velocidad urbana de referencia, en km/h.
 *
 * Maracaibo con tráfico normal. No pretende ser una predicción: es el factor
 * que convierte una distancia en los minutos que el contrato del servidor
 * exige, declarado en un sitio para que no aparezca disperso.
 */
export const VELOCIDAD_URBANA_KMH = 22;

export interface MetricasDelRecorrido {
  readonly distanciaKm: number;
  readonly minutos: number;
}

/**
 * La distancia aproximada del recorrido, SÓLO PARA PINTAR.
 *
 * NO ES AUTORIDAD DE NADA. Desde PASSENGER-TRIP-HARDENING-1 el precio sale de
 * lo que mide el servidor, y este número no viaja en ninguna petición: sirve
 * para enseñar «unos 3 km» mientras llega la respuesta, y nada más. Si alguna
 * vez vuelve a viajar en un cuerpo, el precio vuelve a ser manipulable.
 */
export function metricasDelRecorrido(
  origen: PuntoDelViaje,
  destino: PuntoDelViaje
): MetricasDelRecorrido {
  const kilometros = distanciaKm(
    { lat: origen.lat, lng: origen.lng },
    { lat: destino.lat, lng: destino.lng }
  );
  // Dos decimales: más precisión sería fingir que la línea recta conoce las
  // calles.
  const distanciaRedondeada = Math.round(kilometros * 100) / 100;
  const minutos = Math.max(1, Math.round((distanciaRedondeada / VELOCIDAD_URBANA_KMH) * 60));
  return { distanciaKm: distanciaRedondeada, minutos };
}

// ---------------------------------------------------------------------------
// La estimación: sólo lo que el servidor dijo
// ---------------------------------------------------------------------------

/**
 * Lo que `POST /api/pricing/estimate` devuelve, leído sin adornos.
 *
 * No hay ETA, ni descuento, ni precio anterior, ni promoción, porque el
 * servidor no manda nada de eso. Inventarlo en la pantalla sería prometer algo
 * que nadie va a cumplir.
 */
export interface Estimacion {
  readonly dolares: number;
  readonly distanciaKm: number;
  readonly minutos: number;
  readonly tipo: TipoEnLaPantalla;
  /** Recargo aplicado, si el servidor dice que hubo. `1` es sin recargo. */
  readonly multiplicador: number;
  readonly esDeNoche: boolean;
  readonly esHoraPico: boolean;
  /**
   * Bolívares, SÓLO si el servidor tiene una tasa de verdad.
   *
   * Con `FX_BCV_LIVE` apagado, `bcvRate` vale cero y `fareVES` sale cero.
   * Enseñar «Bs. 0,00» sería una cifra falsa, así que aquí queda `null` y la
   * pantalla no lo pinta.
   */
  readonly bolivares: number | null;
}

export function leerEstimacion(cuerpo: unknown): Estimacion | null {
  if (cuerpo === null || typeof cuerpo !== 'object') return null;
  const crudo = cuerpo as Record<string, unknown>;

  const dolares = Number(crudo.fareUSD);
  if (!Number.isFinite(dolares) || dolares <= 0) return null;

  const distancia = Number(crudo.distanceKm);
  const minutos = Number(crudo.durationMin);
  if (!Number.isFinite(distancia) || !Number.isFinite(minutos)) return null;

  const tasa = Number(crudo.exchangeRate);
  const enBolivares = Number(crudo.fareVES);

  const multiplicador = Number(crudo.multiplier);

  return {
    dolares,
    distanciaKm: distancia,
    minutos,
    tipo: tipoParaLaPantalla(crudo.rideType),
    multiplicador: Number.isFinite(multiplicador) && multiplicador > 0 ? multiplicador : 1,
    esDeNoche: crudo.isNight === true,
    esHoraPico: crudo.isPeak === true,
    // Sin tasa no hay bolívares que enseñar.
    bolivares: Number.isFinite(tasa) && tasa > 0 && Number.isFinite(enBolivares) && enBolivares > 0
      ? enBolivares
      : null
  };
}

// ---------------------------------------------------------------------------
// En qué punto está el pedido
// ---------------------------------------------------------------------------

/**
 * `ELIGIENDO`      poniendo origen, destino y vehículo
 * `ESTIMANDO`      preguntando el precio al servidor
 * `CON_PRECIO`     el servidor respondió; se puede confirmar
 * `PIDIENDO`       creando el viaje; NO se puede volver a pulsar
 * `RECHAZADO`      el servidor dijo que no, con su motivo
 */
export type FaseDelPedido = 'ELIGIENDO' | 'ESTIMANDO' | 'CON_PRECIO' | 'PIDIENDO' | 'RECHAZADO';

/**
 * ¿Se puede pedir precio?
 *
 * No mientras haya una petición en vuelo: dos estimaciones a la vez devuelven
 * dos respuestas y la última en llegar no tiene por qué ser la de la última
 * pregunta.
 */
export function puedeEstimar(fase: FaseDelPedido, falta: QueFalta): boolean {
  if (falta !== 'NADA') return false;
  return fase === 'ELIGIENDO' || fase === 'CON_PRECIO' || fase === 'RECHAZADO';
}

/**
 * ¿Se puede crear el viaje?
 *
 * Hace falta un precio del servidor —confirmar sin ver el precio no es
 * confirmar—, que no haya ya una creación en marcha ni un viaje activo, y que
 * no falte ninguno de los dos puntos.
 *
 * LO DE LOS PUNTOS NO SOBRA, Y COSTÓ ENCONTRARLO.
 *
 * `pedir()` se planta si el origen o el destino son `null`, pero esta función
 * no los miraba, así que el botón se pintaba habilitado igualmente. Y el origen
 * puede desaparecer DESPUÉS de haber visto el precio: sale del GPS, y basta con
 * que el teléfono pierda la posición un momento.
 *
 * Lo que se veía era esto: el precio en pantalla, el botón encendido, se pulsa,
 * y no pasa nada. Ni petición, ni error, ni aviso. Nada. Y la única pista de
 * que la aplicación seguía viva era que no se había caído.
 *
 * Un botón encendido es una promesa. Si la acción no puede salir, el botón se
 * apaga y quien mira sabe que falta algo.
 *
 * El servidor sigue siendo la defensa final: rechaza el segundo viaje por su
 * cuenta. Esto evita que se le pregunte dos veces.
 */
export function puedePedir(
  fase: FaseDelPedido,
  estimacion: Estimacion | null,
  hayViajeActivo: boolean,
  falta: QueFalta = 'NADA'
): boolean {
  if (hayViajeActivo) return false;
  if (estimacion === null) return false;
  if (falta !== 'NADA') return false;
  return fase === 'CON_PRECIO';
}

/**
 * El cuerpo de `POST /api/trips/create`.
 *
 * NO lleva `fareUSD`. Es deliberado: con métricas de ruta el servidor calcula
 * la tarifa y marca `fareSource: 'SERVER_CALCULATED'`, descartando la del
 * cliente. Mandarla igualmente no cambiaría el importe, pero dejaría escrito en
 * la petición que el teléfono opina del precio, y el día que alguien tocara ese
 * camino la opinión contaría.
 *
 * Tampoco lleva el identificador de la pasajera: el servidor lo saca del token
 * —`req.user.id`— e ignora lo que venga en el cuerpo.
 */
export function cuerpoParaCrear({
  origen,
  destino,
  tipo,
  clave
}: {
  readonly origen: PuntoDelViaje;
  readonly destino: PuntoDelViaje;
  readonly tipo: TipoEnLaPantalla;
  /** La clave de este intento. El mismo intento, la misma clave. */
  readonly clave: string;
}): Record<string, unknown> {
  return {
    pickup: puntoParaElServidor(origen),
    destination: puntoParaElServidor(destino),
    rideType: tipoParaElServidor(tipo),
    paymentMethod: PAGO_DE_ESTA_FASE,
    // NO VIAJAN NI KILÓMETROS NI PRECIO.
    //
    // Antes iban `distanceKm` y `durationMin`, y el servidor cobraba con ellos:
    // declarar cuarenta kilómetros donde había uno cambiaba el importe. Ahora
    // sólo van los dos puntos y el servidor mide.
    id: clave
  };
}

/**
 * La clave de un intento de pedir.
 *
 * Se genera UNA VEZ por intento de la persona, no una por reintento de red: en
 * eso consiste. Si el primer envío llega y la respuesta se pierde, el reintento
 * lleva la misma clave y el servidor devuelve el viaje que ya creó en vez de
 * crear otro.
 *
 * El formato lo fija el servidor: hasta 80 caracteres de letras, dígitos, guión
 * y guión bajo.
 */
export function claveDeIntento(): string {
  const azar = Math.random().toString(36).slice(2, 10);
  return `trip_${Date.now().toString(36)}_${azar}`;
}

// ---------------------------------------------------------------------------
// Por qué no se pudo
// ---------------------------------------------------------------------------

/**
 * En qué estado deja la pantalla un fallo.
 *
 * POR QUÉ NO BASTA CON EL MENSAJE
 *
 * «No se pudo» es la misma frase para un túnel sin cobertura, para un servidor
 * caído y para haber tocado el botón demasiadas veces, y las tres piden cosas
 * distintas: esperar a salir del túnel, reintentar, o esperar un minuto. Un
 * solo estado de error obliga a la persona a adivinar cuál de las tres le toca.
 *
 * Se clasifica aquí, en el dominio, para que se pueda comprobar sin emulador.
 */
export type EstadoDeFallo =
  | 'OFFLINE'
  | 'RATE_LIMITED'
  | 'ACTIVE_TRIP_EXISTS'
  | 'SESION_CADUCADA'
  | 'ROUTE_ERROR'
  | 'PRICING_ERROR';

export function estadoDelFallo(fallo: {
  readonly motivo: string;
  readonly codigo: string | null;
  readonly estadoHttp?: number | null;
}): EstadoDeFallo {
  // Ya tiene un viaje: no es un fallo, es que hay que llevarla a verlo.
  if (fallo.codigo === 'ACTIVE_TRIP_EXISTS') return 'ACTIVE_TRIP_EXISTS';
  if (fallo.motivo === 'NO_AUTENTICADO') return 'SESION_CADUCADA';
  // Sin red no se crea nada local: no hay viaje falso esperando a subir.
  if (fallo.motivo === 'SIN_RED' || fallo.motivo === 'TIEMPO_AGOTADO') return 'OFFLINE';
  if (fallo.estadoHttp === 429) return 'RATE_LIMITED';
  // El recorrido no se pudo medir: los dos puntos no valen o el servidor no
  // supo trazar entre ellos.
  if (fallo.codigo === 'VALID_GPS_COORDINATES_REQUIRED' || fallo.codigo === 'INVALID_ROUTE_METRICS') {
    return 'ROUTE_ERROR';
  }
  return 'PRICING_ERROR';
}

/** Qué decirle a la persona, según lo que pasó de verdad. */
export function mensajeDelFallo(estado: EstadoDeFallo, mensajeDelServidor: string): string {
  switch (estado) {
    case 'OFFLINE':
      return 'Sin conexión. No se creó ningún viaje: inténtalo cuando vuelvas a tener señal.';
    case 'RATE_LIMITED':
      return 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.';
    case 'SESION_CADUCADA':
      return 'Tu sesión caducó. Entra otra vez.';
    case 'ROUTE_ERROR':
      return 'No pudimos calcular el recorrido. Revisa el destino en el mapa.';
    case 'ACTIVE_TRIP_EXISTS':
      return 'Ya tienes un viaje en marcha.';
    default:
      return mensajeDelServidor;
  }
}

/**
 * La huella de un intento de pedir.
 *
 * QUE HACE QUE DOS TOQUES SEAN EL MISMO INTENTO
 *
 * Mientras esta huella no cambie, la clave de idempotencia se conserva: el
 * segundo toque, o el reenvio despues de que se caiga la red, llegan con la
 * misma clave y el servidor devuelve el viaje que ya creo en vez de crear otro.
 *
 * EL ORIGEN VA REDONDEADO, Y ESO ES DELIBERADO
 *
 * El origen sale del GPS y se mueve solo: quieto encima de una mesa, el sensor
 * baila unos metros cada segundo. Con el valor exacto en la huella, dos toques
 * seguidos casi nunca compartirian clave --que es justo lo que hay que evitar--
 * porque el GPS habria respirado entre uno y otro.
 *
 * Cuatro decimales son unos once metros: el ruido del sensor cae dentro de la
 * misma celda, y cruzar la calle para que te recojan enfrente no. Es la misma
 * resolucion con la que el servidor agrupa recorridos en su cache.
 */
export function huellaDelIntento({
  origen,
  destino,
  tipo,
  pago
}: {
  readonly origen: PuntoDelViaje | null;
  readonly destino: PuntoDelViaje | null;
  readonly tipo: TipoEnLaPantalla;
  readonly pago: string;
}): string {
  const celda = (punto: PuntoDelViaje | null) =>
    punto === null ? 'sin' : `${punto.lat.toFixed(4)},${punto.lng.toFixed(4)}`;
  return [celda(origen), celda(destino), tipo, pago].join('|');
}
