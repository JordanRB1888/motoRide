/**
 * Las barras inferiores de +58Express.
 *
 * PASSENGER: CINCO ICONOS Y UNA CURVA QUE VIAJA
 *
 * Inicio, Historial, Pedir, Saldo y Perfil comparten la misma escala y no
 * llevan rótulos visibles. Una extensión orgánica de la superficie se desplaza
 * bajo el destino activo mientras ese icono sube y cambia al amarillo oficial.
 * La posición anterior se conserva al cambiar de ruta para que el movimiento
 * no se convierta en «desaparece aquí, aparece allá».
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
  withTiming
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

const DIAMETRO_CIRCULO_ACTIVO = 48;
const ELEVACION_ICONO_ACTIVO = -21;

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
 * Icono táctil sin rótulo visible. El icono activo se eleva de forma suave
 * hacia el círculo flotante superior sobre la hendidura orgánica, cambiando
 * a grafito oscuro sobre el amarillo oficial +58Express.
 */
function PestanaCurva({
  icono,
  etiqueta,
  activa,
  onPress
}: {
  readonly icono: NombreDeIcono;
  readonly etiqueta: string;
  readonly activa: boolean;
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const seleccion = useSharedValue(activa ? 1 : 0);
  const pulsacion = useSharedValue(1);
  const pulso = useSharedValue(1);

  useEffect(() => {
    seleccion.set(quieto
      ? withTiming(activa ? 1 : 0, { duration: 100 })
      : withSpring(activa ? 1 : 0, { duration: 280, dampingRatio: 0.82 }));

    if (activa && !quieto) {
      pulso.set(withSequence(
        withTiming(1.08, { duration: 110, easing: EasingAnimada.bezier(0.23, 1, 0.32, 1) }),
        withSpring(1, { duration: 170, dampingRatio: 0.88 })
      ));
    } else {
      pulso.set(1);
    }
  }, [activa, pulso, quieto, seleccion]);

  // Elevación orgánica: el icono activo sube con physics spring para centrarse
  // perfectamente dentro del círculo flotante amarillo (+58Express).
  // La escala base histórica [0, -4] se expande hacia el círculo flotante superior.
  const estiloDelIcono = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: quieto
          ? interpolate(seleccion.get(), [0, 1], [0, -4], Extrapolation.CLAMP)
          : interpolate(seleccion.get(), [0, 1], [0, ELEVACION_ICONO_ACTIVO], Extrapolation.CLAMP)
      },
      { scale: pulsacion.get() * pulso.get() }
    ]
  }));
  const estiloInactivo = useAnimatedStyle(() => ({
    opacity: interpolate(seleccion.get(), [0, 1], [1, 0], Extrapolation.CLAMP)
  }));
  const estiloActivo = useAnimatedStyle(() => ({
    opacity: interpolate(seleccion.get(), [0, 1], [0, 1], Extrapolation.CLAMP)
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

  const tamanoDelIcono = 25;
  const iconoInactivo = (
    <Icono nombre={icono} color={tema.color.textoSecundario} tamano={tamanoDelIcono} />
  );
  // El icono activo dentro del círculo flotante amarillo lleva color grafito profundo
  // (#111315 / sobreAcento) para máximo contraste y legibilidad impecable.
  const iconoActivo = (
    <Icono
      nombre={icono}
      color={tema.color.sobreAcento}
      tamano={tamanoDelIcono}
      activo={icono !== 'moto'}
    />
  );

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
        <Reanimated.View style={estiloInactivo}>{iconoInactivo}</Reanimated.View>
        <Reanimated.View style={[{ position: 'absolute' }, estiloActivo]}>{iconoActivo}</Reanimated.View>
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
  const desplazamiento = useSharedValue(posicionDeCurva(ancho, ultimoIndiceDePasajera));

  useEffect(() => {
    const destino = posicionDeCurva(ancho, indiceActivo);
    if (quieto) {
      desplazamiento.set(destino);
    } else {
      desplazamiento.set(withSpring(destino, {
        duration: 280,
        dampingRatio: 0.82
      }));
    }
    ultimoIndiceDePasajera = indiceActivo;
  }, [ancho, desplazamiento, indiceActivo, quieto]);

  const estiloDeLaCurva = useAnimatedStyle(() => ({
    transform: [{ translateX: desplazamiento.get() }]
  }));

  const [inicio, historial, saldo, perfil] = destinos;
  if (inicio === undefined || historial === undefined || saldo === undefined || perfil === undefined) return null;

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

      {/* Notch orgánico con hendidura cóncava y círculo flotante amarillo que viaja
          suavemente entre los destinos seleccionados con física spring */}
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
        {/* Notch / Hendidura cóncava que abraza el círculo flotante */}
        <View style={{
          position: 'absolute',
          top: INICIO_DE_LA_SUPERFICIE - 1,
          width: 66,
          height: 28,
          backgroundColor: tema.color.fondo,
          borderBottomLeftRadius: 33,
          borderBottomRightRadius: 33,
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
          left: (ANCHO_DE_LA_CURVA - 66) / 2 - 8,
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
          right: (ANCHO_DE_LA_CURVA - 66) / 2 - 8,
          width: 8,
          height: 8,
          borderBottomLeftRadius: 8,
          backgroundColor: tema.color.superficieElevada,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderColor: tema.color.borde
        }} />

        {/* Círculo activo flotante (+58Express amarillo oficial) */}
        <View style={{
          position: 'absolute',
          top: INICIO_DE_LA_SUPERFICIE - 14,
          width: DIAMETRO_CIRCULO_ACTIVO,
          height: DIAMETRO_CIRCULO_ACTIVO,
          borderRadius: DIAMETRO_CIRCULO_ACTIVO / 2,
          backgroundColor: tema.color.acento,
          borderWidth: 2.5,
          borderColor: tema.color.superficieElevada,
          shadowColor: '#000000',
          shadowOpacity: 0.32,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8
        }} />
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
          onPress={() => alTocar(inicio.clave)}
        />
        <PestanaCurva
          icono={historial.icono}
          etiqueta={historial.etiqueta}
          activa={indiceActivo === 1}
          onPress={() => alTocar(historial.clave)}
        />
        <View style={{ flex: 1, minWidth: 48, alignItems: 'center' }}>{control}</View>
        <PestanaCurva
          icono={saldo.icono}
          etiqueta={saldo.etiqueta}
          activa={indiceActivo === 3}
          onPress={() => alTocar(saldo.clave)}
        />
        <PestanaCurva
          icono={perfil.icono}
          etiqueta={perfil.etiqueta}
          activa={indiceActivo === 4}
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
