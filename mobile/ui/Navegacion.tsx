/**
 * La barra inferior y el control de disponibilidad.
 *
 * EL CONTROL DE DISPONIBILIDAD ES UNA PIEZA HEREDADA
 *
 * No se ha inventado aquí. Viene de `src/styles/modern-yellow-lab.css`, donde
 * ya está resuelto y donde el comentario original explica por qué es así:
 * ponerse en línea es la acción más importante de la pantalla y vivía como un
 * interruptor pequeño en una esquina de la cabecera, así que pasó al centro de
 * la barra, con la moto de la marca y el verde que ya significa «activo» en el
 * resto de la aplicación.
 *
 * Se conserva todo lo que decidía ese diseño:
 *
 *   · disco de 56 puntos que sobresale por encima de la barra
 *   · la moto REAL dentro, no un pictograma — el original ya probó uno
 *     genérico y «se leía como bicicleta»
 *   · apagada fuera de línea, a todo color al conectarse
 *   · en línea: aro verde y fondo verde muy diluido, para que la fotografía no
 *     compita contra un fondo saturado
 *   · latido lento mientras está disponible: comunica que sigue escuchando
 *   · el latido se apaga si el sistema pide movimiento reducido
 *
 * LO ÚNICO QUE CAMBIA DE MEDIO
 *
 * En la web la moto se apaga con `filter: grayscale(1)`. React Native no tiene
 * filtros de imagen sin añadir una biblioteca, así que aquí se apaga bajando la
 * opacidad. Misma intención —apagada frente a encendida—, distinto medio; es la
 * única diferencia con el original y conviene decirla en vez de que parezca que
 * el gris se perdió por descuido.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icono, type NombreDeIcono } from './Icono';
import { Txt } from './componentes';
import { VEHICULOS } from '../theme/marca';
import { useTema } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Control de disponibilidad
// ---------------------------------------------------------------------------

export function ControlDeDisponibilidad({ enLinea, onAlternar }: {
  readonly enLinea: boolean;
  readonly onAlternar?: () => void;
}) {
  const tema = useTema();
  const latido = useRef(new Animated.Value(0)).current;
  const [movimientoReducido, setMovimientoReducido] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setMovimientoReducido(activo); })
      .catch(() => { /* si no se puede consultar, se anima: es el caso normal */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setMovimientoReducido);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  useEffect(() => {
    if (!enLinea || movimientoReducido) {
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
  }, [enLinea, movimientoReducido, latido]);

  const verde = tema.color.exito;

  return (
    <Pressable
      onPress={onAlternar}
      accessibilityRole="switch"
      accessibilityState={{ checked: enLinea }}
      accessibilityLabel={enLinea ? 'En línea. Tocar para desconectarse' : 'Fuera de línea. Tocar para conectarse'}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 3,
        // Sobresale por encima de la barra sin hacerla más alta.
        marginTop: -24,
        transform: [{ scale: pressed ? 0.94 : 1 }]
      })}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* El latido: un aro que se expande y se desvanece. Va por escala y
            opacidad, que el hilo nativo puede animar sin pasar por JavaScript
            — importante en un teléfono modesto con el mapa moviéndose. */}
        {enLinea ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: verde,
              opacity: latido.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.04] }),
              transform: [{ scale: latido.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.42] }) }]
            }}
          />
        ) : null}

        <View style={{
          width: 56, height: 56, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: enLinea ? `${verde}38` : tema.color.superficieElevada,
          borderWidth: enLinea ? 2 : 1,
          borderColor: enLinea ? verde : tema.color.borde,
          shadowColor: '#000000',
          shadowOpacity: 0.42,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10
        }}>
          <Animated.Image
            source={VEHICULOS.MOTO.mapa}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={{
              width: 34, height: 34,
              opacity: enLinea ? 1 : 0.45,
              transform: [{ scale: enLinea ? 1.06 : 1 }]
            }}
          />
        </View>
      </View>

      <Txt nivel="etiqueta" tono={enLinea ? 'exito' : 'tenue'}>
        {enLinea ? 'En línea' : 'Conectar'}
      </Txt>
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

/**
 * La barra de navegación.
 *
 * Flota sobre el mapa, así que lleva su propio fondo opaco: sobre un mapa
 * translúcido las etiquetas se vuelven ilegibles en cuanto pasa una calle
 * clara por debajo.
 *
 * El hueco central sólo aparece cuando hay control de disponibilidad, y
 * entonces los destinos se reparten a los lados. Es la composición del
 * conductor; la de la pasajera son cuatro destinos seguidos.
 */
export function BarraDeNavegacion({ destinos, activo, onSeleccionar, control }: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly onSeleccionar?: (clave: string) => void;
  /** El control de disponibilidad, si esta barra lo lleva en el centro. */
  readonly control?: React.ReactNode;
}) {
  const tema = useTema();
  const inferior = useSafeAreaInsets().bottom;
  const mitad = Math.ceil(destinos.length / 2);
  const grupos = control ? [destinos.slice(0, mitad), destinos.slice(mitad)] : [destinos];

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      backgroundColor: tema.color.superficie,
      paddingTop: 10,
      paddingHorizontal: 6,
      // La franja del sistema: sin esto, en un teléfono con barra de gestos la
      // fila de iconos queda justo debajo del indicador.
      paddingBottom: Math.max(inferior, 10),
      borderTopWidth: 1,
      borderTopColor: tema.color.borde
    }}>
      {grupos.map((grupo, indice) => (
        <View key={`grupo-${indice}`} style={{ flexDirection: 'row', flex: 1 }}>
          {grupo.map(destino => (
            <Destino
              key={destino.clave}
              destino={destino}
              activo={destino.clave === activo}
              onPress={() => onSeleccionar?.(destino.clave)}
            />
          ))}
        </View>
      ))}

      {control ? <View style={{ width: 74, alignItems: 'center' }}>{control}</View> : null}
    </View>
  );
}

function Destino({ destino, activo, onPress }: {
  readonly destino: DestinoDeNavegacion;
  readonly activo: boolean;
  readonly onPress?: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={destino.etiqueta}
      style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 }}
    >
      <Icono
        nombre={destino.icono}
        color={activo ? tema.color.acento : tema.color.textoTenue}
        tamano={23}
        activo={activo}
      />
      <Txt nivel="etiqueta" tono={activo ? 'primario' : 'tenue'}>
        {destino.etiqueta}
      </Txt>
    </Pressable>
  );
}

/** Los destinos de la pasajera. */
export const DESTINOS_DE_PASAJERA: readonly DestinoDeNavegacion[] = Object.freeze([
  { clave: 'inicio', icono: 'inicio', etiqueta: 'Inicio' },
  { clave: 'viajes', icono: 'viajes', etiqueta: 'Viajes' },
  { clave: 'seguridad', icono: 'escudo', etiqueta: 'Seguridad' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);

/**
 * Los del conductor. Cuatro, no cinco: el centro lo ocupa la disponibilidad.
 *
 * No hay pestaña de dinero. La cartera está apagada en el servidor, y una
 * pestaña que lleva a una cifra vacía —o peor, inventada— no es navegación.
 */
export const DESTINOS_DE_CONDUCTOR: readonly DestinoDeNavegacion[] = Object.freeze([
  { clave: 'mapa', icono: 'inicio', etiqueta: 'Mapa' },
  { clave: 'jornada', icono: 'reloj', etiqueta: 'Jornada' },
  { clave: 'viajes', icono: 'viajes', etiqueta: 'Viajes' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);
