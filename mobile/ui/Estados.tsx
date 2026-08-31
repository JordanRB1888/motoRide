/**
 * Los estados intermedios: buscar vehículo, el contexto del conductor y su
 * panel de jornada.
 *
 * BUSCAR ES EL MOMENTO MÁS LARGO DE LA APLICACIÓN
 *
 * Entre pedir y que alguien acepte pasan segundos que se hacen minutos. Es
 * donde la gente decide si la aplicación va bien o «se quedó pegada», y por eso
 * tiene que estar VIVO: si nada se mueve, se asume que nada pasa.
 *
 * El pulso sale del punto donde estás y se expande hacia fuera, como un sonar.
 * No es decoración: dice que se está buscando ALREDEDOR de ti, que es
 * exactamente lo que ocurre. Un círculo girando diría «cargando», que es más
 * pobre y podría ser cualquier aplicación.
 *
 * Y lo que gira dentro es la moto de la marca, no un aro. Es el mismo criterio
 * que en el resto: donde puede ir el vehículo real, va el vehículo real.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import { Boton, Txt } from './componentes';
import { Icono } from './Icono';
import { MarcadorDeVehiculo } from './Marca';
import { useTema } from '../theme/ThemeContext';
import type { TipoDeVehiculo } from '../theme/marca';

/** Lee la preferencia de movimiento reducido del sistema. */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setReducido(activo); })
      .catch(() => { /* si no se puede consultar, se anima */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  return reducido;
}

// ---------------------------------------------------------------------------
// El sonar
// ---------------------------------------------------------------------------

/**
 * El pulso que sale de tu posición mientras se busca.
 *
 * Tres anillos desfasados: cuando el primero va por la mitad, el segundo
 * empieza. Con uno solo el efecto se corta cada ciclo y se nota el salto.
 */
export function PulsoDeBusqueda({ tipo, tamano = 62 }: {
  readonly tipo: TipoDeVehiculo;
  readonly tamano?: number;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  return (
    <View style={{ width: tamano * 3, height: tamano * 3, alignItems: 'center', justifyContent: 'center' }}>
      {quieto ? null : [0, 1, 2].map(indice => (
        <Anillo key={indice} retraso={indice * 900} diametro={tamano * 3} color={tema.color.acento} />
      ))}
      <MarcadorDeVehiculo tipo={tipo} tamano={tamano} rumbo={0} halo={false} />
    </View>
  );
}

function Anillo({ retraso, diametro, color }: {
  readonly retraso: number;
  readonly diametro: number;
  readonly color: string;
}) {
  const valor = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.delay(retraso),
        Animated.timing(valor, { toValue: 1, duration: 2700, easing: Easing.out(Easing.ease), useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [valor, retraso]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: diametro, height: diametro, borderRadius: diametro / 2,
        borderWidth: 2,
        borderColor: color,
        opacity: valor.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
        transform: [{ scale: valor.interpolate({ inputRange: [0, 1], outputRange: [0.24, 1] }) }]
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Buscando
// ---------------------------------------------------------------------------

/**
 * Lo que va en la hoja mientras se busca.
 *
 * Poco texto y un botón de cancelar bien visible. Quien está esperando quiere
 * saber dos cosas: que se está buscando, y cómo salir si cambia de idea.
 */
export function BuscandoVehiculo({ tipo, onCancelar }: {
  readonly tipo: TipoDeVehiculo;
  readonly onCancelar?: () => void;
}) {
  const tema = useTema();
  const nombre = tipo === 'MOTO' ? 'moto' : 'auto';

  return (
    <View style={{ gap: tema.ritmo.entreElementos }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt nivel="titulo">Buscando tu {nombre}</Txt>
            <PuntosSuspensivos />
          </View>
          <Txt nivel="cuerpo" tono="secundario">
            Avisando a los conductores que están cerca de ti.
          </Txt>
        </View>
      </View>

      <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar ?? (() => undefined)} />
    </View>
  );
}

/** Tres puntos que aparecen uno a uno. El mismo gesto que el arranque. */
function PuntosSuspensivos() {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', height: 8 }}>
      {[0, 200, 400].map(retraso => (
        <PuntoQueLate key={retraso} retraso={retraso} quieto={quieto} color={tema.color.acento} />
      ))}
    </View>
  );
}

function PuntoQueLate({ retraso, quieto, color }: {
  readonly retraso: number;
  readonly quieto: boolean;
  readonly color: string;
}) {
  const valor = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (quieto) { valor.setValue(1); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.delay(retraso),
        Animated.timing(valor, { toValue: 1, duration: 420, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(valor, { toValue: 0, duration: 420, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.delay(600 - retraso)
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [valor, retraso, quieto]);

  return (
    <Animated.View style={{
      width: 5, height: 5, borderRadius: 3,
      backgroundColor: color,
      opacity: valor.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] })
    }} />
  );
}

// ---------------------------------------------------------------------------
// El contexto del conductor
// ---------------------------------------------------------------------------

export interface ContextoDeUbicacion {
  readonly enLinea: boolean;
  readonly zona: string;
  /** El punto conocido más cercano. Se omite si no se sabe. */
  readonly cerca?: string;
  /** La vía por la que va. Se omite si no se sabe. */
  readonly via?: string;
}

/**
 * La franja de contexto del conductor: dónde está y si le llegan viajes.
 *
 * Se lee de un vistazo mientras se conduce, así que va en una sola línea y en
 * este orden: primero el estado —lo único que puede estar mal— y después dónde.
 *
 * Los datos que faltan no se rellenan con nada. Sin GPS fino no hay «cerca de»,
 * y poner una zona genérica en su lugar sería inventarse una precisión que no
 * se tiene. La franja se encoge y ya está.
 *
 * Aquí no hay GPS todavía: los valores llegan de la maqueta. Lo que existe es
 * el hueco, con la forma que tendrá cuando haya ubicación real.
 */
export function FranjaDeContexto({ contexto }: { readonly contexto: ContextoDeUbicacion }) {
  const tema = useTema();
  const lugar = [contexto.cerca && `Cerca de ${contexto.cerca}`, contexto.via]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: tema.color.superficieElevada,
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8
    }}>
      <View style={{
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: contexto.enLinea ? tema.color.exito : tema.color.textoTenue
      }} />
      {/* El estado no se parte nunca: es lo primero que se lee y «En / línea»
          en dos renglones se lee peor que cualquier otra cosa de la pantalla. */}
      <Txt
        nivel="etiqueta"
        tono={contexto.enLinea ? 'exito' : 'tenue'}
        numberOfLines={1}
        estilo={{ flexShrink: 0 } as never}
      >
        {contexto.enLinea ? 'En línea' : 'Fuera de línea'}
      </Txt>

      <View style={{ width: 1, height: 13, backgroundColor: tema.color.borde, flexShrink: 0 }} />

      {/* El lugar sí se recorta: si no cabe entero, mejor media calle que
          empujar el estado fuera de la franja. */}
      <Txt nivel="etiqueta" tono="secundario" numberOfLines={1} estilo={{ flexShrink: 1 } as never}>
        {lugar || contexto.zona}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// El panel de la jornada
// ---------------------------------------------------------------------------

export interface JornadaDelConductor {
  readonly enLinea: boolean;
  readonly gpsActivo: boolean;
  readonly vehiculo: string;
  readonly zona: string;
  readonly viajes: string;
  readonly tiempoEnLinea: string;
  /** Vacío mientras la cartera esté apagada en el servidor. */
  readonly resumen: string;
}

/**
 * Lo que se abre al tocar el disco del conductor.
 *
 * Es una ventana pequeña, no una pantalla. Quien conduce la abre en un
 * semáforo: mira, comprueba y la cierra. Todo lo que no se lea en ese tiempo
 * sobra.
 *
 * Por eso los datos van en pares de dos columnas y no en filas con icono: seis
 * filas serían el doble de alto para la misma información.
 */
export function PanelDeJornada({ jornada, onAlternar, onCerrar }: {
  readonly jornada: JornadaDelConductor;
  readonly onAlternar?: () => void;
  readonly onCerrar?: () => void;
}) {
  const tema = useTema();

  const datos = [
    { etiqueta: 'Vehículo', valor: jornada.vehiculo },
    { etiqueta: 'Zona', valor: jornada.zona },
    { etiqueta: 'Viajes de hoy', valor: jornada.viajes },
    { etiqueta: 'En línea', valor: jornada.tiempoEnLinea },
    { etiqueta: 'Resumen', valor: jornada.resumen }
  ];

  return (
    <View style={{ gap: tema.ritmo.entreElementos }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: jornada.enLinea ? tema.color.exito : tema.color.textoTenue
        }} />
        <Txt nivel="encabezado">
          {jornada.enLinea ? 'En línea' : 'Fuera de línea'}
        </Txt>
        <View style={{ flex: 1 }} />
        {jornada.gpsActivo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icono nombre="destino" color={tema.color.exito} tamano={14} />
            <Txt nivel="etiqueta" tono="exito">GPS activo</Txt>
          </View>
        ) : (
          <Txt nivel="etiqueta" tono="tenue">Sin GPS</Txt>
        )}
      </View>

      {/* Dos columnas: la mitad de alto que seis filas para lo mismo. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {datos.map(dato => (
          // El relleno derecho separa las dos columnas: sin él, un valor largo
          // llega hasta el borde y se pega al de al lado.
          <View key={dato.etiqueta} style={{ width: '50%', paddingVertical: 7, paddingRight: 12, gap: 2 }}>
            <Txt nivel="pie" tono="tenue">{dato.etiqueta}</Txt>
            <Txt nivel="cuerpo" numberOfLines={1}>{dato.valor}</Txt>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: tema.ritmo.entreElementos }}>
        <View style={{ flex: 1 }}>
          <Boton
            titulo={jornada.enLinea ? 'Salir de línea' : 'Conectarme'}
            variante={jornada.enLinea ? 'secundario' : 'principal'}
            onPress={onAlternar ?? (() => undefined)}
          />
        </View>
      </View>

      <Pressable
        onPress={onCerrar}
        accessibilityRole="button"
        accessibilityLabel="Cerrar el panel"
        style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
      >
        <Txt nivel="etiqueta" tono="tenue">Cerrar</Txt>
      </Pressable>
    </View>
  );
}
