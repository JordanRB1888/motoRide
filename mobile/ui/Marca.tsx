/**
 * Los componentes que ponen la marca en pantalla.
 *
 * Existen para que ninguna pantalla escriba un `require` de una imagen ni
 * calcule a mano una altura. Todos dimensionan por el ancho y derivan el alto
 * de la proporción real del archivo, así que la moto no se puede aplastar
 * aunque alguien pase un alto raro: no hay ningún sitio donde se pueda pedir.
 *
 * Ninguno de estos activos se recolorea, se recorta ni se filtra. Son los
 * oficiales, y valen precisamente porque son reconocibles.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, View } from 'react-native';
import {
  EMBLEMA,
  LOGO_HORIZONTAL,
  PROPORCION_DEL_LOGO,
  VEHICULOS,
  type TipoDeVehiculo
} from '../theme/marca';
import { useTema } from '../theme/ThemeContext';

/**
 * El logotipo apaisado: «+58 EXPRESS» con el motociclista y las estelas.
 *
 * Se dimensiona por el ancho porque es lo que manda en una pantalla estrecha;
 * el alto sale de la proporción del archivo.
 */
export function LogoHorizontal({ ancho = 220 }: { readonly ancho?: number }) {
  return (
    <Image
      source={LOGO_HORIZONTAL}
      accessibilityLabel="+58 Express"
      accessibilityRole="image"
      resizeMode="contain"
      style={{ width: ancho, height: ancho / PROPORCION_DEL_LOGO }}
    />
  );
}

/**
 * El logotipo entrando desde la izquierda.
 *
 * NO ES UNA ANIMACIÓN NUEVA
 *
 * Es la que ya tiene la web, `passengerBrandRideIn`, con sus mismos cuatro
 * pasos: el logotipo llega desde fuera por la izquierda, se pasa un poco de
 * largo, rebota hacia atrás y asienta. 0,9 segundos y la misma curva.
 *
 * Está copiada y no reinterpretada porque ese gesto —la moto entrando en
 * escena— es de las pocas cosas de +58express que ya se reconocen. Hacer «algo
 * parecido pero mío» habría sido cambiar identidad por gusto personal.
 *
 * Lo único que se pierde es el `drop-shadow` amarillo que la acompaña: React
 * Native no tiene sombras de color sobre el contorno de una imagen, sólo
 * rectangulares. Se omite en vez de sustituirlo por una caja amarilla detrás,
 * que es lo que quedaría.
 */
export function LogoQueEntra({ ancho = 232, alDetenerse }: {
  readonly ancho?: number;
  /** Se avisa al terminar, por si algo tiene que esperar a que asiente. */
  readonly alDetenerse?: () => void;
}) {
  const avance = useRef(new Animated.Value(0)).current;
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setQuieto(activo); })
      .catch(() => { /* si no se puede consultar, se anima */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieto);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  useEffect(() => {
    if (quieto) {
      avance.setValue(1);
      alDetenerse?.();
      return;
    }
    const animacion = Animated.timing(avance, {
      toValue: 1,
      duration: 900,
      // La misma curva de la web: cubic-bezier(.16, .82, .24, 1).
      easing: Easing.bezier(0.16, 0.82, 0.24, 1),
      useNativeDriver: true
    });
    animacion.start(({ finished }) => { if (finished) alDetenerse?.(); });
    return () => animacion.stop();
  }, [avance, quieto, alDetenerse]);

  // Los cuatro pasos del original: fuera, pasado de largo, rebote y asiento.
  const pasos = [0, 0.52, 0.72, 1];

  return (
    <Animated.View style={{
      opacity: avance.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
      transform: [
        {
          translateX: avance.interpolate({
            inputRange: pasos,
            outputRange: [-ancho * 1.9, ancho * 0.1, -ancho * 0.04, 0]
          })
        },
        { scale: avance.interpolate({ inputRange: pasos, outputRange: [0.86, 1.035, 0.99, 1] }) },
        {
          rotate: avance.interpolate({
            inputRange: pasos,
            outputRange: ['-3deg', '0.8deg', '-0.35deg', '0deg']
          })
        }
      ]
    }}>
      <LogoHorizontal ancho={ancho} />
    </Animated.View>
  );
}

/**
 * El emblema circular: el pin con la moto.
 *
 * El archivo es cuadrado y con fondo amarillo hasta el canto, así que
 * recortarlo en círculo deja el amarillo como aro natural alrededor del pin
 * negro. Es lo mismo que hace el arranque de la web, y por eso los dos se
 * reconocen como la misma aplicación.
 */
export function Emblema({ tamano = 132 }: { readonly tamano?: number }) {
  return (
    <Image
      source={EMBLEMA}
      accessibilityLabel="+58 Express"
      accessibilityRole="image"
      style={{ width: tamano, height: tamano, borderRadius: tamano / 2 }}
    />
  );
}

/**
 * Un vehículo en vista de tres cuartos, para elegir servicio.
 *
 * La toma tiene fondo transparente, así que se apoya directamente sobre la
 * superficie sin recuadro. Cuando la opción no está elegida se apaga con
 * opacidad —nunca con un filtro de color— para que siga siendo la misma moto.
 */
export function Vehiculo({ tipo, ancho = 116, atenuado = false }: {
  readonly tipo: TipoDeVehiculo;
  readonly ancho?: number;
  readonly atenuado?: boolean;
}) {
  const vehiculo = VEHICULOS[tipo];

  return (
    <Image
      source={vehiculo.tarjeta}
      accessibilityLabel={vehiculo.nombre}
      accessibilityRole="image"
      resizeMode="contain"
      style={{
        width: ancho,
        height: ancho / vehiculo.proporcionDeTarjeta,
        opacity: atenuado ? 0.55 : 1
      }}
    />
  );
}

/**
 * El vehículo sobre el mapa. La pieza de identidad más pequeña y la que más se
 * ve: cada vez que alguien mira dónde está su moto, mira esto.
 *
 * Es la toma cenital, cuadrada, girada según el rumbo. Un pin genérico daría
 * exactamente el mismo mapa que cualquier otra aplicación.
 *
 * `rumbo` va en grados, 0 hacia arriba. Hoy siempre llega un valor fijo desde
 * la maqueta: aquí no hay GPS ni orientación real, sólo el hueco preparado
 * para cuando los haya.
 */
export function MarcadorDeVehiculo({ tipo, tamano = 44, rumbo = 0, halo = true }: {
  readonly tipo: TipoDeVehiculo;
  readonly tamano?: number;
  readonly rumbo?: number;
  readonly halo?: boolean;
}) {
  const tema = useTema();
  const vehiculo = VEHICULOS[tipo];

  return (
    <View
      accessibilityLabel={`${vehiculo.nombre} en el mapa`}
      accessibilityRole="image"
      style={{ alignItems: 'center', justifyContent: 'center' }}
    >
      {/* El halo despega el vehículo del mapa. Sin él, sobre una calle clara
          la moto negra y amarilla se pierde. */}
      {halo ? (
        <View style={{
          position: 'absolute',
          width: tamano * 1.5,
          height: tamano * 1.5,
          borderRadius: tamano,
          backgroundColor: `${tema.color.acento}2e`
        }} />
      ) : null}
      <Image
        source={vehiculo.mapa}
        resizeMode="contain"
        style={{
          width: tamano,
          height: tamano,
          transform: [{ rotate: `${rumbo}deg` }]
        }}
      />
    </View>
  );
}
