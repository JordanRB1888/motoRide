/**
 * La tarea que sigue diciendo dónde está el conductor con la pantalla apagada.
 *
 * POR QUÉ ESTE FICHERO NO ES UN COMPONENTE
 *
 * Cuando el teléfono se bloquea, React ya no está montado: no hay pantalla, no
 * hay contexto, no hay estado. El sistema despierta la aplicación, ejecuta esta
 * función y la vuelve a dormir. Por eso la tarea se define **al importar el
 * módulo** y no dentro de ningún componente — definirla en un `useEffect`
 * significaría que no existe justo cuando hace falta.
 *
 * POR QUÉ EL TRANSPORTE ES HTTP Y NO EL SOCKET
 *
 * Con la aplicación al fondo, el socket no es de fiar: el sistema suspende el
 * hilo de JavaScript y puede cerrar la conexión sin avisar. Una petición HTTP
 * suelta, en cambio, es exactamente lo que este momento permite: se abre, se
 * manda y se cierra.
 *
 * Y no hace falta inventar nada en el servidor: `PATCH /api/drivers/location`
 * ya existe, ya exige sesión de conductor aprobado, ya guarda la posición y ya
 * la difunde con `emitDriverLocation` — la misma función que usa el socket. La
 * pasajera recibe su `driverLocationUpdated` sin enterarse de por dónde vino.
 *
 * LA ÚLTIMA POSICIÓN GANA
 *
 * Si falla el envío, no se reintenta ni se guarda para después. No hace falta
 * reconstruir por dónde pasó la moto: hace falta saber dónde está AHORA, y eso
 * lo dirá la siguiente lectura en quince segundos. Guardar un histórico sería
 * gastar disco y privacidad para contar el pasado.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { llamar } from '../services/api';
import { leerToken } from '../services/session';
import {
  evaluarUbicacion,
  normalizarUbicacion,
  type MuestraDeUbicacion
} from '../domain/calidadDeUbicacion';
import {
  AGRUPAR_HASTA_METROS,
  AGRUPAR_HASTA_MS,
  CADA_METROS_EN_SEGUNDO_PLANO,
  CADA_MS_EN_SEGUNDO_PLANO,
  ESPERA_TRAS_EXCESO_MS,
  reaccionarAlFallo,
  TAREA_DE_UBICACION,
  tocaEnviar
} from '../domain/seguimientoEnSegundoPlano';

/**
 * Lo que la tarea recuerda entre despertares.
 *
 * En memoria del proceso, a propósito. Si el sistema mata la aplicación se
 * pierde, y eso está bien: lo único que se olvida es cuándo fue el último
 * envío, y la siguiente lectura se manda igual.
 *
 * Guardarlo en disco significaría escribir la posición de alguien en el
 * teléfono, que es justo lo que esta fase no hace.
 */
const memoria: {
  ultimoEnvio: number | null;
  ultimaAceptada: MuestraDeUbicacion | null;
  esperandoHasta: number | null;
} = { ultimoEnvio: null, ultimaAceptada: null, esperandoHasta: null };

/** Se llama al parar, para que un arranque nuevo no herede el ritmo viejo. */
export function olvidarLoDeLaTarea(): void {
  memoria.ultimoEnvio = null;
  memoria.ultimaAceptada = null;
  memoria.esperandoHasta = null;
}

/**
 * La definición. Se ejecuta al importar el módulo — antes de que exista
 * ninguna pantalla — y una sola vez: `TaskManager` ignora una segunda
 * definición con el mismo nombre, pero definirla en dos sitios haría imposible
 * saber cuál gana.
 */
TaskManager.defineTask(TAREA_DE_UBICACION, async ({ data, error }) => {
  // Un fallo del sistema no produce coordenadas. No se fabrica ninguna: la
  // última posición real caduca sola por la regla de frescura del servidor, y
  // el conductor deja de ser candidato, que es lo correcto cuando no se sabe
  // dónde está.
  if (error !== null && error !== undefined) return;

  const lecturas = (data as { locations?: unknown[] } | undefined)?.locations;
  if (!Array.isArray(lecturas) || lecturas.length === 0) return;

  // El sistema puede entregar varias lecturas juntas si las agrupó. Sólo
  // interesa la última: las anteriores ya son pasado.
  const muestra = normalizarUbicacion(lecturas[lecturas.length - 1]);

  // La MISMA autoridad de calidad que en primer plano. Un segundo criterio
  // aquí haría que la moto se comportara distinto según dónde esté la
  // pantalla, y nadie sabría cuál manda.
  const veredicto = evaluarUbicacion(muestra, { anterior: memoria.ultimaAceptada });
  if (!veredicto.aceptar || muestra === null) return;

  const ahora = Date.now();
  if (!tocaEnviar(memoria.ultimoEnvio, ahora, memoria.esperandoHasta)) {
    // No se manda, pero sí se recuerda: la siguiente comparación de calidad
    // debe hacerse contra la lectura buena más reciente.
    memoria.ultimaAceptada = muestra;
    return;
  }

  // Sin sesión no se manda nada. `leerToken` es la MISMA autoridad que usa el
  // resto de la aplicación: no hay una segunda copia del token en ninguna
  // parte, y menos fuera del almacén seguro.
  if ((await leerToken()) === null) return;

  const respuesta = await llamar('/api/drivers/location', {
    metodo: 'PATCH',
    cuerpo: {
      latitude: muestra.lat,
      longitude: muestra.lng,
      // El rumbo sólo si el sistema lo dio de verdad. El servidor rellena cero
      // cuando falta, y un cero inventado es indistinguible de «mira al
      // norte».
      ...(rumboDe(lecturas[lecturas.length - 1]) === null
        ? {}
        : { heading: rumboDe(lecturas[lecturas.length - 1]) })
    }
  });

  memoria.ultimaAceptada = muestra;

  if (respuesta.ok) {
    memoria.ultimoEnvio = ahora;
    memoria.esperandoHasta = null;
    return;
  }

  switch (reaccionarAlFallo(respuesta.estadoHttp ?? null)) {
    case 'PARAR':
      // Sesión caducada o revocada: insistir cada quince segundos durante
      // horas es exactamente el bucle que hay que evitar.
      await pararSeguimiento();
      return;
    case 'ESPERAR':
      memoria.esperandoHasta = ahora + ESPERA_TRAS_EXCESO_MS;
      return;
    default:
      // Transitorio. No se reintenta ni se guarda: la siguiente lectura llega
      // sola, y será más actual que ésta.
      memoria.ultimoEnvio = null;
  }
});

/** El rumbo de una lectura, sólo si es de fiar. */
function rumboDe(lectura: unknown): number | null {
  if (lectura === null || typeof lectura !== 'object') return null;
  const coords = (lectura as { coords?: Record<string, unknown> }).coords;
  const rumbo = Number(coords?.heading);
  // `expo-location` usa −1 —y a veces 0— cuando no lo sabe.
  if (!Number.isFinite(rumbo) || rumbo < 0 || rumbo === 0) return null;
  return ((rumbo % 360) + 360) % 360;
}

/**
 * Arrancar el seguimiento.
 *
 * Comprueba con el SISTEMA si ya está corriendo, no con una variable nuestra:
 * la tarea sobrevive a que se cierre la aplicación, así que un booleano de
 * React no sabe la verdad al volver a abrirla.
 */
export async function arrancarSeguimiento(): Promise<boolean> {
  if (await Location.hasStartedLocationUpdatesAsync(TAREA_DE_UBICACION)) return true;

  await Location.startLocationUpdatesAsync(TAREA_DE_UBICACION, {
    // Ver `domain/seguimientoEnSegundoPlano.ts` para el porqué de cada número.
    accuracy: Location.Accuracy.Balanced,
    timeInterval: CADA_MS_EN_SEGUNDO_PLANO,
    distanceInterval: CADA_METROS_EN_SEGUNDO_PLANO,
    deferredUpdatesInterval: AGRUPAR_HASTA_MS,
    deferredUpdatesDistance: AGRUPAR_HASTA_METROS,

    // Android exige un servicio en primer plano con notificación visible para
    // seguir midiendo con la aplicación cerrada. No es un requisito que se
    // pueda esquivar, y tampoco se querría: quien está siendo seguido tiene
    // que poder verlo y quitarlo.
    foregroundService: {
      notificationTitle: '+58Express está usando tu ubicación',
      notificationBody:
        'Tu ubicación se comparte mientras estás en servicio para recibir y realizar viajes.',
      notificationColor: '#f5c518',
      // Si el sistema mata la aplicación, el servicio se va con ella. Dejarlo
      // vivo sería seguir a alguien cuya aplicación ya no existe.
      killServiceOnDestroy: true
    },

    // iOS: el indicador azul de la barra es obligatorio y correcto — quien
    // está siendo seguido tiene que verlo.
    showsBackgroundLocationIndicator: true,
    activityType: Location.LocationActivityType.AutomotiveNavigation,
    // Que el sistema pause solo al detectarse quieto ahorraría batería, pero
    // deja de mandar posiciones sin avisar y el despacho da al conductor por
    // rancio. La frescura manda aquí.
    pausesUpdatesAutomatically: false
  });

  return true;
}

/**
 * Parar el seguimiento.
 *
 * Se comprueba con el sistema antes y se olvida lo recordado: si vuelve a
 * arrancar más tarde, empieza de cero.
 */
export async function pararSeguimiento(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TAREA_DE_UBICACION)) {
      await Location.stopLocationUpdatesAsync(TAREA_DE_UBICACION);
    }
  } finally {
    // Lo recordado se olvida PASE LO QUE PASE. Si parar falló —el sistema puede
    // negarse cuando acaban de quitarle el permiso— y luego se vuelve a
    // arrancar, heredar el ritmo de antes haría saltarse el primer envío
    // justo cuando más falta hace saber dónde está.
    olvidarLoDeLaTarea();
  }
}

/** Lo que el SISTEMA dice, no lo que creemos. Para comprobar de verdad. */
export async function estaSiguiendo(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TAREA_DE_UBICACION);
}
