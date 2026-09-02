/**
 * La bienvenida oficial: la primera pantalla de +58Express sin sesión.
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * Es la superficie de «¿Cómo quieres continuar?» que el dueño aprobó en el
 * recorrido de diseño, convertida en pantalla real de entrada. Lo que se elige
 * aquí —Pasajero o Conductor— es una INTENCIÓN de navegación: decide el
 * contexto del acceso, y nada más. El rol lo dice la cuenta cuando entra.
 * `domain/entrada.ts` lo deja escrito y probado.
 *
 * Esta pantalla no sabe de sesión ni de red: recibe lo que enseñar y avisa de
 * lo que la persona hizo. Quien la monta decide a dónde se va.
 *
 * NADA DE DESARROLLO
 *
 * Aquí no hay atajos al laboratorio, ni «recorrer la aplicación», ni datos de
 * ejemplo. Esas herramientas siguen existiendo, sólo en rutas de desarrollo a
 * las que se va a propósito. Ésta es la pantalla que abre la aplicación.
 *
 * EL HERO AMARILLO
 *
 * La marca entra fuerte por arriba: una masa amarilla con la curva asimétrica,
 * dos resplandores del amarillo vivo para darle profundidad sin degradados, y
 * un eco más tenue por debajo. Dentro, el logotipo oficial va sobre una placa
 * grafito: es el fondo para el que está dibujado —el «+58 EXPRESS» es claro y
 * las estelas amarillas— y sobre el amarillo directamente las estelas se
 * perderían. La placa es además la pista por la que la moto se va.
 *
 * LA MOTO
 *
 * Al montar, el logotipo entra con `LogoQueEntra` —la animación de la web—, y
 * al asentarse queda al ralentí: un vaivén de menos de dos puntos que se lee
 * como suspensión. Al continuar: ignición (sacudida), pequeño retroceso,
 * aceleración hacia la DERECHA con estelas amarillas, y salida. 560 ms en
 * total. La navegación no espera al final: se dispara a los 440 ms, y con
 * movimiento reducido se dispara en el acto, sin animar nada.
 *
 * Todo va por `transform` y `opacity` con el controlador nativo.
 *
 * GOOGLE Y APPLE
 *
 * Están reservados y se ven, pero no hay autenticación detrás: se enseñan
 * deshabilitados con «Disponible próximamente». No se finge nada.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Boton, Insignia, Txt } from './componentes';
import { AvatarDeRol, LogoQueEntra } from './Marca';
import { useTema } from '../theme/ThemeContext';
// Las primitivas, y no el tema, para dos cosas que NO cambian con el esquema:
// la placa grafito bajo el logotipo, que es oscura de día y de noche porque el
// logotipo está dibujado para fondo oscuro; y los amarillos vivos del
// resplandor del hero, que es amarillo en los dos esquemas.
import { AMARILLO, GRAFITO } from '../theme/primitives';
import {
  AVISO_DE_NO_DISPONIBLE,
  AVISO_LEGAL,
  DOCUMENTOS_LEGALES,
  ENTRADA_SOCIAL,
  INTENCION_POR_DEFECTO,
  OPCIONES_DE_ENTRADA,
  SALIDA_DE_LA_MOTO,
  describirIntencion,
  type ClaveDeDocumentoLegal,
  type IntencionDeEntrada,
  type OpcionDeEntrada as DatosDeOpcion
} from '../domain/entrada';

const ANCHO_DEL_LOGO = 228;
/** Hasta dónde se va la moto: fuera de la placa por la derecha. */
const SALIDA_A_LA_DERECHA = ANCHO_DEL_LOGO * 1.7;

/** Si el sistema pide movimiento reducido. Igual que en `Marca` y `Arranque`. */
function useMovimientoReducido(): boolean {
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setQuieto(activo); })
      .catch(() => { /* si no se puede consultar, se anima */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieto);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  return quieto;
}

export function Bienvenida({
  intencionInicial = INTENCION_POR_DEFECTO,
  onContinuarConCorreo,
  onAbrirDocumento,
  testID = 'bienvenida'
}: {
  /** Lo que se preselecciona: lo recordado de la última vez, o Pasajero. */
  readonly intencionInicial?: IntencionDeEntrada;
  /** Se avisa cuando la moto ya se va (o en el acto, con movimiento reducido). */
  readonly onContinuarConCorreo: (intencion: IntencionDeEntrada) => void;
  readonly onAbrirDocumento: (documento: ClaveDeDocumentoLegal) => void;
  readonly testID?: string;
}) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

  const [intencion, setIntencion] = useState<IntencionDeEntrada>(intencionInicial);
  const [asentado, setAsentado] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // Los cuatro valores del movimiento: dónde está la moto, el vaivén del
  // ralentí, cuánto se ve, y cuánto han avanzado las estelas.
  const desplazamiento = useRef(new Animated.Value(0)).current;
  const ralenti = useRef(new Animated.Value(0)).current;
  const presencia = useRef(new Animated.Value(1)).current;
  const estelas = useRef(new Animated.Value(0)).current;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alAsentarse = useCallback(() => setAsentado(true), []);

  // EL RALENTÍ. Sólo cuando el logotipo ya asentó, nunca con movimiento
  // reducido, y se para en cuanto arranca la salida.
  useEffect(() => {
    if (!asentado || quieto || saliendo) {
      ralenti.setValue(0);
      return;
    }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(ralenti, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(ralenti, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [asentado, quieto, saliendo, ralenti]);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const continuar = () => {
    if (saliendo) return;
    setSaliendo(true);

    // Con movimiento reducido no hay moto que se vaya: se navega y ya.
    if (quieto) {
      onContinuarConCorreo(intencion);
      return;
    }

    // La navegación va con reloj propio, no colgada del final de la animación:
    // se dispara cuando la moto ya casi salió, y aunque la animación se
    // trabara no dejaría a nadie esperando.
    temporizador.current = setTimeout(() => onContinuarConCorreo(intencion), SALIDA_DE_LA_MOTO.navegarEn);

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

  const elegida = describirIntencion(intencion);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID={testID}>
      {/* Iconos oscuros: arriba siempre hay amarillo, de día y de noche. */}
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <HeroAmarillo insetSuperior={insets.top}>
          <View
            testID="placa-de-marca"
            style={{
              width: '100%',
              maxWidth: 336,
              borderRadius: 28,
              backgroundColor: GRAFITO.fondo,
              borderWidth: 1,
              borderColor: `${AMARILLO.base}40`,
              paddingVertical: 20,
              alignItems: 'center',
              overflow: 'hidden'
            }}
          >
            <Estelas avance={estelas} />
            <Animated.View
              style={{
                opacity: presencia,
                transform: [
                  { translateX: desplazamiento },
                  { translateY: ralenti.interpolate({ inputRange: [0, 1], outputRange: [0, -1.8] }) },
                  { rotate: ralenti.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '0.4deg'] }) }
                ]
              }}
            >
              <LogoQueEntra ancho={ANCHO_DEL_LOGO} alDetenerse={alAsentarse} />
            </Animated.View>
          </View>

          <Txt nivel="etiqueta" tono="sobreAcento" centrado>Mototaxi en Maracaibo</Txt>
        </HeroAmarillo>

        <View style={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: tema.ritmo.entreBloques,
          gap: tema.ritmo.entreElementos
        }}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Txt nivel="titulo" centrado accessibilityRole="header">¿Cómo quieres continuar?</Txt>
            <Txt nivel="pie" tono="secundario" centrado>
              Puedes cambiar de modo cuando quieras.
            </Txt>
          </View>

          <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
            {OPCIONES_DE_ENTRADA.map(opcion => (
              <OpcionDeEntrada
                key={opcion.intencion}
                opcion={opcion}
                activa={intencion === opcion.intencion}
                deshabilitada={saliendo}
                onPress={() => setIntencion(opcion.intencion)}
              />
            ))}
          </View>

          <View style={{ gap: 10, paddingTop: 4 }}>
            <BotonSocial
              titulo={ENTRADA_SOCIAL.google.titulo}
              disponible={ENTRADA_SOCIAL.google.disponible}
              testID="entrada-google"
            />
            <BotonSocial
              titulo={ENTRADA_SOCIAL.apple.titulo}
              disponible={ENTRADA_SOCIAL.apple.disponible}
              testID="entrada-apple"
            />
            <Boton
              titulo="Continuar con correo"
              onPress={continuar}
              deshabilitado={saliendo}
              etiquetaAccesible={`Continuar con correo como ${elegida.titulo.toLowerCase()}`}
              testID="continuar-con-correo"
            />
          </View>

          <AvisoLegal onAbrir={onAbrirDocumento} />
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// El hero
// ---------------------------------------------------------------------------

function HeroAmarillo({ insetSuperior, children }: {
  readonly insetSuperior: number;
  readonly children: ReactNode;
}) {
  const tema = useTema();

  return (
    // El eco: la misma silueta, mucho más tenue, diez puntos por debajo. Es la
    // profundidad sin un degradado.
    <View style={{
      backgroundColor: `${tema.color.acento}30`,
      borderBottomLeftRadius: 48,
      borderBottomRightRadius: 128,
      paddingBottom: 10
    }}>
      <View
        testID="hero-amarillo"
        style={{
          backgroundColor: tema.color.acento,
          paddingTop: insetSuperior + 20,
          paddingBottom: 26,
          paddingHorizontal: tema.ritmo.margenPantalla,
          borderBottomLeftRadius: 44,
          borderBottomRightRadius: 120,
          alignItems: 'center',
          gap: 16,
          overflow: 'hidden',
          ...tema.superficie.sombra
        }}
      >
        {/* Dos resplandores del amarillo vivo, muy sutiles: uno arriba a la
            derecha, otro abajo a la izquierda. Sin ellos el hero es un
            rectángulo plano pintado. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', right: -90, top: -70,
            width: 280, height: 280, borderRadius: 140,
            backgroundColor: AMARILLO.vivo, opacity: 0.55
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: -60, bottom: -80,
            width: 220, height: 220, borderRadius: 110,
            backgroundColor: AMARILLO.intenso, opacity: 0.35
          }}
        />
        {children}
      </View>
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
// Las tarjetas
// ---------------------------------------------------------------------------

function OpcionDeEntrada({ opcion, activa, deshabilitada, onPress }: {
  readonly opcion: DatosDeOpcion;
  readonly activa: boolean;
  readonly deshabilitada: boolean;
  readonly onPress: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitada}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa, checked: activa, disabled: deshabilitada }}
      accessibilityLabel={`${opcion.titulo}. ${opcion.detalle}`}
      testID={`opcion-${opcion.intencion}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: tema.radio.tarjeta,
        // La elegida se ve: superficie elevada, borde amarillo y sombra. La
        // otra se queda atrás con su avatar atenuado.
        backgroundColor: activa ? tema.color.superficieElevada : tema.color.superficie,
        borderWidth: 2,
        borderColor: activa ? tema.color.acento : tema.color.borde,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        ...(activa ? tema.superficie.sombra : {})
      })}
    >
      <View style={{ width: 56, height: 56, borderRadius: tema.radio.campo, overflow: 'hidden' }}>
        <AvatarDeRol rol={opcion.avatar} tamano={56} atenuado={!activa} />
      </View>

      <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
        <Txt nivel="encabezado">{opcion.titulo}</Txt>
        <Txt nivel="pie" tono="secundario">{opcion.detalle}</Txt>
      </View>

      <MarcaDeSeleccion activa={activa} />
    </Pressable>
  );
}

/** El disco de la derecha: amarillo con la marca cuando está elegida. */
function MarcaDeSeleccion({ activa }: { readonly activa: boolean }) {
  const tema = useTema();

  return (
    <View style={{
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: activa ? tema.color.acento : 'transparent',
      borderWidth: activa ? 0 : 1.5,
      borderColor: tema.color.borde
    }}>
      {activa ? (
        <View style={{
          width: 6, height: 10,
          marginTop: -2,
          borderRightWidth: 2, borderBottomWidth: 2,
          borderColor: tema.color.sobreAcento,
          transform: [{ rotate: '45deg' }]
        }} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Google y Apple
// ---------------------------------------------------------------------------

function BotonSocial({ titulo, disponible, onPress, testID }: {
  readonly titulo: string;
  readonly disponible: boolean;
  /** Sólo tiene sentido cuando `disponible`; sin él, el botón no hace nada. */
  readonly onPress?: () => void;
  readonly testID: string;
}) {
  const tema = useTema();

  return (
    <Pressable
      disabled={!disponible}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityHint={disponible ? undefined : AVISO_DE_NO_DISPONIBLE}
      accessibilityState={{ disabled: !disponible }}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 16,
        borderRadius: tema.radio.boton,
        borderWidth: 1,
        borderColor: tema.color.borde,
        backgroundColor: pressed && disponible ? tema.color.superficieElevada : tema.color.superficie
      })}
    >
      <Txt
        nivel="cuerpo"
        tono={disponible ? 'primario' : 'secundario'}
        estilo={{ fontWeight: '600' } as never}
      >
        {titulo}
      </Txt>
      {disponible ? null : <Insignia texto={AVISO_DE_NO_DISPONIBLE} tono="neutro" />}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// El aviso legal
// ---------------------------------------------------------------------------

/**
 * Sin casilla obligatoria: la política actual no la exige, y una casilla
 * delante del primer botón es una traba que nadie pidió.
 */
function AvisoLegal({ onAbrir }: { readonly onAbrir: (documento: ClaveDeDocumentoLegal) => void }) {
  const tema = useTema();
  const enlace = { color: tema.color.acentoTexto, fontWeight: '600' as const };

  return (
    <Txt nivel="pie" tono="tenue" centrado estilo={{ paddingTop: 6 } as never}>
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
