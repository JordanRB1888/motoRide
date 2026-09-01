/**
 * El vestíbulo de la pasajera.
 *
 * SIN MAPA, Y ESA ES LA DECISIÓN GRANDE
 *
 * Hasta aquí, Inicio era el mapa. Ya no: el mapa vive detrás del disco central
 * —se pide un viaje y entonces aparece— y esta pantalla se dedica a otra cosa.
 *
 * El motivo no es de gusto. En reposo, un mapa de tu propia calle no te dice
 * nada que no sepas, y se estaba gastando la pantalla más visitada de la
 * aplicación en enseñarlo. Lo que se gana con ese espacio es a dónde vas, qué
 * hace +58express y sitio para lo que la empresa necesite contar o vender.
 *
 * En el conductor NO se toca: ahí el mapa es el trabajo. Quien conduce mira
 * dónde hay gente; quien pide, no.
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

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
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

/**
 * Lee la preferencia de movimiento reducido del sistema.
 *
 * Aquí hay un bucle infinito —el humo— y quien pide no ver movimiento no puede
 * quedarse con una animación corriendo en la pantalla que más se abre.
 */
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

type Servicio = (typeof SERVICIOS_DE_INICIO)[number];
type Campana = (typeof CAMPANAS_DEMO)[number];

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
function Cabecera() {
  const tema = useTema();
  const ir = useIr();

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: tema.ritmo.margenPantalla,
      paddingTop: 18,
      paddingBottom: tema.ritmo.entreElementos
    }}>
      <View style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tema.color.superficieElevada
      }}>
        <Txt nivel="etiqueta">{PASAJERA_DEMO.iniciales}</Txt>
      </View>

      <View style={{ flex: 1, gap: 1 }}>
        <Txt nivel="encabezado" numberOfLines={1}>Hola, {PASAJERA_DEMO.nombre.split(' ')[0]}</Txt>
        <Txt nivel="pie" tono="tenue" numberOfLines={1}>{PASAJERA_DEMO.zona}</Txt>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${TASA_DEMO.etiqueta}, ${TASA_DEMO.valor}`}
        onPress={() => ir('saldo')}
        style={{ alignItems: 'flex-end', gap: 1 }}
      >
        <Txt nivel="pie" tono="tenue">{TASA_DEMO.etiqueta}</Txt>
        <Txt nivel="etiqueta" tono="acento">{TASA_DEMO.valor}</Txt>
      </Pressable>

      {/* El componente compartido, no un dibujo repetido: el punto de «sin
          leer» sale de los avisos de verdad, y redibujarlo aquí dejaría un
          punto encendido para siempre. */}
      <Campana
        sinLeer={AVISOS_DEMO.filter(aviso => aviso.sinLeer).length}
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
      paddingHorizontal: 7,
      paddingVertical: 2
    }}>
      <Txt nivel="etiqueta" tono="tenue">PRONTO</Txt>
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dato.titulo}
      onPress={() => ir('servicio', { servicio: dato.clave })}
      style={{
        width: '100%',
        minHeight: 96,
        justifyContent: 'center',
        paddingLeft: 16,
        paddingRight: 160,
        paddingVertical: 16,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
        borderWidth: 1,
        borderColor: tema.color.acento,
        overflow: 'hidden'
      }}
    >
      <View style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: tema.color.acento
      }} />
      <Humo />
      <Image
        source={ARTE_DE_SERVICIO[dato.arte]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        style={{ position: 'absolute', right: 10, width: 132, height: 88 }}
      />
      <View style={{ gap: 3 }}>
        <Txt nivel="encabezado">{dato.titulo}</Txt>
        <Txt nivel="pie" tono="tenue">{dato.detalle}</Txt>
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
  const arte = ARTE_DE_SERVICIO[dato.arte];

  // 68 y no 46. Estas ilustraciones están dibujadas como iconos de aplicación
  // —una escena entera, con su fondo y su halo— y a cuarenta y seis puntos se
  // vuelven un borrón. El icono plano sí se leía pequeño; una escena, no.
  const lado = 68;

  /**
   * Con ilustración, no hay disco detrás: el arte ya viene sobre grafito y con
   * las esquinas hechas, y meterlo en un círculo amarillo le pondría un marco a
   * algo que ya está enmarcado. Sin ella, el disco de siempre.
   */
  const emblema = arte === undefined ? (
    <View style={{
      width: lado - 8,
      height: lado - 8,
      borderRadius: (lado - 8) / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dato.listo ? `${tema.color.acento}26` : tema.color.superficieHundida
    }}>
      <Icono
        nombre={dato.icono}
        color={dato.listo ? tema.color.acentoTexto : tema.color.textoTenue}
        tamano={19}
      />
    </View>
  ) : (
    <Image
      source={arte}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      style={{ width: lado, height: lado, borderRadius: 13 }}
    />
  );

  // Centrado: con el arte arriba a la izquierda, la esquina derecha quedaba
  // vacía y el texto descolgado. Centradas, las seis se leen como una familia.
  const texto = (
    <View style={{ gap: 3 }}>
      <Txt nivel="cuerpo" centrado>{dato.titulo}</Txt>
      <Txt nivel="pie" tono="tenue" centrado>{dato.detalle}</Txt>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !dato.listo }}
      accessibilityLabel={dato.listo ? dato.titulo : `${dato.titulo}. Pronto`}
      // Las que no están listas TAMBIÉN navegan, a una pantalla que explica qué
      // falta. Antes estaban bloqueadas: la casilla decía PRONTO y aun así
      // invitaba a tocarla, y quien la tocaba no sabía si había fallado algo.
      onPress={() => ir('servicio', { servicio: dato.clave })}
      style={{
        width: '48.5%',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 16,
        paddingHorizontal: 14,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
        borderWidth: 1,
        borderColor: tema.color.borde,
        opacity: dato.listo ? 1 : 0.62,
        overflow: 'hidden'
      }}
    >
      {emblema}
      {texto}

      {/* DESPUES del arte, no antes.
          El rotulo va en la esquina y la ilustracion esta centrada: se solapan.
          Pintado antes, la imagen le comia la mitad izquierda y se leia
          «ONTO». No cambia de sitio; cambia quien queda arriba. */}
      {dato.listo ? null : (
        <View style={{ position: 'absolute', top: 10, right: 10 }}>
          <RotuloPronto />
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Las campañas
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

  // Con banner, la campaña ES la imagen: el anunciante entrega su arte con su
  // texto dentro y nosotros sólo la enmarcamos.
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

export function C2InicioPasajera() {
  const tema = useTema();
  const ir = useIr();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <Cabecera />

        <View style={{ paddingHorizontal: tema.ritmo.margenPantalla }}>
          <CampoDeDestino onPress={() => ir('pedir')} />
          <View style={{ height: tema.ritmo.entreElementos }} />
          <LugaresGuardados lugares={LUGARES_DEMO} onNuevo={() => undefined} />

          <View style={{ marginTop: tema.ritmo.entreBloques }}>
            <Txt nivel="encabezado" centrado accessibilityRole="header">¿Qué necesitas hoy?</Txt>
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 11
            }}>
              {SERVICIOS_DE_INICIO.map(dato => (
                dato.ancho
                  ? <CasillaAncha key={dato.clave} dato={dato} />
                  : <Casilla key={dato.clave} dato={dato} />
              ))}
            </View>
          </View>

          <View style={{ marginTop: tema.ritmo.entreBloques }}>
            <Txt nivel="encabezado" accessibilityRole="header">Lo que está pasando</Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 11, marginRight: -tema.ritmo.margenPantalla }}
              contentContainerStyle={{ gap: 10, paddingRight: tema.ritmo.margenPantalla }}
            >
              {CAMPANAS_DEMO.map(dato => (
                <TarjetaDeCampana key={dato.clave} dato={dato} />
              ))}
            </ScrollView>
          </View>

          <AdelantoDeAliados
            onVerTodos={() => ir('comercios')}
            onAbrir={() => ir('comercio')}
          />
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}
