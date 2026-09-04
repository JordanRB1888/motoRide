/**
 * El inicio map-first de la pasajera.
 *
 * El mapa vuelve a ser el suelo de la pantalla: cabecera, destino y navegación
 * flotan encima. El catálogo conserva exactamente sus piezas y comportamiento,
 * pero vive en una hoja inferior que abre el control central «Pedir».
 *
 * LA REJILLA NO PROMETE LO QUE NO HAY
 *
 * Viajes, Comercios y Transporte Seguro existen. Envíos, Comida, Mercado y
 * Compra y vende NO: no hay backend, ni comercios dados de alta, ni forma de
 * cobrar. Salen igualmente, porque la rejilla completa dice a dónde va
 * +58express, pero llevan su etiqueta de PRONTO y no navegan a ninguna parte.
 *
 * Un botón de «Comida» que no lleva a nada, sin decirlo, es una promesa rota a
 * la primera pulsación, y de las que las tiendas rechazan.
 *
 * VIAJES OCUPA EL ANCHO ENTERO
 *
 * No es maquetación: es lo único que la aplicación hace hoy. Seis casillas
 * iguales dirían que +58express es seis cosas a medias en vez de una bien.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing as EasingAnimada,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
import { Carrusel } from '../ui/Carrusel';
import { useAireDeArriba } from '../ui/seguro';
import { useIr } from '../ui/navegar';
import { ARTE_DE_CAMPANA, ARTE_DE_SERVICIO } from '../theme/marca';
import {
  AVISOS_DEMO,
  CAMPANAS_DEMO,
  LUGARES_DEMO,
  PASAJERA_DEMO,
  SERVICIOS_DE_INICIO,
  TASA_DEMO
} from './fixtures';
import { AdelantoDeAliados } from './pantallasAliados';
import { Campana } from './pantallasC2Secciones';
import { CampoDeDestino, LugaresGuardados } from '../ui/Trayecto';
import { LienzoDeMapa } from '../ui/Mapa';
import type { ModeloDelMapa } from '../mapa/modelo';
import { AvisoPostulacionDriver, type PropiedadesAvisoPostulacion, type VarianteAvisoPostulacion } from '../ui/AvisoPostulacionDriver';

import { useMovimientoReducido } from '../ui/movimiento';

type Servicio = (typeof SERVICIOS_DE_INICIO)[number];
type Campana = (typeof CAMPANAS_DEMO)[number];
type Lugar = (typeof LUGARES_DEMO)[number];

export { AvisoPostulacionDriver, type PropiedadesAvisoPostulacion, type VarianteAvisoPostulacion };

/**
 * Lo que esta pantalla enseña y NO decide.
 *
 * Quién eres, a cuánto está el dólar, cuántos avisos tienes sin leer, tus
 * sitios guardados, las campañas y si hay aliados que enseñar. En el recorrido
 * de diseño salen de los fixtures; en la aplicación real, de la sesión y del
 * servidor. La pantalla es la misma en los dos sitios: lo único que cambia es
 * de dónde vienen los datos.
 *
 * Todo lo que no llega, no se pinta. Una campaña de ejemplo o «Bs. 000,00» en
 * la aplicación de alguien que va a pagar es una mentira, y ninguna sección
 * vale tanto como para inventarla.
 */
export interface DatosDelInicio {
  readonly nombre: string;
  readonly iniciales: string;
  /** Debajo del nombre. `null` si no hay nada real que decir ahí. */
  readonly zona: string | null;
  /** La tasa del día. `null` mientras no exista una de verdad. */
  readonly tasa: { readonly etiqueta: string; readonly valor: string } | null;
  readonly avisosSinLeer: number;
  readonly lugares: readonly Lugar[];
  readonly campanas: readonly Campana[];
  readonly conAliados: boolean;
}

/** Los datos del recorrido de diseño. Sólo ahí. */
const DATOS_DEMO: DatosDelInicio = Object.freeze({
  nombre: PASAJERA_DEMO.nombre,
  iniciales: PASAJERA_DEMO.iniciales,
  zona: PASAJERA_DEMO.zona,
  tasa: TASA_DEMO,
  avisosSinLeer: AVISOS_DEMO.filter(aviso => aviso.sinLeer).length,
  lugares: LUGARES_DEMO,
  campanas: CAMPANAS_DEMO,
  conAliados: true
});

// ---------------------------------------------------------------------------
// La cabecera
// ---------------------------------------------------------------------------

/**
 * Quién eres y a cuánto está el dólar.
 *
 * La tasa vuelve a Inicio por decisión del dueño. Antes vivía sólo en la
 * pantalla de pedir, con el argumento de que es donde se decide un gasto; ahora
 * manda el otro: en Venezuela la tasa se consulta a todas horas y esta es la
 * pantalla que más se abre.
 */
function Cabecera({ datos }: { readonly datos: DatosDelInicio }) {
  const arriba = useAireDeArriba();
  const tema = useTema();
  const ir = useIr();

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: tema.ritmo.margenPantalla,
      // Sin este aire, el saludo se mete bajo la hora y la batería.
      paddingTop: 12 + arriba,
      paddingBottom: 8
    }}>
      <View style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 2,
        borderColor: tema.color.acento,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tema.color.superficie
      }}>
        <Txt nivel="etiqueta" estilo={{ fontWeight: '800', fontSize: 16 }}>{datos.iniciales}</Txt>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="encabezado" numberOfLines={1}>Hola, {datos.nombre.split(' ')[0]}</Txt>
        <Txt nivel="pie" tono="tenue" numberOfLines={1}>{datos.zona ?? '¿Listo para moverte?'}</Txt>
      </View>

      {/* Sólo con una tasa de verdad. Con el cambio apagado no hay ninguna,
          y «Bs. 000,00» en la pantalla de alguien que va a pagar es una
          cifra falsa, no un hueco. */}
      {datos.tasa !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${datos.tasa.etiqueta}, ${datos.tasa.valor}`}
          onPress={() => ir('saldo')}
          style={{ alignItems: 'flex-end', gap: 1 }}
        >
          <Txt nivel="pie" tono="tenue">{datos.tasa.etiqueta}</Txt>
          <Txt nivel="etiqueta" tono="acento">{datos.tasa.valor}</Txt>
        </Pressable>
      )}

      {/* El componente compartido, no un dibujo repetido: el punto de «sin
          leer» sale de los avisos de verdad, y redibujarlo aquí dejaría un
          punto encendido para siempre. */}
      <Campana
        sinLeer={datos.avisosSinLeer}
        onPress={() => ir('avisos')}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// La rejilla
// ---------------------------------------------------------------------------

/** La etiqueta de lo que todavía no está. */
function RotuloPronto() {
  const tema = useTema();

  return (
    <View style={{
      borderWidth: 1,
      borderColor: tema.color.borde,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: tema.color.superficieHundida
    }}>
      <Txt nivel="etiqueta" tono="tenue" estilo={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5 }}>PRONTO</Txt>
    </View>
  );
}

/**
 * El humo del escape.
 *
 * Tres volutas que salen por detrás de la moto, suben y se deshacen. Dicen que
 * la moto está ENCENDIDA, que era la idea; unas rayas de velocidad delante de
 * una moto parada sólo dicen que hay rayas.
 *
 * Va en gris y no en amarillo: el humo amarillo no existe, y además el amarillo
 * en esa esquina competía con el título.
 */
function Humo() {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  if (quieto) return null;

  return (
    <>
      {([[0, 20, 0.5], [900, 26, 0.4], [1800, 16, 0.3]] as const).map(([retraso, tam, opacidad]) => (
        <Voluta key={retraso} retraso={retraso} tamano={tam} opacidad={opacidad} color={tema.color.textoTenue} />
      ))}
    </>
  );
}

function Voluta({ retraso, tamano, opacidad, color }: {
  readonly retraso: number;
  readonly tamano: number;
  readonly opacidad: number;
  readonly color: string;
}) {
  const valor = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.delay(retraso),
        Animated.timing(valor, { toValue: 1, duration: 2800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.delay(2700 - retraso)
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
        right: 132,
        bottom: 26,
        width: tamano,
        height: tamano,
        borderRadius: tamano / 2,
        backgroundColor: color,
        opacity: valor.interpolate({
          inputRange: [0, 0.18, 1],
          outputRange: [0, opacidad, 0]
        }),
        transform: [
          { translateX: valor.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) },
          { translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
          { scale: valor.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.4] }) }
        ]
      }}
    />
  );
}

/**
 * La casilla ANCHA lleva la moto a la DERECHA, no a la izquierda.
 *
 * La fotografía es apaisada —mide vez y media de ancho lo que de alto— y
 * meterla en el cuadrado que usan las demás la recortaba por las ruedas. Aquí
 * va con su proporción, más grande, asomando por el borde y sobre las estelas.
 *
 * El texto se queda a la izquierda, que es donde se empieza a leer.
 */
function CasillaAncha({ dato }: { readonly dato: Servicio }) {
  const tema = useTema();
  const ir = useIr();
  const quieto = useMovimientoReducido();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dato.titulo}
      onPress={() => ir('servicio', { servicio: dato.clave })}
      style={({ pressed }) => ({
        width: '100%',
        height: 126,
        padding: 16,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficieElevada,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: tema.color.borde,
        transform: [{ scale: pressed && !quieto ? 0.985 : 1 }],
        opacity: pressed ? 0.92 : 1,
        ...tema.superficie.sombra
      })}
    >
      <View style={{
        position: 'absolute',
        right: -6,
        bottom: -4,
        width: 176,
        height: 116
      }}>
        <Humo />
        <Image
          source={ARTE_DE_SERVICIO.moto}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%' }}
        />
      </View>

      <View style={{ width: '56%', height: '100%', justifyContent: 'space-between', zIndex: 2 }}>
        <View style={{ gap: 3 }}>
          <Txt nivel="encabezado" estilo={{ fontWeight: '800', letterSpacing: -0.2 }}>{dato.titulo}</Txt>
          <Txt nivel="pie" tono="secundario" estilo={{ fontSize: 12, lineHeight: 16 }}>{dato.detalle}</Txt>
        </View>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          paddingVertical: 4.5,
          paddingHorizontal: 11,
          borderRadius: 8,
          backgroundColor: `${tema.color.acento}1e`,
          borderWidth: 1,
          borderColor: `${tema.color.acento}44`
        }}>
          <Txt nivel="etiqueta" tono="acento" estilo={{ fontWeight: '700', fontSize: 12 }}>Pedir</Txt>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: tema.color.acento }} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Una casilla estrecha: el arte ENCIMA del texto.
 *
 * En media columna, ponerlo al lado le deja al título unos noventa puntos y
 * «Transporte Seguro» se queda en «Transporte…».
 */
function Casilla({ dato }: { readonly dato: Servicio }) {
  const tema = useTema();
  const ir = useIr();
  const quieto = useMovimientoReducido();
  const arte = ARTE_DE_SERVICIO[dato.arte];

  const lado = 44;

  const emblema = arte === undefined ? (
    <View style={{
      width: lado,
      height: lado,
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Icono
        nombre={dato.icono}
        color={dato.listo ? tema.color.acentoTexto : tema.color.textoTenue}
        tamano={20}
      />
    </View>
  ) : (
    <Image
      source={arte}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      style={{ width: lado, height: lado }}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dato.titulo}
      accessibilityState={{ disabled: !dato.listo }}
      onPress={() => ir('servicio', { servicio: dato.clave })}
      style={({ pressed }) => ({
        flexBasis: '48%',
        flexGrow: 1,
        maxWidth: '49%',
        minHeight: 136,
        padding: 14,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: dato.listo ? `${tema.color.acento}33` : tema.color.borde,
        opacity: dato.listo ? 1 : 0.82,
        transform: [{ scale: pressed && !quieto ? 0.98 : 1 }],
        ...tema.superficie.sombra
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{
          width: 50,
          height: 50,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dato.listo ? `${tema.color.acento}14` : tema.color.superficieHundida,
          borderWidth: 1,
          borderColor: dato.listo ? `${tema.color.acento}33` : tema.color.borde
        }}>
          {emblema}
        </View>
        {!dato.listo && <RotuloPronto />}
      </View>

      <View style={{ gap: 2, marginTop: 8 }}>
        <Txt nivel="etiqueta" estilo={{ fontWeight: '700', fontSize: 13.5 }}>{dato.titulo}</Txt>
        <Txt nivel="pie" tono="tenue" numberOfLines={1} estilo={{ fontSize: 11, lineHeight: 14 }}>{dato.detalle}</Txt>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------

/**
 * El hueco para una promoción, un aviso de la ciudad o una causa.
 *
 * Va con texto de ejemplo y sin cifras: una recaudación inventada en una
 * captura se lee como dinero recaudado de verdad, y con una causa real eso
 * sería grave.
 */
function TarjetaDeCampana({ dato }: { readonly dato: Campana }) {
  const tema = useTema();
  const destacada = dato.tono === 'acento';
  const banner = dato.banner === undefined ? undefined : ARTE_DE_CAMPANA[dato.banner];

  if (banner !== undefined) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dato.titulo}
        style={{
          width: 300,
          borderRadius: tema.radio.tarjeta,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: tema.color.borde
        }}
      >
        <Image
          source={banner}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: 300, height: 169 }}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      style={{
        width: 268,
        padding: tema.ritmo.dentroDeTarjeta,
        borderRadius: tema.radio.tarjeta,
        gap: 11,
        backgroundColor: destacada ? `${tema.color.acento}1f` : tema.color.superficie,
        borderWidth: 1,
        borderColor: destacada ? tema.color.acento : tema.color.borde
      }}
    >
      <Txt nivel="etiqueta" tono={destacada ? 'acento' : 'tenue'}>{dato.rotulo}</Txt>
      <View style={{ gap: 5 }}>
        <Txt nivel="encabezado">{dato.titulo}</Txt>
        <Txt nivel="pie" tono="secundario">{dato.detalle}</Txt>
      </View>
      <Txt nivel="etiqueta" tono="acento">{dato.accion}</Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------------

export function C2InicioPasajera({
  datos = DATOS_DEMO,
  modeloDelMapa,
  avisoPostulacion,
  abrirServiciosAlMontar = false,
  slotBanner
}: {
  /**
   * Sin nada, los datos de ejemplo: es el recorrido de diseño. La aplicación
   * real pasa los suyos —de la sesión y del servidor— y esta misma pantalla
   * los pinta.
   */
  readonly datos?: DatosDelInicio;
  /** La aplicación real pasa coordenadas; el laboratorio conserva su mapa dibujado. */
  readonly modeloDelMapa?: ModeloDelMapa;
  /** Aviso de estado de postulación a Driver (opcional, contextual). */
  readonly avisoPostulacion?: PropiedadesAvisoPostulacion | null;
  /**
   * Abre la hoja de servicios nada más montar.
   *
   * El botón amarillo de las otras pestañas —Saldo, Historial, Perfil— trae
   * aquí con esto puesto. Así «¿Qué necesitas hoy?» sigue siendo UNA sola
   * hoja, la de esta pantalla, en vez de montarse una copia por pestaña. Por
   * omisión `false`: ni el laboratorio ni el resto de usos cambian.
   */
  readonly abrirServiciosAlMontar?: boolean;
  /**
   * Espacio preparado para banner compacto futuro debajo del buscador.
   * Sin lógica publicitaria ni mocks; sólo la reserva limpia para evitar romper mapa o sheet.
   */
  readonly slotBanner?: React.ReactNode;
} = {}) {
  const tema = useTema();
  const ir = useIr();
  const quieto = useMovimientoReducido();
  const { height: altoDePantalla } = useWindowDimensions();
  const progreso = useSharedValue(0);
  const reaccionDeCerrar = useSharedValue(0);
  const [hojaMontada, setHojaMontada] = useState(false);
  const [hojaAbierta, setHojaAbierta] = useState(false);

  const desmontarHoja = useCallback(() => setHojaMontada(false), []);
  const abrirHoja = useCallback(() => {
    setHojaMontada(true);
    setHojaAbierta(true);
  }, []);
  const cerrarHoja = useCallback(() => setHojaAbierta(false), []);

  // Llegar desde otra pestaña con el botón amarillo abre la hoja. Sólo al
  // montar: si se cierra, no se vuelve a abrir sola.
  useEffect(() => {
    if (abrirServiciosAlMontar) abrirHoja();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hojaMontada) return;
    cancelAnimation(progreso);

    if (hojaAbierta) {
      progreso.set(quieto
        ? 1
        : withTiming(1, {
            duration: 260,
            easing: EasingAnimada.bezier(0.16, 1, 0.3, 1)
          }));
      return;
    }

    if (quieto) {
      progreso.set(0);
      desmontarHoja();
      return;
    }

    progreso.set(withTiming(0, {
      duration: 200,
      easing: EasingAnimada.bezier(0.4, 0, 1, 1)
    }, terminada => {
      if (terminada) scheduleOnRN(desmontarHoja);
    }));
  }, [desmontarHoja, hojaAbierta, hojaMontada, progreso, quieto]);

  useEffect(() => {
    if (!hojaAbierta) return;
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      cerrarHoja();
      return true;
    });
    return () => suscripcion.remove();
  }, [cerrarHoja, hojaAbierta]);

  const estiloDeFondo = useAnimatedStyle(() => ({
    opacity: interpolate(progreso.get(), [0, 1], [0, 0.56], Extrapolation.CLAMP)
  }));
  const estiloDeHoja = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(
        progreso.get(),
        [0, 1],
        [altoDePantalla * 0.86, 0],
        Extrapolation.CLAMP
      )
    }]
  }));
  const estiloDeCerrar = useAnimatedStyle(() => ({
    transform: quieto
      ? []
      : [
          { rotate: `${interpolate(reaccionDeCerrar.get(), [0, 1], [0, 18])}deg` },
          { scale: interpolate(reaccionDeCerrar.get(), [0, 1], [1, 0.92]) }
        ]
  }));

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa modelo={modeloDelMapa} conControles={false}>
        <View style={{
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          paddingBottom: 10,
          backgroundColor: tema.color.fondo,
          borderBottomWidth: 1,
          borderBottomColor: tema.color.borde,
          shadowColor: '#000000',
          shadowOpacity: 0.16,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
          elevation: 6
        }}>
          <Cabecera datos={datos} />
          <View style={{ paddingHorizontal: tema.ritmo.margenPantalla }}>
            <CampoDeDestino onPress={() => ir('pedir')} />
            {avisoPostulacion ? (
              <View style={{ marginTop: 8 }}>
                <AvisoPostulacionDriver {...avisoPostulacion} />
              </View>
            ) : null}
            {slotBanner ?? null}
          </View>
        </View>
      </LienzoDeMapa>

      {hojaMontada ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          <Reanimated.View style={[
            { position: 'absolute', inset: 0, backgroundColor: '#000000' },
            estiloDeFondo
          ]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar servicios"
              onPress={cerrarHoja}
              style={{ flex: 1 }}
            />
          </Reanimated.View>

          <Reanimated.View
            accessibilityViewIsModal
            style={[
              {
                position: 'absolute',
                right: 0,
                bottom: 0,
                left: 0,
                height: Math.min(altoDePantalla * 0.78, altoDePantalla - 80),
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                backgroundColor: tema.color.fondo,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: tema.color.borde,
                shadowColor: '#000000',
                shadowOpacity: 0.38,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: -8 },
                elevation: 24,
                overflow: 'hidden'
              },
              estiloDeHoja
            ]}
          >
            <View style={{
              minHeight: 62,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: tema.ritmo.margenPantalla,
              borderBottomWidth: 1,
              borderBottomColor: tema.color.borde
            }}>
              <View style={{
                position: 'absolute',
                top: 8,
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: tema.color.borde
              }} />
              <Txt nivel="encabezado" accessibilityRole="header">
                ¿Qué necesitas hoy?
              </Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                hitSlop={8}
                onPress={cerrarHoja}
                onPressIn={() => reaccionDeCerrar.set(quieto ? 0 : withTiming(1, { duration: 100 }))}
                onPressOut={() => reaccionDeCerrar.set(quieto ? 0 : withSpring(0, { duration: 170, dampingRatio: 1 }))}
                style={({ pressed }) => ({
                  position: 'absolute',
                  right: tema.ritmo.margenPantalla,
                  top: 11,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
                  borderWidth: 1,
                  borderColor: tema.color.borde
                })}
              >
                <Reanimated.View style={estiloDeCerrar}>
                  <Text style={{ color: tema.color.textoPrimario, fontSize: 24, lineHeight: 26, fontWeight: '500' }}>×</Text>
                </Reanimated.View>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: tema.ritmo.margenPantalla,
                paddingTop: 14,
                paddingBottom: 110
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {SERVICIOS_DE_INICIO.map(dato => (
                  dato.ancho
                    ? <CasillaAncha key={dato.clave} dato={dato} />
                    : <Casilla key={dato.clave} dato={dato} />
                ))}
              </View>

              {datos.lugares.length > 0 && (
                <View style={{ marginTop: tema.ritmo.entreBloques }}>
                  <LugaresGuardados lugares={datos.lugares} onNuevo={() => undefined} />
                </View>
              )}

              {datos.campanas.length > 0 && (
                <Carrusel titulo="Lo que está pasando" paso={310}>
                  {datos.campanas.map(dato => (
                    <TarjetaDeCampana key={dato.clave} dato={dato} />
                  ))}
                </Carrusel>
              )}

              {datos.conAliados && (
                <AdelantoDeAliados
                  onVerTodos={() => ir('comercios')}
                  onAbrir={() => ir('comercio')}
                />
              )}
            </ScrollView>
          </Reanimated.View>
        </View>
      ) : null}

      <View style={{ zIndex: 30 }}>
        <BarraDeNavegacion
          destinos={DESTINOS_DE_PASAJERA}
          activo="inicio"
          control={(
            <ControlDePedido
              abierto={hojaAbierta}
              onAlternar={hojaAbierta ? cerrarHoja : abrirHoja}
            />
          )}
        />
      </View>
    </View>
  );
}
