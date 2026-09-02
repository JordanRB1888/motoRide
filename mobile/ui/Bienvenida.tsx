/**
 * La bienvenida oficial: la primera pantalla de +58Express sin sesión.
 *
 * UN TOQUE, UNA PUERTA
 *
 * Dos tarjetas, Pasajero y Conductor. No se seleccionan: se pulsan, y cada una
 * lleva directa a su acceso. La primera versión tenía selección más un botón
 * «Continuar con correo» debajo, y eran dos gestos para una sola decisión: el
 * dueño lo vio y tenía razón.
 *
 * ESTO ES NAVEGACIÓN, NO AUTORIZACIÓN
 *
 * Lo que se elige aquí es una INTENCIÓN: decide qué contexto enseña el acceso
 * y, cuando exista el alta en la aplicación, qué flujo de registro se abre.
 * Nada más. El rol lo dice la cuenta —`/api/auth/me`— cuando la persona entra.
 * `domain/entrada.ts` lo deja escrito y probado.
 *
 * Esta pantalla no sabe de sesión ni de red: recibe qué enseñar y avisa de lo
 * que la persona hizo. Quien la monta decide a dónde se va.
 *
 * NADA DE DESARROLLO
 *
 * Ni atajos al laboratorio, ni «recorrer la aplicación», ni datos de ejemplo.
 * Esas herramientas siguen existiendo, sólo en rutas de desarrollo a las que
 * se va a propósito. Ésta es la pantalla que abre la aplicación.
 *
 * GOOGLE Y APPLE NO ESTÁN AQUÍ
 *
 * Están dentro de cada acceso, que es donde se entra. Ponerlos antes de elegir
 * pedía una cuenta sin saber todavía de qué.
 *
 * LA MOTO
 *
 * Al montar, el logotipo entra y se queda al ralentí, con el motor encendido.
 * Al pulsar una tarjeta: ignición, retroceso, aceleración con estelas
 * amarillas y salida por la derecha. 560 ms en total, y la navegación se
 * dispara a los 440 sin esperar al final. En el acceso, la moto ENTRA por la
 * izquierda y frena: es el mismo viaje partido en dos pantallas. Con
 * movimiento reducido no se anima nada y se navega en el acto.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from './componentes';
import { Icono } from './Icono';
import { FlechaDerecha } from './IconosDeCampo';
import { AvatarDeRol, LogoEncendido } from './Marca';
import { HeroDeMarca, LemaConFilos, PlacaDeMarca } from './HeroDeMarca';
import { useMovimientoReducido } from './movimiento';
import { useTema } from '../theme/ThemeContext';
import { AMARILLO } from '../theme/primitives';
import {
  AVISO_LEGAL,
  DOCUMENTOS_LEGALES,
  LEMA,
  OPCIONES_DE_ENTRADA,
  SALIDA_DE_LA_MOTO,
  type ClaveDeDocumentoLegal,
  type IntencionDeEntrada,
  type OpcionDeEntrada as DatosDeOpcion
} from '../domain/entrada';

const ANCHO_DEL_LOGO = 244;
/** Hasta dónde se va la moto: fuera de la placa por la derecha. */
const SALIDA_A_LA_DERECHA = ANCHO_DEL_LOGO * 1.7;

export function Bienvenida({ onElegir, onAbrirDocumento, testID = 'bienvenida' }: {
  /** Se avisa cuando la moto ya se va (o en el acto, con movimiento reducido). */
  readonly onElegir: (intencion: IntencionDeEntrada) => void;
  readonly onAbrirDocumento: (documento: ClaveDeDocumentoLegal) => void;
  readonly testID?: string;
}) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

  /** Cuál se pulsó. Mientras la moto sale, esa tarjeta se queda encendida. */
  const [saliendo, setSaliendo] = useState<IntencionDeEntrada | null>(null);

  const desplazamiento = useRef(new Animated.Value(0)).current;
  const presencia = useRef(new Animated.Value(1)).current;
  const estelas = useRef(new Animated.Value(0)).current;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const elegir = (intencion: IntencionDeEntrada) => {
    if (saliendo !== null) return;
    setSaliendo(intencion);

    // Con movimiento reducido no hay moto que se vaya: se navega y ya.
    if (quieto) {
      onElegir(intencion);
      return;
    }

    // La navegación va con reloj propio, no colgada del final de la animación:
    // se dispara cuando la moto ya casi salió, y aunque la animación se trabara
    // no dejaría a nadie esperando.
    temporizador.current = setTimeout(() => onElegir(intencion), SALIDA_DE_LA_MOTO.navegarEn);

    const mover = (a: number, duracion: number, easing = Easing.linear) =>
      Animated.timing(desplazamiento, { toValue: a, duration: duracion, easing, useNativeDriver: true });
    const sacudida = SALIDA_DE_LA_MOTO.ignicion / 6;

    Animated.sequence([
      // 1 · Ignición: seis sacudidas cortas, cada vez más suaves.
      Animated.sequence([
        mover(2, sacudida), mover(-2, sacudida), mover(2, sacudida),
        mover(-1.5, sacudida), mover(1, sacudida), mover(0, sacudida)
      ]),
      // 2 · Retroceso: la moto se carga.
      mover(-14, SALIDA_DE_LA_MOTO.retroceso, Easing.out(Easing.quad)),
      // 3-5 · Aceleración a la derecha, con las estelas detrás, hasta salir.
      Animated.parallel([
        mover(SALIDA_A_LA_DERECHA, SALIDA_DE_LA_MOTO.aceleracion, Easing.in(Easing.cubic)),
        Animated.timing(presencia, {
          toValue: 0, duration: SALIDA_DE_LA_MOTO.aceleracion,
          easing: Easing.in(Easing.quad), useNativeDriver: true
        }),
        Animated.timing(estelas, {
          toValue: 1, duration: SALIDA_DE_LA_MOTO.aceleracion,
          easing: Easing.out(Easing.quad), useNativeDriver: true
        })
      ])
    ]).start();
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID={testID}>
      {/* Iconos oscuros: arriba siempre hay amarillo, de día y de noche. */}
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <HeroDeMarca variante="bienvenida" insetSuperior={insets.top}>
          <PlacaDeMarca testID="placa-de-marca" ancho={352}>
            <Estelas avance={estelas} />
            <Animated.View
              style={{
                opacity: presencia,
                transform: [{ translateX: desplazamiento }]
              }}
            >
              <LogoEncendido ancho={ANCHO_DEL_LOGO} enMarcha={saliendo === null} />
            </Animated.View>
          </PlacaDeMarca>

          {/* El lema de la marca, el mismo de la web. */}
          <LemaConFilos texto={LEMA} />
        </HeroDeMarca>

        <View style={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: 10,
          gap: 18
        }}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Txt nivel="display" centrado accessibilityRole="header">¿Cómo quieres continuar?</Txt>
            <Txt nivel="cuerpo" tono="secundario" centrado>
              Puedes cambiar de modo cuando quieras.
            </Txt>
          </View>

          <View style={{ gap: 14 }}>
            {OPCIONES_DE_ENTRADA.map(opcion => (
              <PuertaDeEntrada
                key={opcion.intencion}
                opcion={opcion}
                encendida={saliendo === opcion.intencion}
                bloqueada={saliendo !== null}
                onPress={() => elegir(opcion.intencion)}
              />
            ))}
          </View>

          <AvisoLegal onAbrir={onAbrirDocumento} />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Las estelas amarillas que deja la moto al irse. Tres, a alturas distintas y
 * con un pequeño desfase, todas movidas por el mismo valor: así van siempre a
 * compás con la aceleración.
 */
function Estelas({ avance }: { readonly avance: Animated.Value }) {
  const lineas = [
    { top: '34%', alto: 3, retraso: 0, largo: 150 },
    { top: '50%', alto: 4, retraso: 0.08, largo: 190 },
    { top: '66%', alto: 3, retraso: 0.16, largo: 130 }
  ] as const;

  return (
    <>
      {lineas.map(linea => (
        <Animated.View
          key={linea.top}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -linea.largo,
            top: linea.top,
            width: linea.largo,
            height: linea.alto,
            borderRadius: linea.alto,
            backgroundColor: AMARILLO.base,
            opacity: avance.interpolate({
              inputRange: [0, linea.retraso, linea.retraso + 0.25, linea.retraso + 0.7, 1],
              outputRange: [0, 0, 0.95, 0.5, 0]
            }),
            transform: [{
              translateX: avance.interpolate({
                inputRange: [0, linea.retraso, 1],
                outputRange: [0, 0, 340 + linea.largo * 2]
              })
            }]
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Las dos puertas
// ---------------------------------------------------------------------------

/**
 * Una tarjeta que LLEVA a un sitio, no que se marca.
 *
 * Por eso es un botón y no una opción de radio, y por eso a la derecha hay un
 * disco amarillo con una flecha y no una casilla: dice que al tocar se va a
 * otra pantalla. Al pulsarla se queda encendida —filo y borde amarillos—
 * mientras la moto sale, para que se vea cuál se eligió.
 */
function PuertaDeEntrada({ opcion, encendida, bloqueada, onPress }: {
  readonly opcion: DatosDeOpcion;
  readonly encendida: boolean;
  readonly bloqueada: boolean;
  readonly onPress: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      disabled={bloqueada}
      accessibilityRole="button"
      accessibilityState={{ disabled: bloqueada, busy: encendida }}
      accessibilityLabel={`${opcion.titulo}. ${opcion.detalle}`}
      accessibilityHint="Abre el acceso"
      testID={`opcion-${opcion.intencion}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 14,
        borderRadius: 22,
        backgroundColor: tema.color.superficieElevada,
        borderWidth: 1.5,
        borderColor: pressed || encendida ? tema.color.acento : tema.color.borde,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        // La que no se pulsó se queda atrás mientras la otra abre.
        opacity: bloqueada && !encendida ? 0.5 : 1,
        ...tema.superficie.sombra
      })}
    >
      {/* El arte del rol, con el sello de la marca en la esquina. */}
      <View style={{ width: 84, height: 84, borderRadius: 18, overflow: 'hidden' }}>
        <AvatarDeRol rol={opcion.avatar} tamano={84} />
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <Icono nombre="perfil" color={AMARILLO.base} tamano={18} />
        </View>
      </View>

      <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
        <Txt nivel="encabezado">{opcion.titulo}</Txt>
        <Txt nivel="pie" tono="secundario">{opcion.detalle}</Txt>
      </View>

      <DiscoConFlecha activo={encendida} />
    </Pressable>
  );
}

/** El disco amarillo de la derecha: la señal de «esto abre algo». */
function DiscoConFlecha({ activo }: { readonly activo: boolean }) {
  const tema = useTema();

  return (
    <View style={{
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: activo ? tema.color.acentoPresionado : tema.color.acento,
      ...tema.superficie.sombra
    }}>
      <FlechaDerecha tamano={20} color={tema.color.sobreAcento} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// El aviso legal
// ---------------------------------------------------------------------------

/**
 * Sin casilla obligatoria: la política actual no la exige, y una casilla
 * delante de la primera puerta es una traba que nadie pidió.
 */
function AvisoLegal({ onAbrir }: { readonly onAbrir: (documento: ClaveDeDocumentoLegal) => void }) {
  const tema = useTema();
  const enlace = { color: tema.color.acentoTexto, fontWeight: '600' as const };

  return (
    <Txt nivel="pie" tono="tenue" centrado estilo={{ paddingTop: 4 } as never}>
      {AVISO_LEGAL.antes}
      <Text
        style={enlace}
        accessibilityRole="link"
        onPress={() => onAbrir('terminos')}
        testID="enlace-terminos"
      >
        {DOCUMENTOS_LEGALES.terminos.titulo}
      </Text>
      {AVISO_LEGAL.entre}
      <Text
        style={enlace}
        accessibilityRole="link"
        onPress={() => onAbrir('privacidad')}
        testID="enlace-privacidad"
      >
        {DOCUMENTOS_LEGALES.privacidad.titulo}
      </Text>
      {AVISO_LEGAL.despues}
    </Txt>
  );
}
