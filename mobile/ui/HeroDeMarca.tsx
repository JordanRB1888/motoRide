/**
 * El hero amarillo de las dos pantallas de entrada.
 *
 * LA FORMA
 *
 * Una masa amarilla que ocupa la parte de arriba y se corta abajo con una
 * CURVA que baja por la izquierda y sube por la derecha. No es un rectángulo
 * ni un borde redondeado: es el fondo de la pantalla subiendo por detrás, en
 * forma de gota muy grande y girada. Sin degradados ni SVG, que React Native
 * no trae, la curva se hace así: una vista del color del fondo, enorme y con
 * los radios superiores muy abiertos, apoyada en el borde de abajo.
 *
 * DOS VARIANTES
 *
 *   bienvenida  la primera impresión: la curva más profunda y quieta.
 *   acceso      la misma familia con otra inclinación, y viva: un destello
 *               recorre la banda cada pocos segundos y dos halos respiran
 *               detrás.
 *
 * Se reconoce que es la misma aplicación sin que las dos pantallas sean la
 * misma pantalla.
 *
 * MOVIMIENTO REDUCIDO
 *
 * Con el ajuste del sistema activo no se mueve nada: los halos se quedan en su
 * posición media y el destello no sale. La forma y el color no cambian.
 *
 * Todo va por `transform` y `opacity` con el controlador nativo.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Text, useWindowDimensions, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
// Las primitivas y no el tema: el amarillo del resplandor es amarillo en los
// dos esquemas, y la placa bajo el logotipo es oscura de día y de noche porque
// el logotipo está dibujado para fondo oscuro.
import { AMARILLO, GRAFITO } from '../theme/primitives';

/** Cuánto tarda el destello en cruzar, y cuánto respiran los halos. */
const DESTELLO_MS = 2600;
const ESPERA_ENTRE_DESTELLOS_MS = 1500;
const RESPIRACION_MS = 3200;

/**
 * La placa oscura que sostiene el logotipo.
 *
 * El logotipo oficial es claro con estelas amarillas: sobre el amarillo del
 * hero, las estelas desaparecen. La placa le devuelve el fondo para el que
 * está dibujado, y de paso hace de pista por la que la moto entra y se va.
 *
 * Va elevada, con sombra propia: en la referencia del dueño la placa flota
 * sobre el amarillo, no está pegada a él.
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
        maxWidth: ancho ?? 336,
        borderRadius: 26,
        backgroundColor: GRAFITO.abismo,
        borderWidth: 1,
        borderColor: `${AMARILLO.base}33`,
        paddingVertical: 18,
        alignItems: 'center',
        overflow: 'hidden',
        // La sombra no sale del tema: aquí es siempre una placa oscura sobre
        // amarillo, de día y de noche.
        shadowColor: '#000000',
        shadowOpacity: 0.28,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8
      }}
    >
      {children}
    </View>
  );
}

/** El lema entre dos filos, como en la referencia. */
export function LemaConFilos({ texto }: { readonly texto: string }) {
  const tema = useTema();
  const color = tema.color.sobreAcento;
  const filo = { width: 30, height: 1.5, backgroundColor: `${color}66`, borderRadius: 1 };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={filo} />
      <Text style={{
        color,
        fontSize: tema.texto.etiqueta.tamano,
        lineHeight: tema.texto.etiqueta.alto,
        fontWeight: '700'
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
  /** Lo que hay que compensar del relleno lateral de quien lo monta. */
  readonly sangrado?: number;
  readonly quieto?: boolean;
  readonly children: ReactNode;
}) {
  const tema = useTema();
  const { width } = useWindowDimensions();
  const esAcceso = variante === 'acceso';

  const destello = useRef(new Animated.Value(0)).current;
  const respiracion = useRef(new Animated.Value(0)).current;
  const animado = esAcceso && !quieto;

  useEffect(() => {
    if (!animado) { destello.setValue(0); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(destello, {
          toValue: 1, duration: DESTELLO_MS,
          easing: Easing.inOut(Easing.quad), useNativeDriver: true
        }),
        Animated.delay(ESPERA_ENTRE_DESTELLOS_MS),
        Animated.timing(destello, { toValue: 0, duration: 0, useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [destello, animado]);

  useEffect(() => {
    if (!animado) { respiracion.setValue(0.5); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(respiracion, {
          toValue: 1, duration: RESPIRACION_MS,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true
        }),
        Animated.timing(respiracion, {
          toValue: 0, duration: RESPIRACION_MS,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true
        })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [respiracion, animado]);

  // La curva: más profunda y más tumbada en la bienvenida; más corta en el
  // acceso, que tiene que dejar sitio al formulario.
  const curva = esAcceso
    ? { alto: 130, giro: '-7deg', radioIzquierdo: 300, radioDerecho: 520, hundir: 62 }
    : { alto: 170, giro: '-9deg', radioIzquierdo: 420, radioDerecho: 640, hundir: 84 };

  return (
    <View
      testID={esAcceso ? 'hero-acceso' : 'hero-amarillo'}
      style={{
        marginHorizontal: -sangrado,
        // Sube por detrás de la barra de estado y devuelve el hueco por dentro.
        marginTop: -insetSuperior - 200,
        paddingTop: insetSuperior + 200,
        backgroundColor: tema.color.acento,
        overflow: 'hidden'
      }}
    >
      {/* LAS ONDAS: arcos muy tenues, trozos de circunferencias enormes. Dan la
          textura del amarillo de la referencia sin degradados. */}
      {[
        { tamano: 620, top: -300, left: -170, opacidad: 0.26 },
        { tamano: 520, top: -180, left: 60, opacidad: 0.20 },
        { tamano: 760, top: -60, left: -300, opacidad: 0.14 }
      ].map(onda => (
        <View
          key={onda.tamano}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: onda.tamano, height: onda.tamano,
            top: onda.top + insetSuperior + 200, left: onda.left,
            borderRadius: onda.tamano / 2,
            borderWidth: 2,
            borderColor: '#fffdf2',
            opacity: onda.opacidad
          }}
        />
      ))}

      {/* Los halos. Respiran sólo en el acceso; en la bienvenida se quedan en
          su punto medio y hacen de profundidad. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', right: -80, top: insetSuperior + 140,
          width: 260, height: 260, borderRadius: 130,
          backgroundColor: AMARILLO.vivo,
          opacity: respiracion.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0.62] }),
          transform: [{ scale: respiracion.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }]
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: -90, bottom: -40,
          width: 240, height: 240, borderRadius: 120,
          backgroundColor: AMARILLO.intenso,
          opacity: respiracion.interpolate({ inputRange: [0, 1], outputRange: [0.40, 0.16] }),
          transform: [{ scale: respiracion.interpolate({ inputRange: [0, 1], outputRange: [1.06, 0.94] }) }]
        }}
      />

      {/* EL DESTELLO: una franja clara inclinada que cruza. Ancha y muy tenue,
          para que se lea como un brillo que pasa y no como una barra blanca. */}
      {esAcceso ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -200, bottom: -200,
            width: 120,
            backgroundColor: '#fffdf2',
            transform: [
              { rotate: '18deg' },
              {
                translateX: destello.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-160, width + sangrado * 2 + 160]
                })
              }
            ],
            opacity: destello.interpolate({
              inputRange: [0, 0.15, 0.5, 0.85, 1],
              outputRange: [0, 0.26, 0.34, 0.26, 0]
            })
          }}
        />
      ) : null}

      {/* El contenido: la placa y el lema. */}
      <View style={{
        paddingHorizontal: sangrado + tema.ritmo.margenPantalla,
        // El hueco de la barra de estado. El relleno de arriba del contenedor
        // se lo come el margen negativo que sube el amarillo por detras, asi
        // que el aire hay que devolverlo aqui: sin esto la placa se subia
        // encima de la hora.
        paddingTop: insetSuperior + 14,
        paddingBottom: curva.hundir + 12,
        alignItems: 'center',
        gap: 16
      }}>
        {children}
      </View>

      {/* LA CURVA. Va la última para quedar por encima de todo lo demás: es el
          fondo de la pantalla subiendo por detrás del amarillo. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -60,
          right: -60,
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
