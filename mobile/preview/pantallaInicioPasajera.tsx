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

import { Image, Pressable, ScrollView, View } from 'react-native';
import { Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_SERVICIO } from '../theme/marca';
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
        style={{ alignItems: 'flex-end', gap: 1 }}
      >
        <Txt nivel="pie" tono="tenue">{TASA_DEMO.etiqueta}</Txt>
        <Txt nivel="etiqueta" tono="acento">{TASA_DEMO.valor}</Txt>
      </Pressable>

      {/* El componente compartido, no un dibujo repetido: el punto de «sin
          leer» sale de los avisos de verdad, y redibujarlo aquí dejaría un
          punto encendido para siempre. */}
      <Campana sinLeer={AVISOS_DEMO.filter(aviso => aviso.sinLeer).length} />
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
 * Una casilla.
 *
 * Ancha: el icono al lado del texto, que hay sitio de sobra.
 * Estrecha: el icono ENCIMA. En media columna, ponerlo al lado le deja al
 * título unos noventa puntos y «Transporte Seguro» se queda en «Transporte…».
 */
function Casilla({ dato }: { readonly dato: Servicio }) {
  const tema = useTema();
  const arte = ARTE_DE_SERVICIO[dato.arte];
  const lado = dato.ancho ? 54 : 46;

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
        tamano={dato.ancho ? 23 : 19}
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

  const texto = (
    <View style={{ flex: dato.ancho ? 1 : undefined, gap: 2 }}>
      <Txt nivel={dato.ancho ? 'encabezado' : 'cuerpo'}>{dato.titulo}</Txt>
      <Txt nivel="pie" tono="tenue">{dato.detalle}</Txt>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !dato.listo }}
      accessibilityLabel={dato.listo ? dato.titulo : `${dato.titulo}. Pronto`}
      disabled={!dato.listo}
      style={{
        width: dato.ancho ? '100%' : '48.5%',
        flexDirection: dato.ancho ? 'row' : 'column',
        alignItems: dato.ancho ? 'center' : 'stretch',
        gap: dato.ancho ? 12 : 10,
        padding: 14,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
        borderWidth: 1,
        borderColor: dato.listo && dato.ancho ? tema.color.acento : tema.color.borde,
        opacity: dato.listo ? 1 : 0.62,
        overflow: 'hidden'
      }}
    >
      {dato.listo && dato.ancho ? (
        <View style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          backgroundColor: tema.color.acento
        }} />
      ) : null}

      {dato.listo ? null : (
        <View style={{ position: 'absolute', top: 10, right: 10 }}>
          <RotuloPronto />
        </View>
      )}

      {emblema}
      {texto}
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

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <Cabecera />

        <View style={{ paddingHorizontal: tema.ritmo.margenPantalla }}>
          <CampoDeDestino />
          <View style={{ height: tema.ritmo.entreElementos }} />
          <LugaresGuardados lugares={LUGARES_DEMO} onNuevo={() => undefined} />

          <View style={{ marginTop: tema.ritmo.entreBloques }}>
            <Txt nivel="encabezado" accessibilityRole="header">¿Qué necesitas hoy?</Txt>
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 11
            }}>
              {SERVICIOS_DE_INICIO.map(dato => (
                <Casilla key={dato.clave} dato={dato} />
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

          <AdelantoDeAliados />
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
