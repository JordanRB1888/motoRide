/**
 * La pantalla de carga con la identidad de +58express.
 *
 * DE DÓNDE VIENE
 *
 * Es la misma que ya tenía la web al arrancar —dos anillos amarillos girando
 * en sentidos opuestos y el logo volteando sobre su eje— traída a la
 * aplicación. Estaba sólo en el navegador, y era justo lo que hacía que la web
 * pareciera un producto mientras la app enseñaba la rueda gris del sistema, la
 * misma que enseña cualquier aplicación a medio hacer.
 *
 * Las medidas y los tiempos son los del original, leídos de `index.html`: los
 * anillos giran en 1,15 s y 1,8 s —el segundo al revés, que es lo que hace que
 * se lea como un mecanismo y no como una rueda—, y el logo tarda 1,35 s en dar
 * la vuelta encogiendo y creciendo un poco. Que las tres duraciones no sean
 * múltiplos entre sí es a propósito: así la figura no se repite igual cada
 * ciclo y no se ve el bucle.
 *
 * POR QUÉ ANIMACIONES DE CSS Y NO VALORES COMPARTIDOS
 *
 * Esto es un bucle que no reacciona a nada: no hay un dedo encima, ni un gesto
 * que interrumpir, ni velocidad que traspasar. La API de CSS de Reanimated es
 * lo más barato que hace exactamente eso, corre en el hilo de interfaz y sigue
 * girando aunque el JavaScript esté ocupado —que es precisamente lo que está
 * pasando mientras se ve esta pantalla—.
 *
 * MOVIMIENTO REDUCIDO
 *
 * Quien lo pidió en su teléfono ve el logo quieto con los anillos puestos. No
 * se queda en blanco ni se sustituye por la rueda del sistema: la marca sigue
 * ahí, sólo que sin girar.
 */

import { Image, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import type { CSSAnimationProperties } from 'react-native-reanimated';

import { Txt } from './componentes';
import { useTema } from '../theme/ThemeContext';

const AMARILLO = '#ffc400';

/** Las mismas del original. Ver la nota de arriba sobre por qué no encajan. */
const VUELTA_EXTERIOR_MS = 1150;
const VUELTA_INTERIOR_MS = 1800;
const VOLTERETA_MS = 1350;
const PUNTO_MS = 1000;

export function CargandoDeMarca({ mensaje = 'Preparando tu viaje' }: {
  /** Lo que se está esperando. En mayúsculas y pequeño, como en la web. */
  readonly mensaje?: string;
}) {
  const tema = useTema();
  const sinMovimiento = useReducedMotion();

  /** Sin movimiento no se devuelve animacion: el aro se queda donde esta. */
  const girar = (duracion: number, alReves = false): CSSAnimationProperties | undefined =>
    sinMovimiento ? undefined : {
      animationName: {
        from: { transform: [{ rotate: alReves ? '360deg' : '0deg' }] },
        to: { transform: [{ rotate: alReves ? '0deg' : '360deg' }] }
      },
      animationDuration: `${duracion}ms`,
      animationTimingFunction: 'linear',
      animationIterationCount: 'infinite'
    };

  // El `transform` mezcla giro y escala, y TypeScript infiere de ahi una union
  // que no encaja con la del estilo. Se declara el tipo de una vez.
  const voltereta = (sinMovimiento ? undefined : {
    animationName: {
      '0%': { transform: [{ rotateY: '0deg' }, { scale: 0.96 }] },
      '45%': { transform: [{ rotateY: '180deg' }, { scale: 1.04 }] },
      '100%': { transform: [{ rotateY: '360deg' }, { scale: 0.96 }] }
    },
    animationDuration: `${VOLTERETA_MS}ms`,
    animationTimingFunction: 'cubic-bezier(0.45, 0.05, 0.2, 1)',
    animationIterationCount: 'infinite'
  }) as CSSAnimationProperties | undefined;

  const latido = (retraso: number): CSSAnimationProperties | undefined =>
    sinMovimiento ? undefined : {
      animationName: {
        '0%, 100%': { opacity: 0.28, transform: [{ translateY: 0 }, { scale: 0.75 }] },
        '50%': { opacity: 1, transform: [{ translateY: -4 }, { scale: 1 }] }
      },
      animationDuration: `${PUNTO_MS}ms`,
      animationDelay: `${retraso}ms`,
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite'
    };

  return (
    <View
      testID="cargando-de-marca"
      accessibilityRole="progressbar"
      accessibilityLabel={mensaje}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tema.color.fondo,
        gap: 0
      }}
    >
      <View style={{ width: 154, height: 154, alignItems: 'center', justifyContent: 'center' }}>
        {/* El anillo de fuera: casi transparente, con dos cuartos encendidos.
            Eso es lo que hace visible el giro; un aro entero no se vería girar. */}
        <Animated.View
          style={[{
            position: 'absolute',
            width: 156, height: 156, borderRadius: 78,
            borderWidth: 2,
            borderColor: 'rgba(255,196,0,0.16)',
            borderTopColor: AMARILLO,
            borderRightColor: AMARILLO
          }, girar(VUELTA_EXTERIOR_MS)]}
        />

        {/* El de dentro gira al revés y más despacio. */}
        <Animated.View
          style={[{
            position: 'absolute',
            width: 178, height: 178, borderRadius: 89,
            borderWidth: 1,
            borderColor: 'rgba(255,196,0,0.10)',
            borderLeftColor: 'rgba(255,196,0,0.65)'
          }, girar(VUELTA_INTERIOR_MS, true)]}
        />

        {/* El logo, volteando sobre su eje vertical. */}
        <Animated.View
          style={[{
            width: 138, height: 138, borderRadius: 69,
            borderWidth: 3, borderColor: AMARILLO,
            backgroundColor: '#0a0908',
            overflow: 'hidden',
            alignItems: 'center', justifyContent: 'center'
          }, voltereta]}
        >
          <Image
            source={require('../assets/icon.png')}
            style={{ width: 138, height: 138 }}
            resizeMode="cover"
            accessible={false}
          />
        </Animated.View>
      </View>

      <View style={{ marginTop: 30, flexDirection: 'row', alignItems: 'baseline' }}>
        <Txt nivel="titulo" estilo={{ color: AMARILLO, letterSpacing: -1.2 } as never}>+58</Txt>
        <Txt nivel="titulo" estilo={{ color: tema.color.textoPrimario, letterSpacing: -1.2 } as never}>express</Txt>
      </View>

      <View style={{ marginTop: 10 }}>
        <Txt nivel="pie" tono="secundario" estilo={{ letterSpacing: 1.1 } as never}>
          {mensaje.toUpperCase()}
        </Txt>
      </View>

      {/* Los tres puntos, escalonados. Sin ellos la espera se lee como algo
          detenido; con ellos, como algo en marcha. */}
      <View style={{ height: 8, marginTop: 17, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {[0, 150, 300].map(retraso => (
          <Animated.View
            key={retraso}
            style={[{
              width: 6, height: 6, borderRadius: 3, backgroundColor: AMARILLO
            }, sinMovimiento ? { opacity: 0.6 } : latido(retraso)]}
          />
        ))}
      </View>
    </View>
  );
}
