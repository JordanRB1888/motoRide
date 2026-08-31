/**
 * La pantalla de arranque.
 *
 * ES LA QUE YA EXISTE, TRAÍDA TAL CUAL
 *
 * Está copiada del arranque real de la aplicación web, que vive incrustado en
 * `index.html` para poder pintarse antes de que cargue nada. De allí viene cada
 * decisión, y se han conservado los números:
 *
 *   · fondo grafito con un resplandor centrado algo por encima del medio
 *   · emblema circular de 138 puntos con aro amarillo
 *   · dos órbitas girando en sentidos contrarios, 1,15 s y 1,8 s
 *   · el emblema gira sobre su eje vertical cada 1,35 s
 *   · «+58» en amarillo y «express» en blanco cálido, muy apretados
 *   · «Preparando tu viaje» en versales, y tres puntos que saltan
 *
 * No se ha sustituido por un arranque minimalista con el logotipo centrado.
 * Ese arranque es de las pocas cosas de +58express que ya se reconocen, y
 * cambiarlo por algo más sobrio habría sido tirar identidad para ganar
 * elegancia genérica.
 *
 * LO QUE CAMBIA DE MEDIO
 *
 * El fondo de la web es un `radial-gradient`. React Native no tiene degradados
 * sin añadir una biblioteca, así que el resplandor se compone con tres discos
 * concéntricos de opacidad decreciente. Se ve equivalente y no añade nada al
 * paquete.
 *
 * MOVIMIENTO
 *
 * Todo va por `transform` y `opacity` con el controlador nativo, así que las
 * animaciones no pasan por JavaScript y no se traban mientras arranca la
 * aplicación. Si el sistema pide movimiento reducido, se quedan todas quietas
 * —igual que la web, que ya respeta `prefers-reduced-motion`—.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { Emblema } from './Marca';
import { useTema } from '../theme/ThemeContext';
import { AMARILLO, GRAFITO, TEXTO } from '../theme/primitives';

/** Un valor que da vueltas eternamente. Devuelve la cadena de grados ya lista. */
function useGiro(duracion: number, activo: boolean, invertido = false) {
  const valor = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activo) { valor.setValue(0); return; }
    const ciclo = Animated.loop(
      Animated.timing(valor, { toValue: 1, duration: duracion, easing: Easing.linear, useNativeDriver: true })
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [valor, duracion, activo]);

  return valor.interpolate({
    inputRange: [0, 1],
    outputRange: invertido ? ['360deg', '0deg'] : ['0deg', '360deg']
  });
}

export function Arranque({ mensaje = 'Preparando tu viaje' }: { readonly mensaje?: string }) {
  const tema = useTema();
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setQuieto(activo); })
      .catch(() => { /* si no se puede consultar, se anima */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieto);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  const orbitaExterna = useGiro(1800, !quieto, true);
  const orbitaInterna = useGiro(1150, !quieto);

  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: GRAFITO.abismo
    }}>
      {/* El resplandor: tres discos, del más tenue al más claro. */}
      {[
        { tamano: 520, color: GRAFITO.fondo },
        { tamano: 360, color: GRAFITO.superficie },
        { tamano: 230, color: GRAFITO.elevada }
      ].map(disco => (
        <View
          key={disco.tamano}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: disco.tamano, height: disco.tamano,
            borderRadius: disco.tamano / 2,
            backgroundColor: disco.color,
            // Algo por encima del centro, como en la web.
            marginBottom: 90
          }}
        />
      ))}

      <View style={{ alignItems: 'center', marginBottom: 90 }}>
        <View style={{ width: 176, height: 176, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 176, height: 176, borderRadius: 88,
              borderWidth: 1,
              borderColor: `${AMARILLO.base}1a`,
              borderLeftColor: `${AMARILLO.base}a6`,
              transform: [{ rotate: orbitaExterna }]
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 154, height: 154, borderRadius: 77,
              borderWidth: 2,
              borderColor: `${AMARILLO.base}29`,
              borderTopColor: AMARILLO.base,
              borderRightColor: AMARILLO.base,
              transform: [{ rotate: orbitaInterna }]
            }}
          />

          {/* El aro amarillo del emblema, exactamente como en la web. */}
          <View style={{
            width: 138, height: 138, borderRadius: 69,
            borderWidth: 3, borderColor: AMARILLO.base,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden'
          }}>
            <Emblema tamano={132} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 30 }}>
          <Animated.Text style={{
            color: AMARILLO.base,
            fontSize: 25, fontWeight: '800', letterSpacing: -1.4
          }}>
            +58
          </Animated.Text>
          <Animated.Text style={{
            color: TEXTO.primario,
            fontSize: 25, fontWeight: '800', letterSpacing: -1.4
          }}>
            express
          </Animated.Text>
        </View>

        <Animated.Text style={{
          marginTop: 10,
          color: TEXTO.secundario,
          fontSize: 11, fontWeight: '600',
          letterSpacing: 1.1,
          textTransform: 'uppercase'
        }}>
          {mensaje}
        </Animated.Text>

        <PuntosQueSaltan quieto={quieto} color={tema.color.acento} />
      </View>
    </View>
  );
}

/** Los tres puntos, cada uno con su retraso. */
function PuntosQueSaltan({ quieto, color }: { readonly quieto: boolean; readonly color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 17, height: 8, alignItems: 'center' }}>
      {[0, 150, 300].map(retraso => (
        <Punto key={retraso} retraso={retraso} quieto={quieto} color={color} />
      ))}
    </View>
  );
}

function Punto({ retraso, quieto, color }: {
  readonly retraso: number;
  readonly quieto: boolean;
  readonly color: string;
}) {
  const valor = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (quieto) { valor.setValue(0); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.delay(retraso),
        Animated.timing(valor, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(valor, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [valor, retraso, quieto]);

  return (
    <Animated.View style={{
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: color,
      opacity: valor.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }),
      transform: [
        { translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
        { scale: valor.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }
      ]
    }} />
  );
}
