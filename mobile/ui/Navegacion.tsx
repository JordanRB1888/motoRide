/**
 * La barra inferior y el control central.
 *
 * EL CONTROL CENTRAL ES UNA SOLA PIEZA CON DOS SIGNIFICADOS
 *
 * En el centro de la barra va siempre lo mismo: un disco con la moto de la
 * marca y un aro que dice en qué estás. Lo que cambia es el color del aro y lo
 * que pasa al tocarlo.
 *
 *   aro amarillo   pasajera        pedir un viaje
 *   aro apagado    conductor       fuera de línea, tocar para conectarse
 *   aro verde      conductor       en línea, con latido
 *
 * Es una decisión de identidad, no una casualidad de implementación: en
 * +58express el disco central **es la acción**, y quien usa la aplicación
 * aprende una sola forma sirva para lo que sirva en su pantalla. Un botón de
 * pedir viaje con forma de coche y otro de disponibilidad con forma de
 * interruptor serían dos aplicaciones dentro de una.
 *
 * EL CONTROL DE DISPONIBILIDAD ES UNA PIEZA HEREDADA
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

/** Lee la preferencia de movimiento reducido del sistema y se mantiene al día. */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setReducido(activo); })
      .catch(() => { /* si no se puede consultar, se anima: es el caso normal */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  return reducido;
}

// ---------------------------------------------------------------------------
// El disco: la forma común
// ---------------------------------------------------------------------------

const DIAMETRO = 56;

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
  const quieto = useMovimientoReducido();

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
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
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
    </View>
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
// Los dos usos
// ---------------------------------------------------------------------------

/** El control del conductor: conectarse y desconectarse. */
export function ControlDeDisponibilidad({ enLinea, onAlternar }: {
  readonly enLinea: boolean;
  readonly onAlternar?: () => void;
}) {
  const tema = useTema();
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
      <Disco
        aro={enLinea ? verde : tema.color.borde}
        fondo={enLinea ? `${verde}38` : tema.color.superficieElevada}
        moto={enLinea ? 1 : 0.45}
        latiendo={enLinea}
      />
      <Txt nivel="etiqueta" tono={enLinea ? 'exito' : 'tenue'}>
        {enLinea ? 'En línea' : 'Conectar'}
      </Txt>
    </Pressable>
  );
}

/**
 * El control de la pasajera: abrir y cerrar la petición de viaje.
 *
 * Mismo disco, aro amarillo. Al abrirse la moto se convierte en aspa: el mismo
 * sitio cierra lo que abrió, sin tener que buscar dónde se cierra.
 */
export function ControlDePedido({ abierto, onAlternar }: {
  readonly abierto: boolean;
  readonly onAlternar?: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onAlternar}
      accessibilityRole="button"
      accessibilityState={{ expanded: abierto }}
      accessibilityLabel={abierto ? 'Cerrar la petición de viaje' : 'Pedir un viaje'}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 3,
        marginTop: -24,
        transform: [{ scale: pressed ? 0.94 : 1 }]
      })}
    >
      <Disco
        aro={tema.color.acento}
        fondo={abierto ? tema.color.superficieElevada : `${tema.color.acento}26`}
        moto={1}
        latiendo={false}
        abierto={abierto}
      />
      <Txt nivel="etiqueta" tono={abierto ? 'tenue' : 'acento'}>
        {abierto ? 'Cerrar' : 'Pedir'}
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
      <Txt
        nivel="etiqueta"
        tono={activo ? 'primario' : 'tenue'}
      >
        {destino.etiqueta}
      </Txt>
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
  { clave: 'viajes', icono: 'viajes', etiqueta: 'Viajes' },
  { clave: 'seguridad', icono: 'escudo', etiqueta: 'Seguridad' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
]);

/**
 * Los del conductor. Cuatro, con la disponibilidad en el centro.
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
