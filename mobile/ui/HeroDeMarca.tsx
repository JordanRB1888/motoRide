/**
 * Cabecera de marca compartida por bienvenida y acceso.
 *
 * La referencia aprobada usa una sola escena: amarillo cálido, líneas de
 * velocidad muy finas, el logotipo libre y un recorte inferior suave. La
 * animación se limita a luz y profundidad; se
 * detiene por completo cuando la persona ha pedido reducir el movimiento.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Text, useWindowDimensions, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';

const DESTELLO_MS = 3200;
const DESTELLO_BIENVENIDA_MS = 2800;
const ESPERA_ENTRE_DESTELLOS_MS = 2200;
const RESPIRACION_MS = 4200;

/**
 * Escena transparente del logotipo.
 *
 * No tiene placa, borde, carretera ni sombra rectangular. El contraste vive
 * dentro del propio logotipo, en `LogoHorizontal`.
 */
export function PlacaDeMarca({ children, ancho, testID }: {
  readonly children: ReactNode;
  readonly ancho?: number;
  readonly testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        width: '100%',
        maxWidth: ancho ?? 348,
        minHeight: 110,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible'
      }}
    >
      {children}
    </View>
  );
}

/** Lema centrado con los dos filos de la referencia. */
export function LemaConFilos({ texto }: { readonly texto: string }) {
  const tema = useTema();
  const filo = {
    width: 30,
    height: 1,
    backgroundColor: tema.color.acento,
    borderRadius: 1,
    opacity: 0.6
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={filo} />
      <Text style={{
        color: tema.color.textoPrimario,
        fontSize: tema.texto.cuerpo.tamano,
        lineHeight: tema.texto.cuerpo.alto,
        fontWeight: '600',
        letterSpacing: 0.2
      }}>
        {texto}
      </Text>
      <View style={filo} />
    </View>
  );
}

export function HeroDeMarca({
  variante,
  insetSuperior,
  sangrado = 0,
  quieto = false,
  children
}: {
  readonly variante: 'bienvenida' | 'acceso';
  readonly insetSuperior: number;
  readonly sangrado?: number;
  readonly quieto?: boolean;
  readonly children: ReactNode;
}) {
  const tema = useTema();
  const { width } = useWindowDimensions();
  const esAcceso = variante === 'acceso';

  const destello = useRef(new Animated.Value(0)).current;
  const destelloDeBienvenida = useRef(new Animated.Value(0)).current;
  const respiracion = useRef(new Animated.Value(0)).current;
  const animado = esAcceso && !quieto;
  const animadoEnBienvenida = !esAcceso && !quieto;

  useEffect(() => {
    if (!animado) { destello.setValue(0); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(destello, {
          toValue: 1,
          duration: DESTELLO_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.delay(ESPERA_ENTRE_DESTELLOS_MS),
        Animated.timing(destello, { toValue: 0, duration: 0, useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [destello, animado]);

  useEffect(() => {
    if (!animadoEnBienvenida) { destelloDeBienvenida.setValue(0); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(destelloDeBienvenida, {
          toValue: 1,
          duration: DESTELLO_BIENVENIDA_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.delay(3000),
        Animated.timing(destelloDeBienvenida, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true
        })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [destelloDeBienvenida, animadoEnBienvenida]);

  useEffect(() => {
    if (!animado) { respiracion.setValue(0.5); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(respiracion, {
          toValue: 1,
          duration: RESPIRACION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(respiracion, {
          toValue: 0,
          duration: RESPIRACION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [respiracion, animado]);

  const curva = esAcceso
    ? { alto: 136, giro: '0deg', radioIzquierdo: 520, radioDerecho: 520, hundir: 116 }
    : { alto: 136, giro: '0deg', radioIzquierdo: 520, radioDerecho: 520, hundir: 116 };

  return (
    <View
      testID={esAcceso ? 'hero-acceso' : 'hero-amarillo'}
      style={{
        marginHorizontal: -sangrado,
        backgroundColor: tema.color.acento,
        overflow: 'hidden'
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: width * 1.35,
          height: 240,
          right: -width * 0.42,
          top: insetSuperior - 150,
          borderRadius: 240,
          backgroundColor: tema.color.superficieElevada,
          opacity: respiracion.interpolate({ inputRange: [0, 1], outputRange: [0.045, 0.095] }),
          transform: [{ scale: respiracion.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.025] }) }]
        }}
      />

      {[0, 1, 2, 3, 4].map(indice => (
        <View
          key={`curva-superior-${indice}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: width * 1.55,
            height: 232 + indice * 9,
            left: -width * 0.54,
            top: insetSuperior - 150 + indice * 5,
            borderRadius: 300,
            borderWidth: 1,
            borderColor: tema.color.superficieElevada,
            opacity: 0.16 - indice * 0.018,
            transform: [{ rotate: '-16deg' }]
          }}
        />
      ))}
      {[0, 1, 2].map(indice => (
        <View
          key={`curva-inferior-${indice}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: width * 1.42,
            height: 190 + indice * 10,
            right: -width * 0.54,
            bottom: -48 + indice * 6,
            borderRadius: 260,
            borderWidth: 1,
            borderColor: tema.color.superficieElevada,
            opacity: 0.13 - indice * 0.025,
            transform: [{ rotate: '-12deg' }]
          }}
        />
      ))}


      <View style={{
        zIndex: 2,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingTop: insetSuperior + (esAcceso ? 30 : 18),
        paddingBottom: 58,
        alignItems: 'center'
      }}>
        {children}
      </View>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          zIndex: 1,
          left: -72,
          right: -72,
          bottom: -curva.alto + curva.hundir,
          height: curva.alto,
          backgroundColor: tema.color.fondo,
          borderTopLeftRadius: curva.radioIzquierdo,
          borderTopRightRadius: curva.radioDerecho,
          transform: [{ rotate: curva.giro }]
        }}
      />
    </View>
  );
}
