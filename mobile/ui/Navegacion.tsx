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
 * EL DISCO MUERDE LA BARRA
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

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icono, type NombreDeIcono } from './Icono';
import { Txt } from './componentes';
import { VEHICULOS } from '../theme/marca';
import { useTema } from '../theme/ThemeContext';
import { useIr } from './navegar';

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
        gap: AIRE_DEL_ROTULO,
        // Sobresale por encima de la barra sin hacerla más alta: lo que sube
        // aquí se compensa con el aire del rótulo, y el control acaba midiendo
        // lo mismo que una pestaña normal.
        marginTop: -SALIENTE,
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

  // Abierto cierra, cerrado abre: el mismo sitio deshace lo que hizo.
  const alternar = onAlternar ?? (() => ir(abierto ? 'inicio' : 'pedir'));

  return (
    <Pressable
      onPress={alternar}
      accessibilityRole="button"
      accessibilityState={{ expanded: abierto }}
      accessibilityLabel={abierto ? 'Cerrar la petición de viaje' : 'Pedir un viaje'}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: AIRE_DEL_ROTULO,
        marginTop: -SALIENTE,
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
  const inferior = useSafeAreaInsets().bottom;
  const ir = useIr();

  // `onSeleccionar` manda si viene; si no, se navega al destino por su clave.
  // Asi la barra funciona igual montada dentro del router y suelta en el
  // laboratorio, sin que ninguna pantalla tenga que enterarse.
  const alTocar = onSeleccionar ?? ((clave: string) => ir(clave));

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
