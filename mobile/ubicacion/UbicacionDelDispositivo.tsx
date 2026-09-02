/**
 * El GPS del teléfono. UNO para toda la aplicación.
 *
 * POR QUÉ UNA SOLA CAPA
 *
 * Si cada pantalla llamara a `watchPositionAsync` por su cuenta, un conductor
 * con el mapa y su jornada abiertos tendría dos observadores pidiendo GPS a la
 * vez, dos veces el gasto de batería, y dos posiciones que podrían no
 * coincidir. Aquí hay un solo observador y todos leen de él.
 *
 * Pasajera y conductor comparten esta capa. Lo que cambia entre ellos es qué
 * se hace con la posición, no cómo se obtiene.
 *
 * SÓLO PRIMER PLANO
 *
 * No se pide permiso de segundo plano, no se declara servicio en primer plano
 * y no se intenta seguir midiendo con la aplicación cerrada. Cuando se va al
 * fondo, el observador se para; al volver, se revisa el permiso y se reanuda.
 * El seguimiento continuo del conductor es otra fase, y necesita su propia
 * explicación al usuario antes de existir.
 *
 * LO QUE NO HACE
 *
 * No manda nada a ningún servidor —eso es LOCATION-INTEGRATION-1B—, no guarda
 * historial en el dispositivo, y no decide nada sobre el viaje. Es una fuente
 * de datos; quien la consume decide.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';

import {
  evaluarUbicacion,
  normalizarUbicacion,
  type MuestraDeUbicacion
} from '../domain/calidadDeUbicacion';
import {
  alFallar,
  conPosicion,
  UBICACION_INICIAL,
  type EstadoDeUbicacion
} from '../domain/ubicacion';

/**
 * PRECISIÓN: la del barrio, no la del metro cuadrado.
 *
 * `Highest` enciende el GPS a plena potencia y sirve para navegación paso a
 * paso; para saber en qué esquina esperas a la moto sobra, y se paga en
 * batería del teléfono de quien viaja.
 *
 * `Balanced` da unos cien metros usando redes y GPS con moderación, que es
 * poco para señalar un portal. `High` se queda en el término medio —unas
 * decenas de metros, suficiente para un punto de recogida— sin el consumo del
 * modo de navegación.
 */
const PRECISION = Location.Accuracy.High;

/**
 * Cada cuánto se acepta una lectura nueva.
 *
 * Cinco segundos y diez metros. Andando, diez metros son unos siete segundos;
 * en moto, menos de uno. El que primero se cumpla manda, así que parado no
 * llegan lecturas y en marcha llegan a buen ritmo. Sin estos límites el
 * sistema entrega varias por segundo y cada una repinta el mapa.
 */
const CADA_MS = 5_000;
const CADA_METROS = 10;

interface ValorDeUbicacion {
  readonly estado: EstadoDeUbicacion;
  /** Pide el permiso y arranca. Sólo hace algo si nunca se preguntó. */
  readonly pedirUbicacion: () => Promise<void>;
  /** Una lectura puntual, para cuando alguien quiere centrar el mapa ya. */
  readonly refrescar: () => Promise<void>;
}

const Contexto = createContext<ValorDeUbicacion | null>(null);

export function ProveedorDeUbicacion({ children }: { readonly children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDeUbicacion>(UBICACION_INICIAL);

  // La última ACEPTADA, no la última recibida: si se guardara la recibida, una
  // racha de lecturas malas se iría validando entre ellas.
  const aceptada = useRef<MuestraDeUbicacion | null>(null);

  // El observador vivo. En una referencia y no en estado porque cambiarlo no
  // tiene que repintar nada, y porque el efecto de limpieza necesita el valor
  // actual y no el del render en que se creó.
  const observador = useRef<Location.LocationSubscription | null>(null);

  // Evita dos arranques simultáneos: al volver del fondo puede coincidir con
  // un `pedirUbicacion` de una pantalla que acaba de montarse.
  const arrancando = useRef(false);

  const detener = useCallback(() => {
    observador.current?.remove();
    observador.current = null;
  }, []);

  /** Mete una lectura por las reglas de calidad antes de creérsela. */
  const admitir = useCallback((lectura: unknown) => {
    const muestra = normalizarUbicacion(lectura);
    const veredicto = evaluarUbicacion(muestra, { anterior: aceptada.current });
    if (!veredicto.aceptar || muestra === null) return;

    aceptada.current = muestra;
    setEstado(conPosicion(muestra));
  }, []);

  const arrancar = useCallback(async () => {
    if (arrancando.current || observador.current !== null) return;
    arrancando.current = true;

    try {
      // Que el teléfono tenga la ubicación apagada NO es lo mismo que negar el
      // permiso: se arregla de otra manera y hay que poder decirlo distinto.
      if (!(await Location.hasServicesEnabledAsync())) {
        setEstado(previo => alFallar(previo, 'SIN_SERVICIO', 'la ubicación del teléfono está apagada'));
        return;
      }

      setEstado(previo => ({ ...previo, fase: previo.posicion === null ? 'BUSCANDO' : previo.fase }));

      // Una lectura inmediata para no dejar el mapa esperando al primer
      // intervalo del observador.
      try {
        admitir(await Location.getCurrentPositionAsync({ accuracy: PRECISION }));
      } catch {
        // Que la primera falle no impide observar: la siguiente puede llegar.
      }

      observador.current = await Location.watchPositionAsync(
        { accuracy: PRECISION, timeInterval: CADA_MS, distanceInterval: CADA_METROS },
        admitir
      );
    } catch (error) {
      setEstado(previo => alFallar(previo, 'ERROR', descripcionDe(error)));
    } finally {
      arrancando.current = false;
    }
  }, [admitir]);

  const pedirUbicacion = useCallback(async () => {
    // Si ya se preguntó una vez, no se vuelve a insistir: el sistema deja de
    // enseñar el diálogo y el segundo intento sólo repite el «no».
    const yaConcedido = await Location.getForegroundPermissionsAsync();
    if (!yaConcedido.granted) {
      if (!yaConcedido.canAskAgain) {
        setEstado(previo => alFallar(previo, 'DENEGADA', 'el permiso está denegado en los ajustes'));
        return;
      }

      setEstado(previo => ({ ...previo, fase: 'PIDIENDO_PERMISO' }));
      // SÓLO primer plano. El de segundo plano no se pide en esta fase y no
      // aparece en ninguna parte del código.
      const respuesta = await Location.requestForegroundPermissionsAsync();
      if (!respuesta.granted) {
        setEstado(previo => alFallar(previo, 'DENEGADA', 'el permiso no se concedió'));
        return;
      }
    }

    await arrancar();
  }, [arrancar]);

  const refrescar = useCallback(async () => {
    const permiso = await Location.getForegroundPermissionsAsync();
    if (!permiso.granted) return;
    try {
      admitir(await Location.getCurrentPositionAsync({ accuracy: PRECISION }));
    } catch (error) {
      setEstado(previo => alFallar(previo, 'ERROR', descripcionDe(error)));
    }
  }, [admitir]);

  // Al volver del fondo hay que revisar el permiso: el usuario pudo quitarlo
  // en los ajustes mientras la aplicación no miraba, y también pudo
  // concederlo. Y al irse al fondo se para el observador: mantenerlo vivo con
  // trucos es justo lo que esta fase no hace.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', async siguiente => {
      if (siguiente !== 'active') {
        detener();
        return;
      }

      const permiso = await Location.getForegroundPermissionsAsync();
      if (permiso.granted) {
        await arrancar();
        return;
      }

      setEstado(previo => (
        previo.fase === 'DESCONOCIDA'
          ? previo
          : alFallar(previo, 'DENEGADA', 'el permiso ya no está concedido')
      ));
    });

    return () => suscripcion.remove();
  }, [arrancar, detener]);

  // Si la aplicación ya tenía permiso de una sesión anterior, se arranca sin
  // preguntar nada: volver a enseñar el diálogo a quien ya dijo que sí es
  // ruido.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const permiso = await Location.getForegroundPermissionsAsync();
      if (vigente && permiso.granted) await arrancar();
    })();

    return () => {
      vigente = false;
      detener();
    };
  }, [arrancar, detener]);

  const valor = useMemo(
    () => ({ estado, pedirUbicacion, refrescar }),
    [estado, pedirUbicacion, refrescar]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useUbicacion(): ValorDeUbicacion {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useUbicacion fuera de ProveedorDeUbicacion');
  }
  return valor;
}

/**
 * Un motivo legible, SIN coordenadas.
 *
 * Este texto puede acabar en un registro, y un registro con la posición de
 * alguien es un problema de privacidad que no compensa ninguna comodidad de
 * depuración.
 */
function descripcionDe(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return `el sistema no pudo entregar la ubicación (${Platform.OS})`;
}
