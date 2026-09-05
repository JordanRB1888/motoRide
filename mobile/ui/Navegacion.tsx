/**
 * Las barras inferiores de +58Express.
 *
 * PASSENGER: CINCO ICONOS, UNA MUESCA QUE VIAJA Y UN DISCO QUE EMERGE
 *
 * Inicio, Historial, Pedir, Saldo y Perfil comparten la misma escala y no
 * llevan rótulos visibles. La posición anterior se conserva al cambiar de ruta
 * para que el movimiento no se convierta en «desaparece aquí, aparece allá».
 *
 * El movimiento tiene tres piezas y un compás, y ese compás es lo que lo hace
 * fluido en vez de correcto:
 *
 * 1. RETIRADA (50 ms). Al tocar, el icono activo se hunde y se apaga. Es lo
 *    que despeja el camino: si la muesca arrancara con el icono todavía puesto,
 *    lo que se vería es algo resbalando, no algo que va y viene.
 * 2. VIAJE. La muesca —el mordisco cóncavo de la superficie— se desliza con
 *    muelle hasta la pestaña nueva. Sale medio compás después de la retirada.
 * 3. ASCENSO. El icono vuelve a subir desde debajo de la barra, con un muelle
 *    poco amortiguado que se pasa un poco de largo y se asienta. Es el rebote.
 *
 * Y mientras la muesca pasa, cada icono que queda debajo SE DESVANECE y vuelve.
 * No es decoración: es lo que hace creer que la muesca es un hueco de verdad en
 * la superficie y que los iconos están detrás de ella, no dibujados encima.
 *
 * El icono del destino activo viaja DENTRO del hueco, no en su pestaña. Es la
 * diferencia entre «el icono se ilumina» y «el hueco trae el icono»: lo segundo
 * es lo que se ve en la referencia, y es lo que se siente como una sola pieza.
 *
 * DENTRO DEL HUECO NO VA NADA. SÓLO EL ICONO
 *
 * Aquí hubo un disco, primero amarillo y luego blanco, y los dos sobraban. El
 * amarillo dejaba la barra con dos círculos amarillos —éste y el central de
 * pedir— y por tanto sin protagonista: el ojo no distinguía la acción del sitio
 * donde estás. El blanco quitaba el empate pero tapaba el hueco justo donde
 * tenía que verse, y se leían dos formas, el mordisco y la ficha.
 *
 * Ahora es una sola: un icono suspendido en el vacío. El amarillo queda entero
 * para el botón central, que es el que se pulsa; el sitio donde estás lo dicen
 * la forma del hueco, la altura, la tinta primaria y dos puntos más de tamaño.
 *
 * Todo va por `transform` y `opacity` sobre el hilo de interfaz. Ni una sola
 * medida de caja se anima: en un teléfono modesto con el mapa moviéndose
 * detrás, animar anchos o alturas es lo que convierte 60 cuadros en 20.
 *
 * CONDUCTOR: SE CONSERVA EL DISCO DE DISPONIBILIDAD
 *
 * No se inventó aquí. Viene de `src/styles/modern-yellow-lab.css`, donde ya
 * está resuelto y donde el comentario original explica por qué es así: ponerse
 * en línea es la acción más importante de la pantalla y vivía como un
 * interruptor pequeño en una esquina de la cabecera, así que pasó al centro de
 * la barra, con la moto de la marca y el verde que ya significa «activo» en el
 * resto de la aplicación.
 *
 * Se conserva todo lo que decidía ese diseño: el disco que sobresale por
 * encima de la barra, la moto REAL dentro —el original ya probó un pictograma
 * genérico y «se leía como bicicleta»—, apagada fuera de línea y a todo color
 * al conectarse, el aro verde con fondo muy diluido para que la fotografía no
 * compita contra un fondo saturado, y el latido lento mientras está disponible.
 *
 * EL DISCO DEL CONDUCTOR MUERDE SU BARRA
 *
 * El disco no se apoya sobre la barra: le abre un hueco y sale por él. La barra
 * pinta bajo el disco un círculo del color del FONDO de la pantalla, un poco
 * mayor que el disco, y el lienzo lo recorta por arriba. Lo que queda es un
 * mordisco: el filo recto de la barra llega, se interrumpe en un arco, y vuelve
 * al otro lado.
 *
 * Por qué así y no con una biblioteca de gráficos: dibujar la silueta con SVG
 * daría una curva más suave, pero añadiría una dependencia nativa a un proyecto
 * que hoy no la tiene, y el binario de Android e iOS tendría que reconstruirse.
 * Un círculo recortado da el mismo efecto con lo que ya hay.
 *
 * El hueco va del color del FONDO, no transparente, porque React Native no sabe
 * recortar un agujero de verdad sin máscaras. En las pantallas de lista el
 * fondo coincide y la ilusión es perfecta; sobre el mapa se lee como un anillo
 * alrededor del disco, que también lo separa y también sirve.
 *
 * Y el disco FLOTA: sube y baja tres puntos muy despacio. Con el hueco quieto
 * debajo, ese vaivén es lo que hace que se vea salir de la barra en vez de
 * estar pegado a ella. Se apaga con movimiento reducido, como el latido.
 *
 * LO ÚNICO QUE CAMBIA DE MEDIO
 *
 * En la web la moto se apaga con `filter: grayscale(1)`. React Native no tiene
 * filtros de imagen sin añadir una biblioteca, así que aquí se apaga bajando la
 * opacidad. Misma intención —apagada frente a encendida—, distinto medio; es la
 * única diferencia con el original y conviene decirla en vez de que parezca que
 * el gris se perdió por descuido.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing as EasingAnimada,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icono, type NombreDeIcono } from './Icono';
import { Txt } from './componentes';
import { VEHICULOS } from '../theme/marca';
import { useTema } from '../theme/ThemeContext';
import { useIr } from './navegar';
import { useMovimientoReducido } from './movimiento';

// ---------------------------------------------------------------------------
// El disco: la forma común
// ---------------------------------------------------------------------------

const DIAMETRO = 56;

/**
 * Cuánto sube el disco por encima de la fila de iconos.
 *
 * A -24 apenas se despegaba y no se leía como el elemento principal, que es
 * justo lo que tiene que ser. Con la muesca sube un poco más: cuanto más
 * asoma, menos hondo hay que morder la barra, y el rótulo de debajo cabe sin
 * que el arco lo cruce.
 */
const SALIENTE = 34;

/** El aire entre el disco y el arco que la barra le abre. */
const HOLGURA_DE_LA_MUESCA = 5;
const RADIO_DE_LA_MUESCA = DIAMETRO / 2 + HOLGURA_DE_LA_MUESCA;

/** Lo que la barra deja de aire antes de la fila, y el grosor de su filo. */
const AIRE_SUPERIOR = 10;
const GROSOR_DEL_FILO = 1;

/**
 * El aire entre el disco y su rótulo.
 *
 * No es estético: es lo que mantiene el rótulo POR DEBAJO del arco. Si se
 * encoge, el mordisco le pasa por encima. Hay una prueba que lo calcula.
 */
const AIRE_DEL_ROTULO = 9;

/** El centro del disco, medido desde el borde superior de la barra. */
const CENTRO_DEL_DISCO = GROSOR_DEL_FILO + AIRE_SUPERIOR - SALIENTE + DIAMETRO / 2;

/** Lo que el disco sube y baja al flotar. */
const VUELO = 3;

function Disco({ aro, fondo, moto, latiendo, abierto }: {
  readonly aro: string;
  readonly fondo: string;
  /** Opacidad de la moto: apagada o a todo color. */
  readonly moto: number;
  readonly latiendo: boolean;
  /** Con la hoja abierta, la moto se sustituye por el aspa de cerrar. */
  readonly abierto?: boolean;
}) {
  const tema = useTema();
  const latido = useRef(new Animated.Value(0)).current;
  const flote = useRef(new Animated.Value(0)).current;
  const quieto = useMovimientoReducido();

  // Abierto el disco es «cerrar», y lo que cierra no se mueve: quieto se toca
  // mejor y no compite con la hoja que acaba de abrirse.
  const flotando = !abierto && !quieto;

  useEffect(() => {
    if (!flotando) {
      flote.stopAnimation();
      flote.setValue(0);
      return;
    }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(flote, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(flote, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [flotando, flote]);

  useEffect(() => {
    if (!latiendo || quieto) {
      latido.stopAnimation();
      latido.setValue(0);
      return;
    }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(latido, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [latiendo, quieto, latido]);

  return (
    // Flota el conjunto, no sólo el disco: si el aro del latido se quedara
    // quieto se vería que son dos piezas.
    <Animated.View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY: flote.interpolate({ inputRange: [0, 1], outputRange: [0, -VUELO] }) }]
      }}
    >
      {/* El latido: un aro que se expande y se desvanece. Va por escala y
          opacidad, que el hilo nativo puede animar sin pasar por JavaScript
          — importante en un teléfono modesto con el mapa moviéndose. */}
      {latiendo ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: DIAMETRO, height: DIAMETRO, borderRadius: DIAMETRO / 2,
            backgroundColor: aro,
            opacity: latido.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.04] }),
            transform: [{ scale: latido.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.42] }) }]
          }}
        />
      ) : null}

      <View style={{
        width: DIAMETRO, height: DIAMETRO, borderRadius: DIAMETRO / 2,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: fondo,
        borderWidth: 2,
        borderColor: aro,
        shadowColor: '#000000',
        shadowOpacity: 0.42,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10
      }}>
        {abierto ? (
          <Aspa color={tema.color.textoPrimario} />
        ) : (
          <Animated.Image
            source={VEHICULOS.MOTO.mapa}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={{ width: 34, height: 34, opacity: moto }}
          />
        )}
      </View>
    </Animated.View>
  );
}

/** El aspa de cerrar: dos barras cruzadas. */
function Aspa({ color }: { readonly color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      {[45, -45].map(giro => (
        <View key={giro} style={{
          position: 'absolute',
          width: 21, height: 2.4, borderRadius: 2,
          backgroundColor: color,
          transform: [{ rotate: `${giro}deg` }]
        }} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Los dos controles centrales
// ---------------------------------------------------------------------------

/** El control del conductor: conectarse y desconectarse. */
export function ControlDeDisponibilidad({ enLinea, onAlternar }: {
  readonly enLinea: boolean;
  readonly onAlternar?: () => void;
}) {
  const tema = useTema();
  const verde = tema.color.exito;
  const quieto = useMovimientoReducido();
  const pulsacion = useRef(new Animated.Value(1)).current;

  const presionar = () => {
    if (quieto) { pulsacion.setValue(0.93); return; }
    Animated.spring(pulsacion, {
      toValue: 0.93,
      speed: 24,
      bounciness: 0,
      useNativeDriver: true
    }).start();
  };

  const soltar = () => {
    if (quieto) { pulsacion.setValue(1); return; }
    Animated.spring(pulsacion, {
      toValue: 1,
      speed: 18,
      bounciness: 8,
      useNativeDriver: true
    }).start();
  };

  return (
    <Pressable
      onPress={onAlternar}
      onPressIn={presionar}
      onPressOut={soltar}
      accessibilityRole="switch"
      accessibilityState={{ checked: enLinea }}
      accessibilityLabel={enLinea ? 'En línea. Tocar para desconectarse' : 'Fuera de línea. Tocar para conectarse'}
      style={{
        alignItems: 'center',
        gap: AIRE_DEL_ROTULO,
        // Sobresale por encima de la barra sin hacerla más alta: lo que sube
        // aquí se compensa con el aire del rótulo, y el control acaba midiendo
        // lo mismo que una pestaña normal.
        marginTop: -SALIENTE
      }}
    >
      <Animated.View style={{ transform: [{ scale: pulsacion }] }}>
        <Disco
          aro={enLinea ? verde : tema.color.borde}
          fondo={enLinea ? `${verde}38` : tema.color.superficieElevada}
          moto={enLinea ? 1 : 0.45}
          latiendo={enLinea}
        />
      </Animated.View>
      <Txt nivel="etiqueta" tono={enLinea ? 'exito' : 'tenue'}>
        {enLinea ? 'En línea' : 'Conectar'}
      </Txt>
    </Pressable>
  );
}

/**
 * El control de la pasajera: abrir y cerrar la petición de viaje.
 *
 * Ocupa la tercera de las cinco posiciones de Passenger. Al abrirse queda
 * seleccionado y el mismo sitio cierra lo que abrió.
 *
 * SIN MANEJADOR, NAVEGA
 *
 * Es el botón más importante de la aplicación y estaba muerto en casi todas
 * las pantallas: cada una lo montaba sin decirle qué hacer, y un disco que no
 * responde al tocarlo se lee como una aplicación rota, no como una pantalla sin
 * terminar.
 *
 * El arreglo va AQUÍ y no en las doce pantallas que lo montan, por la misma
 * razón que la barra resuelve sola sus pestañas: el comportamiento por defecto
 * de una pieza es de la pieza. Quien necesite otra cosa —abrir una hoja en vez
 * de cambiar de pantalla— sigue pasando su `onAlternar` y manda.
 */
export function ControlDePedido({ abierto, onAlternar }: {
  readonly abierto: boolean;
  readonly onAlternar?: () => void;
}) {
  const tema = useTema();
  const ir = useIr();
  const quieto = useMovimientoReducido();
  const escala = useSharedValue(1);
  const anillo = useSharedValue(0);
  // Abierto cierra, cerrado abre: el mismo sitio deshace lo que hizo.
  const alternar = onAlternar ?? (() => ir(abierto ? 'inicio' : 'pedir'));

  useEffect(() => {
    cancelAnimation(escala);
    cancelAnimation(anillo);
    if (quieto) {
      escala.set(1);
      anillo.set(0);
      return;
    }
    escala.set(withRepeat(withSequence(
      withDelay(2300, withTiming(1.035, { duration: 120 })),
      withTiming(1, { duration: 180 })
    ), -1, false));
    anillo.set(withRepeat(withSequence(
      withDelay(2300, withTiming(1, { duration: 1 })),
      withTiming(0, { duration: 420 })
    ), -1, false));
    return () => {
      cancelAnimation(escala);
      cancelAnimation(anillo);
    };
  }, [anillo, escala, quieto]);

  const estiloBoton = useAnimatedStyle(() => ({
    transform: [{ scale: escala.get() }]
  }));
  const estiloAnillo = useAnimatedStyle(() => ({
    opacity: quieto ? 0 : interpolate(anillo.get(), [0, 1], [0, 0.14]),
    transform: [{ scale: interpolate(anillo.get(), [0, 1], [1.15, 1]) }]
  }));

  const presionar = () => {
    cancelAnimation(escala);
    escala.set(quieto ? 1 : withTiming(0.94, { duration: 100 }));
  };
  const soltar = () => {
    if (quieto) return;
    escala.set(withSequence(
      withSpring(1.05, { duration: 150, dampingRatio: 0.86 }),
      withSpring(1, { duration: 160, dampingRatio: 1 })
    ));
  };

  return (
    <Pressable
      onPress={alternar}
      onPressIn={presionar}
      onPressOut={soltar}
      accessibilityRole="button"
      accessibilityLabel={abierto ? 'Cerrar la petición de viaje' : 'Pedir un viaje'}
      accessibilityState={{ expanded: abierto }}
      hitSlop={8}
      pressRetentionOffset={16}
      style={{ width: 68, height: 68, marginTop: -12, alignItems: 'center', justifyContent: 'center' }}
    >
      <Reanimated.View pointerEvents="none" style={[
        {
          position: 'absolute', width: 64, height: 64, borderRadius: 32,
          borderWidth: 2, borderColor: tema.color.acento
        },
        estiloAnillo
      ]} />
      <Reanimated.View style={[
        {
          width: 58, height: 58, borderRadius: 29,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: tema.color.acento,
          borderWidth: 2, borderColor: tema.color.acentoPresionado,
          shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 9,
          shadowOffset: { width: 0, height: 5 }, elevation: 10
        },
        estiloBoton
      ]}>
        <Icono nombre="servicios" color={tema.color.sobreAcento} tamano={26} activo />
      </Reanimated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Barra inferior
// ---------------------------------------------------------------------------

export interface DestinoDeNavegacion {
  readonly clave: string;
  readonly icono: NombreDeIcono;
  readonly etiqueta: string;
}

// ---------------------------------------------------------------------------
// Barra curva de la pasajera
// ---------------------------------------------------------------------------

const CANTIDAD_DE_PESTANAS = 5;
const ANCHO_DE_LA_CURVA = 58;
const ALTO_DE_LA_CURVA = 26;
const INICIO_DE_LA_SUPERFICIE = 18;
const ALTO_DE_LA_FILA = 58;

/**
 * Lo que la barra ocupa, sin contar el área segura de abajo.
 *
 * Se exporta para que una pantalla con hoja inferior pueda reservar el hueco en
 * lugar de adivinarlo. La hoja de pedir se lo dejaba, y el resultado era que el
 * botón «Pedir viaje» quedaba DEBAJO de la barra: se veía entero, pero el toque
 * se lo llevaba el disco central —que cierra la petición— o una pestaña, que
 * navegaba a otra pantalla. Pulsarlo no pedía el viaje nunca.
 *
 * Quien la use tiene que sumarle el área segura, igual que hace la barra:
 * `ALTO_DE_LA_BARRA + Math.max(inferior, 8)`.
 */
export const ALTO_DE_LA_BARRA = INICIO_DE_LA_SUPERFICIE + ALTO_DE_LA_FILA;

/**
 * La caja que centra el icono flotante. No se ve.
 *
 * Se llamaba `DIAMETRO_CIRCULO_ACTIVO` cuando aquí había un disco. Ya no lo
 * hay: lo único que queda de aquella pieza es esta caja, que no pinta nada y
 * sólo sirve para poner el icono en el centro del hueco y prestarle el
 * movimiento.
 */
const CAJA_DEL_ICONO_ACTIVO = 48;

/**
 * Lo que la muesca abre, y lo hondo que muerde.
 *
 * Es EL VACÍO, y ahora es lo único que hay: dentro no va ninguna superficie,
 * sólo el icono suspendido. Cincuenta y seis por veintiséis deja unos catorce
 * puntos de aire alrededor del icono, que es lo que hace que se lea como un
 * hueco de verdad y no como un icono un poco más arriba que los otros.
 *
 * Sale de una constante y no de tres números escritos a mano porque el ancho lo
 * usan la muesca y sus dos hombros: con números sueltos, mover uno deja los
 * otros donde estaban y aparece un escalón.
 */
const ANCHO_DE_LA_MUESCA = 56;
const HONDURA_DE_LA_MUESCA = 26;

/**
 * El compás del movimiento.
 *
 * `RETIRADA_MS` es el silencio: el disco se hunde antes de que la muesca salga.
 * Es corto a propósito —cincuenta milisegundos no se perciben como espera— pero
 * sin él las dos piezas arrancan a la vez y el conjunto se lee como una sola
 * pastilla deslizándose.
 */
const RETIRADA_MS = 50;

/** Desde cuánto más abajo emerge el disco. Sale de dentro de la barra. */
const ASCENSO = 34;

/**
 * El muelle de la muesca: firme, casi sin rebote. Es superficie, y una
 * superficie que rebota se lee como gelatina.
 */
const MUELLE_DE_LA_MUESCA = { duration: 420, dampingRatio: 0.82 } as const;

/**
 * El muelle del disco: poco amortiguado a propósito. El disco sí rebota —es un
 * objeto que sale de un sitio— y ese pasarse de largo es justo lo que se ve en
 * la referencia.
 */
const MUELLE_DEL_ASCENSO = { duration: 460, dampingRatio: 0.7 } as const;

/**
 * Con movimiento reducido el disco no vuela: se coloca. Pero el icono activo
 * sigue subiendo lo justo para que se note cuál es, sin que nada cruce la
 * pantalla.
 */
const ELEVACION_QUIETA = -4;

/**
 * La última posición sobrevive al cambio de ruta.
 *
 * Cada pantalla monta su propia barra. Sin este dato, al navegar la curva
 * nacería directamente debajo del destino nuevo y el recorrido se perdería.
 * Sólo se conserva geometría visual; ninguna navegación ni estado de negocio.
 */
let ultimoIndiceDePasajera = 0;

function posicionDeCurva(ancho: number, indice: number): number {
  return (ancho / CANTIDAD_DE_PESTANAS) * (indice + 0.5) - ANCHO_DE_LA_CURVA / 2;
}

function indiceDelDestino(clave: string): number {
  if (clave === 'inicio') return 0;
  if (clave === 'historial') return 1;
  if (clave === 'pedir') return 2;
  if (clave === 'saldo') return 3;
  if (clave === 'perfil') return 4;
  return 0;
}

/**
 * Icono táctil sin rótulo visible.
 *
 * Aquí SÓLO vive el icono apagado. El del destino activo no está en su pestaña:
 * viaja dentro del disco, que es lo que hace que disco e icono se lean como una
 * sola pieza en vez de como dos cosas que coinciden.
 *
 * Lo que hace este icono es apartarse. Su opacidad la manda la posición REAL de
 * la muesca, no si la pestaña está activa: cuando la muesca le pasa por encima
 * se desvanece, y vuelve en cuanto se aleja. Por eso el hueco parece un hueco.
 */
function PestanaCurva({
  icono,
  etiqueta,
  activa,
  desplazamiento,
  centroDeLaMuesca,
  anchoDePestana,
  onPress
}: {
  readonly icono: NombreDeIcono;
  readonly etiqueta: string;
  readonly activa: boolean;
  /** La posición viva de la muesca. Es lo que apaga y enciende este icono. */
  readonly desplazamiento: SharedValue<number>;
  /** Dónde queda la muesca cuando está sobre ESTA pestaña. */
  readonly centroDeLaMuesca: number;
  /** Lo que hay que alejarse para volver a encenderse del todo. */
  readonly anchoDePestana: number;
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const pulsacion = useSharedValue(1);
  const seleccion = useSharedValue(activa && quieto ? 1 : 0);

  // La elevación sutil es SÓLO para movimiento reducido: sin el disco volando,
  // hace falta algo que diga cuál es el destino, y cuatro puntos no cruzan la
  // pantalla. Con movimiento normal este icono está apagado justo cuando esa
  // elevación ocurriría, así que no se anima por gusto.
  useEffect(() => {
    seleccion.set(quieto ? withTiming(activa ? 1 : 0, { duration: 120 }) : 0);
  }, [activa, quieto, seleccion]);

  const estiloDelIcono = useAnimatedStyle(() => ({
    opacity: interpolate(
      desplazamiento.get(),
      [centroDeLaMuesca - anchoDePestana, centroDeLaMuesca, centroDeLaMuesca + anchoDePestana],
      [1, 0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      { translateY: interpolate(seleccion.get(), [0, 1], [0, ELEVACION_QUIETA], Extrapolation.CLAMP) },
      { scale: pulsacion.get() }
    ]
  }));

  const presionar = () => {
    pulsacion.set(withTiming(0.93, {
      duration: 90,
      easing: EasingAnimada.bezier(0.23, 1, 0.32, 1)
    }));
  };
  const soltar = () => {
    pulsacion.set(quieto ? 1 : withSpring(1, { duration: 160, dampingRatio: 1 }));
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={presionar}
      onPressOut={soltar}
      accessibilityRole="tab"
      accessibilityState={{ selected: activa }}
      accessibilityLabel={etiqueta}
      hitSlop={8}
      pressRetentionOffset={16}
      style={{ flex: 1, minWidth: 48, height: ALTO_DE_LA_FILA, alignItems: 'center', justifyContent: 'center' }}
    >
      <Reanimated.View style={[{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, estiloDelIcono]}>
        <Icono nombre={icono} color={tema.color.textoSecundario} tamano={25} />
      </Reanimated.View>
    </Pressable>
  );
}

function BarraCurvaDePasajera({
  destinos,
  activo,
  alTocar,
  control
}: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly alTocar: (clave: string) => void;
  readonly control: React.ReactNode;
}) {
  const inferior = useSafeAreaInsets().bottom;
  const { width: ancho } = useWindowDimensions();
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const indiceActivo = indiceDelDestino(activo);
  const anchoDePestana = ancho / CANTIDAD_DE_PESTANAS;
  const desplazamiento = useSharedValue(posicionDeCurva(ancho, ultimoIndiceDePasajera));

  // Cada pantalla monta su propia barra, así que «cambiar de pestaña» aquí es
  // casi siempre «montar con otro índice que el de antes». Se arranca con el
  // disco hundido para que el ascenso ocurra igual en los dos casos: al navegar
  // entre pantallas y al tocar con la barra ya montada.
  const indiceAlMontar = useRef(ultimoIndiceDePasajera).current;
  const ascenso = useSharedValue(indiceAlMontar === indiceActivo ? 1 : 0);
  const indicePrevio = useRef(indiceAlMontar);

  useEffect(() => {
    const destino = posicionDeCurva(ancho, indiceActivo);
    const cambio = indicePrevio.current !== indiceActivo;
    indicePrevio.current = indiceActivo;
    ultimoIndiceDePasajera = indiceActivo;

    if (quieto) {
      desplazamiento.set(destino);
      ascenso.set(1);
      return;
    }
    if (!cambio) {
      desplazamiento.set(withSpring(destino, MUELLE_DE_LA_MUESCA));
      ascenso.set(1);
      return;
    }
    // El compás: el disco se retira, la muesca sale medio compás después, y el
    // disco vuelve a subir donde ella acaba de llegar.
    ascenso.set(withSequence(
      withTiming(0, { duration: RETIRADA_MS }),
      withSpring(1, MUELLE_DEL_ASCENSO)
    ));
    desplazamiento.set(withDelay(RETIRADA_MS, withSpring(destino, MUELLE_DE_LA_MUESCA)));
  }, [ancho, ascenso, desplazamiento, indiceActivo, quieto]);

  const estiloDeLaCurva = useAnimatedStyle(() => ({
    transform: [{ translateX: desplazamiento.get() }]
  }));

  // El icono emerge de dentro de la barra. Sube y se enciende a la vez, y la
  // opacidad va por delante del recorrido para que lo que asoma por debajo del
  // filo ya sea invisible: sin eso se vería el icono cruzando la franja del
  // sistema por debajo de la barra.
  const estiloDelDisco = useAnimatedStyle(() => ({
    opacity: interpolate(ascenso.get(), [0, 0.5, 1], [0, 0.5, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(ascenso.get(), [0, 1], [ASCENSO, 0], Extrapolation.CLAMP) }]
  }));

  const [inicio, historial, saldo, perfil] = destinos;
  if (inicio === undefined || historial === undefined || saldo === undefined || perfil === undefined) return null;

  // Qué icono lleva el disco. En el centro no lleva ninguno: ese sitio es del
  // FAB de pedir, que tiene su propio disco y no se toca.
  const iconoDelDisco = indiceActivo === 0 ? inicio.icono
    : indiceActivo === 1 ? historial.icono
      : indiceActivo === 3 ? saldo.icono
        : indiceActivo === 4 ? perfil.icono
          : null;

  return (
    <View style={{
      height: INICIO_DE_LA_SUPERFICIE + ALTO_DE_LA_FILA + Math.max(inferior, 8),
      backgroundColor: 'transparent'
    }}>
      {/* Superficie base de la barra (grafito profundo C2) */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: INICIO_DE_LA_SUPERFICIE,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: tema.color.superficieElevada,
        borderTopWidth: 1,
        borderTopColor: tema.color.borde
      }} />

      {/* El hueco: una hendidura cóncava por la que se ve el fondo de la
          pantalla, con el icono del destino activo flotando dentro. Viaja entre
          las pestañas con muelle. */}
      <Reanimated.View pointerEvents="none" style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: ANCHO_DE_LA_CURVA,
          height: INICIO_DE_LA_SUPERFICIE + ALTO_DE_LA_CURVA,
          alignItems: 'center',
          zIndex: 1
        },
        estiloDeLaCurva
      ]}>
        {/* La hendidura cóncava. Se pinta del color del FONDO de la pantalla, no
            de la barra: por eso se lee como un hueco y no como una pastilla. */}
        <View style={{
          position: 'absolute',
          top: INICIO_DE_LA_SUPERFICIE - 1,
          width: ANCHO_DE_LA_MUESCA,
          height: HONDURA_DE_LA_MUESCA,
          backgroundColor: tema.color.fondo,
          borderBottomLeftRadius: ANCHO_DE_LA_MUESCA / 2,
          borderBottomRightRadius: ANCHO_DE_LA_MUESCA / 2,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderWidth: 1,
          borderColor: tema.color.borde,
          borderTopWidth: 0
        }} />

        {/* Hombros cóncavos laterales para transición orgánica con el borde horizontal */}
        <View style={{
          position: 'absolute',
          top: INICIO_DE_LA_SUPERFICIE,
          left: (ANCHO_DE_LA_CURVA - ANCHO_DE_LA_MUESCA) / 2 - 8,
          width: 8,
          height: 8,
          borderBottomRightRadius: 8,
          backgroundColor: tema.color.superficieElevada,
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderColor: tema.color.borde
        }} />
        <View style={{
          position: 'absolute',
          top: INICIO_DE_LA_SUPERFICIE,
          right: (ANCHO_DE_LA_CURVA - ANCHO_DE_LA_MUESCA) / 2 - 8,
          width: 8,
          height: 8,
          borderBottomLeftRadius: 8,
          backgroundColor: tema.color.superficieElevada,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderColor: tema.color.borde
        }} />

        {/* EL ICONO SOLO, FLOTANDO EN EL HUECO. NO HAY DISCO.

            Aquí hubo un círculo: primero amarillo, luego blanco. Los dos
            sobraban. Lo que la muesca abre es un VACÍO —un mordisco por el que
            se ve el fondo de la pantalla— y meterle dentro una pastilla lo
            tapaba justo donde tenía que verse. Con el círculo puesto se leían
            dos formas, el hueco y la ficha; sin él se lee una sola cosa: un
            icono suspendido en el aire que se hunde, se apaga, y vuelve a subir
            donde el hueco acaba de llegar.

            De ahí que esta caja no pinte NADA. No tiene fondo, ni filo, ni
            sombra: sólo centra el icono y le presta el movimiento. Una sombra
            aquí sería mentira —no hay superficie que la proyecte— y en Android
            la elevación sobre una caja transparente dibuja un rectángulo.

            Lo que hace que resalte es lo que le queda: está en el hueco, está
            más alto que sus compañeros, va en tinta primaria mientras ellos van
            en secundaria, y es dos puntos más grande. */}
        {iconoDelDisco === null ? null : (
          <Reanimated.View style={[
            {
              position: 'absolute',
              top: INICIO_DE_LA_SUPERFICIE - 14,
              width: CAJA_DEL_ICONO_ACTIVO,
              height: CAJA_DEL_ICONO_ACTIVO,
              alignItems: 'center',
              justifyContent: 'center'
            },
            estiloDelDisco
          ]}>
            {/* De TRAZO, no relleno. La variante rellena de `Icono` pinta los
                detalles interiores en `#0b0a09`: sobre el fondo claro del hueco
                las agujas del reloj quedaban a un paso de su propia esfera y se
                leía como un borrón. El trazo se lee igual de bien con los
                cuatro destinos. */}
            <Icono
              nombre={iconoDelDisco}
              color={tema.color.textoPrimario}
              tamano={27}
            />
          </Reanimated.View>
        )}
      </Reanimated.View>

      <View style={{
        zIndex: 2,
        flexDirection: 'row',
        paddingTop: 7,
        paddingBottom: Math.max(inferior, 8)
      }}>
        <PestanaCurva
          icono={inicio.icono}
          etiqueta={inicio.etiqueta}
          activa={indiceActivo === 0}
          desplazamiento={desplazamiento}
          centroDeLaMuesca={posicionDeCurva(ancho, 0)}
          anchoDePestana={anchoDePestana}
          onPress={() => alTocar(inicio.clave)}
        />
        <PestanaCurva
          icono={historial.icono}
          etiqueta={historial.etiqueta}
          activa={indiceActivo === 1}
          desplazamiento={desplazamiento}
          centroDeLaMuesca={posicionDeCurva(ancho, 1)}
          anchoDePestana={anchoDePestana}
          onPress={() => alTocar(historial.clave)}
        />
        <View style={{ flex: 1, minWidth: 48, alignItems: 'center' }}>{control}</View>
        <PestanaCurva
          icono={saldo.icono}
          etiqueta={saldo.etiqueta}
          activa={indiceActivo === 3}
          desplazamiento={desplazamiento}
          centroDeLaMuesca={posicionDeCurva(ancho, 3)}
          anchoDePestana={anchoDePestana}
          onPress={() => alTocar(saldo.clave)}
        />
        <PestanaCurva
          icono={perfil.icono}
          etiqueta={perfil.etiqueta}
          activa={indiceActivo === 4}
          desplazamiento={desplazamiento}
          centroDeLaMuesca={posicionDeCurva(ancho, 4)}
          anchoDePestana={anchoDePestana}
          onPress={() => alTocar(perfil.clave)}
        />
      </View>
    </View>
  );
}

/**
 * La barra de navegación.
 *
 * Flota sobre el mapa, así que lleva su propio fondo opaco: sobre un mapa
 * translúcido las etiquetas se vuelven ilegibles en cuanto pasa una calle
 * clara por debajo.
 *
 * Cuando hay control central los destinos se reparten a los lados. Como el
 * control lo llevan los dos roles, las dos barras tienen la misma silueta.
 */
export function BarraDeNavegacion({ destinos, activo, onSeleccionar, control }: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly onSeleccionar?: (clave: string) => void;
  /** El control central, si esta barra lo lleva. */
  readonly control?: React.ReactNode;
}) {
  const inferior = useSafeAreaInsets().bottom;
  const ir = useIr();

  // `onSeleccionar` manda si viene; si no, se navega al destino por su clave.
  // Asi la barra funciona igual montada dentro del router y suelta en el
  // laboratorio, sin que ninguna pantalla tenga que enterarse.
  const alTocar = onSeleccionar ?? ((clave: string) => ir(clave));

  // La petición sólo cambia la navegación de la pasajera. El conductor
  // conserva su disco de disponibilidad y toda su semántica de trabajo.
  const esBarraDePasajera = destinos.length === 4
    && destinos[0]?.clave === 'inicio'
    && destinos[1]?.clave === 'historial'
    && control !== undefined;

  if (esBarraDePasajera) {
    return (
      <BarraCurvaDePasajera
        destinos={destinos}
        activo={activo}
        alTocar={alTocar}
        control={control}
      />
    );
  }

  const mitad = Math.ceil(destinos.length / 2);
  const izquierda = control ? destinos.slice(0, mitad) : destinos;
  const derecha = control ? destinos.slice(mitad) : [];

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingTop: GROSOR_DEL_FILO + AIRE_SUPERIOR,
      paddingHorizontal: 6,
      // La franja del sistema: sin esto, en un teléfono con barra de gestos la
      // fila de iconos queda justo debajo del indicador.
      paddingBottom: Math.max(inferior, 10)
    }}>
      {/* El fondo y el filo van en un lienzo aparte, no en este View, porque el
          mordisco tiene que recortarse contra el borde de la barra y aquí no se
          puede poner overflow oculto: recortaría también el disco, que es justo
          lo que tiene que salir. */}
      <LienzoDeLaBarra conMuesca={control !== undefined} />

      {/* Izquierda, disco, derecha. El orden importa: pintado después de los
          dos grupos, el disco acababa pegado al borde derecho en vez de en el
          centro, que es justo donde tiene que estar para alcanzarlo con el
          pulgar sin recolocar la mano. */}
      <Grupo
        destinos={izquierda}
        activo={activo}
        alTocar={alTocar}
      />

      {control ? <View style={{ width: 76, alignItems: 'center' }}>{control}</View> : null}

      {derecha.length > 0 ? (
        <Grupo
          destinos={derecha}
          activo={activo}
          alTocar={alTocar}
        />
      ) : null}
    </View>
  );
}

/**
 * El fondo de la barra, su filo, y el mordisco que le hace el disco.
 *
 * Se dibuja por detrás de todo y no recibe toques: es superficie, no control.
 *
 * El mordisco es un círculo del color del fondo de la pantalla, centrado en el
 * mismo punto que el disco y un poco mayor. Su mitad de arriba queda fuera de
 * la barra y el recorte de aquí la elimina; la de abajo se come el filo y deja
 * el hueco. De ahí que el filo se pinte AQUÍ dentro y no como borde de la
 * barra: un borde no se puede morder.
 */
function LienzoDeLaBarra({ conMuesca }: { readonly conMuesca: boolean }) {
  const tema = useTema();

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
      <View style={{
        flex: 1,
        backgroundColor: tema.color.superficie,
        borderTopWidth: GROSOR_DEL_FILO,
        borderTopColor: tema.color.borde
      }} />

      {conMuesca ? (
        <View style={{
          position: 'absolute',
          left: '50%',
          marginLeft: -RADIO_DE_LA_MUESCA,
          top: CENTRO_DEL_DISCO - RADIO_DE_LA_MUESCA,
          width: RADIO_DE_LA_MUESCA * 2,
          height: RADIO_DE_LA_MUESCA * 2,
          borderRadius: RADIO_DE_LA_MUESCA,
          backgroundColor: tema.color.fondo,
          // El arco lleva el mismo filo que la barra: sin él el hueco se
          // deshilacha en modo noche, donde el fondo y la superficie casi no se
          // distinguen.
          borderWidth: GROSOR_DEL_FILO,
          borderColor: tema.color.borde
        }} />
      ) : null}
    </View>
  );
}

/** Una mitad de la barra. Los dos lados reparten su ancho por igual. */
function Grupo({ destinos, activo, alTocar }: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly alTocar: (clave: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      {destinos.map(destino => (
        <Destino
          key={destino.clave}
          destino={destino}
          activo={destino.clave === activo}
          onPress={() => alTocar(destino.clave)}
        />
      ))}
    </View>
  );
}

/**
 * Tab de conductor con física Bouncy inspirada en MotionBar.
 *
 * Al interactuar, el icono responde con un suave encogimiento inicial,
 * seguido de una elevación elástica y asentamiento controlado.
 * Los demás iconos permanecen estables.
 */
function Destino({ destino, activo, onPress }: {
  readonly destino: DestinoDeNavegacion;
  readonly activo: boolean;
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const escala = useSharedValue(1);
  const elevacion = useSharedValue(0);
  const seleccion = useSharedValue(activo ? 1 : 0);

  useEffect(() => {
    seleccion.set(
      quieto
        ? (activo ? 1 : 0)
        : withSpring(activo ? 1 : 0, { duration: 250, dampingRatio: 0.82 })
    );

    if (activo && !quieto) {
      escala.set(
        withSequence(
          withTiming(0.93, { duration: 60, easing: EasingAnimada.bezier(0.25, 1, 0.5, 1) }),
          withSpring(1.08, { duration: 190, dampingRatio: 0.68 }),
          withSpring(1.0, { duration: 160, dampingRatio: 0.85 })
        )
      );
      elevacion.set(
        withSequence(
          withTiming(1.5, { duration: 60, easing: EasingAnimada.bezier(0.25, 1, 0.5, 1) }),
          withSpring(-5, { duration: 190, dampingRatio: 0.68 }),
          withSpring(0, { duration: 160, dampingRatio: 0.85 })
        )
      );
    } else {
      escala.set(1);
      elevacion.set(0);
    }
  }, [activo, elevacion, escala, quieto, seleccion]);

  const presionar = () => {
    if (quieto) return;
    escala.set(withTiming(0.93, { duration: 70, easing: EasingAnimada.bezier(0.2, 0.9, 0.3, 1) }));
    elevacion.set(withTiming(1.2, { duration: 70 }));
  };

  const soltar = () => {
    if (quieto) return;
    if (!activo) {
      escala.set(withSpring(1.0, { duration: 160, dampingRatio: 0.9 }));
      elevacion.set(withSpring(0, { duration: 160, dampingRatio: 0.9 }));
    }
  };

  const estiloIcono = useAnimatedStyle(() => ({
    transform: [
      { translateY: elevacion.get() },
      { scale: escala.get() }
    ]
  }));

  const estiloPunto = useAnimatedStyle(() => ({
    opacity: interpolate(seleccion.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(seleccion.get(), [0, 1], [0.3, 1], Extrapolation.CLAMP) }
    ]
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={presionar}
      onPressOut={soltar}
      accessibilityRole="tab"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={destino.etiqueta}
      hitSlop={8}
      pressRetentionOffset={14}
      style={{
        flex: 1,
        minWidth: 48,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3
      }}
    >
      <Reanimated.View style={[{ alignItems: 'center', justifyContent: 'center' }, estiloIcono]}>
        <Icono
          nombre={destino.icono}
          color={activo ? tema.color.acento : tema.color.textoTenue}
          tamano={26}
          activo={activo}
        />
      </Reanimated.View>
      <Reanimated.View
        pointerEvents="none"
        style={[
          {
            width: 4.5,
            height: 4.5,
            borderRadius: 2.25,
            backgroundColor: tema.color.acento
          },
          estiloPunto
        ]}
      />
    </Pressable>
  );
}

/**
 * Los destinos de la pasajera. Cuatro, con el control de pedir en el centro.
 *
 * Son los que la aplicación tiene de verdad: inicio, historial de viajes,
 * Transporte Seguro y perfil. No hay comida, ni tienda, ni paquetería:
 * +58express es mototaxi, y una rejilla de servicios que no existen sería
 * prometer lo que no hay.
 */
export const DESTINOS_DE_PASAJERA: readonly DestinoDeNavegacion[] = Object.freeze([
  { clave: 'inicio', icono: 'inicio', etiqueta: 'Inicio' },
  // «Historial», no «Viajes»: lo que hay ahí son los que YA hiciste. «Viajes»
  // en una aplicación de viajes no distingue nada — podría ser cualquier cosa.
  { clave: 'historial', icono: 'reloj', etiqueta: 'Historial' },
  // «Saldo» ocupa el sitio que tenía «Viaje seguro».
  //
  // Transporte Seguro tiene ahora su propia casilla en el inicio, grande y a la
  // vista, así que gastar una de las cuatro pestañas en repetirlo era gastarla
  // en algo que ya está a un toque. El saldo sí necesita pestaña: recargar y
  // revisar movimientos no se hace de un vistazo.
  //
  // El botón de EMERGENCIA no se pierde con la pestaña. Se muda a la pantalla
  // del viaje en curso, que es donde de verdad hace falta: ahí queda a un
  // toque, y antes obligaba a salirse del viaje para buscarlo.
  { clave: 'saldo', icono: 'dolar', etiqueta: 'Saldo' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);

/**
 * Los del conductor. Cuatro, con la disponibilidad en el centro.
 *
 * No hay pestaña de dinero. La cartera está apagada en el servidor, y una
 * pestaña que lleva a una cifra vacía —o peor, inventada— no es navegación.
 */
/**
 * Los del conductor. Cuatro, con la disponibilidad en el centro.
 *
 * «Saldo» ocupa el sitio que tenía «Jornada». Las cifras de la jornada —viajes
 * de hoy, tiempo en línea— ya salen al tocar el disco, así que una pestaña
 * entera para repetirlas era gastar uno de los cuatro sitios en algo que ya
 * está a un toque.
 *
 * Y el saldo sí necesita pantalla: recargar, pedir liquidación y revisar qué te
 * descontaron no se hace de un vistazo en un semáforo.
 */
export const DESTINOS_DE_CONDUCTOR: readonly DestinoDeNavegacion[] = Object.freeze([
  { clave: 'mapa', icono: 'inicio', etiqueta: 'Mapa' },
  { clave: 'saldo', icono: 'dolar', etiqueta: 'Saldo' },
  { clave: 'historial', icono: 'viajes', etiqueta: 'Historial' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);
