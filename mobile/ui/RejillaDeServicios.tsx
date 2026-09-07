/**
 * «Nuestros servicios»: la rejilla de cuatro columnas de la referencia, y la
 * tarjeta destacada.
 *
 * LAS ILUSTRACIONES SON LAS ENCARGADAS
 *
 * Cada casilla lleva la ilustración que el dueño encargó para ese servicio
 * (`ARTE_DE_SERVICIO`), en miniatura redondeada. No se sustituyen por
 * pictogramas para parecerse más a la referencia: son activos de marca. La que
 * no exista todavía cae al icono de la familia.
 *
 * LO QUE NO ESTÁ, LO DICE
 *
 * La referencia no enseña ningún «pronto». La aplicación sí, porque una casilla
 * que no lleva a nada sin decirlo es una promesa rota a la primera pulsación —y
 * de las que las tiendas rechazan—. Va en una píldora pequeña, arriba a la
 * derecha, para que la rejilla siga leyéndose como la referencia. Y navega a la
 * pantalla de «pronto», que explica qué falta.
 *
 * `ancho` no se mira aquí: es la disposición de la hoja y del dibujo web. La
 * rejilla del inicio es uniforme, como en la referencia.
 *
 * Los tipos se declaran aquí y no se importan del fixture: `ui/` no depende de
 * `preview/`. Lo que el fixture exporta encaja en ellos.
 */

import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_SERVICIO, VEHICULOS } from '../theme/marca';
import { CabeceraDeSeccion } from './CabeceraDeSeccion';
import { Icono, type NombreDeIcono } from './Icono';
import { Txt } from './componentes';
import { useMovimientoReducido } from './movimiento';

export interface ServicioDelInicio {
  readonly clave: string;
  readonly titulo: string;
  readonly detalle: string;
  readonly icono: NombreDeIcono;
  /** El nombre en `ARTE_DE_SERVICIO`. Sin ilustración cae al icono. */
  readonly arte: string;
  readonly listo: boolean;
}

export interface ServicioDestacadoDelInicio {
  readonly clave: string;
  readonly rotulo: string;
  readonly titulo: string;
  readonly detalle: string;
  readonly listo: boolean;
}

const COLUMNAS = 4;
const HUECO = 10;
const ALTO_DE_CASILLA = 148;

function PildoraPronto() {
  const tema = useTema();
  return (
    <View style={[estilos.pronto, { backgroundColor: tema.color.superficieHundida }]}>
      <Text style={[estilos.prontoTexto, { color: tema.color.textoTenue }]}>PRONTO</Text>
    </View>
  );
}

function Casilla({ dato, ancho, onPress }: {
  readonly dato: ServicioDelInicio;
  readonly ancho: number;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const arte = ARTE_DE_SERVICIO[dato.arte];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dato.listo ? `${dato.titulo}: ${dato.detalle}` : `${dato.titulo}, próximamente`}
      accessibilityState={{ disabled: !dato.listo }}
      style={({ pressed }) => [
        estilos.casilla,
        {
          width: ancho,
          borderRadius: 16,
          backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
          borderColor: tema.color.borde,
          transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]
        }
      ]}
    >
      {arte === undefined ? (
        <View style={[estilos.miniatura, { backgroundColor: tema.color.superficieHundida }]}>
          <Icono nombre={dato.icono} color={tema.color.acentoTexto} tamano={26} />
        </View>
      ) : (
        <Image source={arte} resizeMode="cover" style={estilos.miniatura} />
      )}
      {/* Una sola línea que encoge antes de partirse: «Comercios» no cabe a
          trece puntos en la casilla estrecha y se partía en «Comercio / s». */}
      <Txt
        nivel="etiqueta"
        estilo={{ fontWeight: '700', textAlign: 'center' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {dato.titulo}
      </Txt>
      <Text style={[estilos.detalle, { color: tema.color.textoSecundario }]} numberOfLines={2}>{dato.detalle}</Text>
      {dato.listo ? null : <PildoraPronto />}
    </Pressable>
  );
}

export function ServicioDestacado({ dato, ancho, onPress }: {
  readonly dato: ServicioDestacadoDelInicio;
  readonly ancho: number;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dato.rotulo}: ${dato.titulo}, ${dato.detalle}${dato.listo ? '' : '. Próximamente'}`}
      accessibilityState={{ disabled: !dato.listo }}
      style={({ pressed }) => [
        estilos.destacado,
        {
          width: ancho,
          borderRadius: 16,
          // El amarillo rebajado como superficie: es lo que la hace destacar
          // sin competir con el botón de pedir.
          backgroundColor: `${tema.color.acento}${pressed ? '4d' : '30'}`,
          borderColor: `${tema.color.acento}80`,
          transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]
        }
      ]}
    >
      <View style={estilos.destacadoRotulo}>
        <Icono nombre="corona" color={tema.color.acentoTexto} tamano={14} />
        <Text style={[estilos.destacadoRotuloTexto, { color: tema.color.acentoTexto }]} numberOfLines={1}>{dato.rotulo}</Text>
      </View>
      <Image source={VEHICULOS.MOTO.tarjeta} resizeMode="contain" style={estilos.destacadoMoto} />
      <View style={{ gap: 2 }}>
        {/* El título va a todo el ancho; el hueco para el botón lo deja sólo
            la línea de detalle, que es la que el botón pisa. */}
        <Txt
          nivel="etiqueta"
          estilo={{ fontWeight: '800', fontSize: 14 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {dato.titulo}
        </Txt>
        <Text
          style={[estilos.detalle, { color: tema.color.textoSecundario, textAlign: 'left', paddingRight: 34 }]}
          numberOfLines={2}
        >
          {dato.detalle}
        </Text>
      </View>
      {/* El sitio del botón: el chevron cuando el servicio existe, y mientras
          no, la píldora de PRONTO. Arriba a la derecha tapaba el rótulo. */}
      {dato.listo ? (
        <View style={[estilos.destacadoBoton, { backgroundColor: tema.color.superficieElevada }]}>
          <Icono nombre="chevron-derecha" color={tema.color.textoPrimario} tamano={14} />
        </View>
      ) : (
        <View style={[estilos.prontoDestacado, { backgroundColor: tema.color.superficieElevada }]}>
          <Text style={[estilos.prontoTexto, { color: tema.color.textoTenue }]}>PRONTO</Text>
        </View>
      )}
    </Pressable>
  );
}

export function RejillaDeServicios({ servicios, destacado, onElegir }: {
  readonly servicios: readonly ServicioDelInicio[];
  readonly destacado: ServicioDestacadoDelInicio;
  readonly onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const { width } = useWindowDimensions();
  const anchoUtil = width - tema.ritmo.margenPantalla * 2;
  const columna = (anchoUtil - HUECO * (COLUMNAS - 1)) / COLUMNAS;

  // Primera fila: cuatro iguales. Segunda: tres un poco más estrechas y la
  // destacada con el resto, como en la referencia.
  const primeraFila = servicios.slice(0, COLUMNAS);
  const segundaFila = servicios.slice(COLUMNAS, COLUMNAS * 2 - 1);
  const anchoEstrecho = Math.floor(columna * 0.86);
  const anchoDestacado = anchoUtil - anchoEstrecho * segundaFila.length - HUECO * segundaFila.length;

  return (
    <View>
      <CabeceraDeSeccion titulo="Nuestros servicios" />
      <View style={{ flexDirection: 'row', gap: HUECO, marginTop: 12 }}>
        {primeraFila.map(dato => (
          <Casilla key={dato.clave} dato={dato} ancho={columna} onPress={() => onElegir(dato.clave)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: HUECO, marginTop: HUECO }}>
        {segundaFila.map(dato => (
          <Casilla key={dato.clave} dato={dato} ancho={anchoEstrecho} onPress={() => onElegir(dato.clave)} />
        ))}
        <ServicioDestacado dato={destacado} ancho={anchoDestacado} onPress={() => onElegir(destacado.clave)} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  casilla: { height: ALTO_DE_CASILLA, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 12, alignItems: 'center', gap: 6 },
  miniatura: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  detalle: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  pronto: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  prontoTexto: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  destacado: { height: ALTO_DE_CASILLA, borderWidth: 1, padding: 12, justifyContent: 'space-between', overflow: 'hidden' },
  destacadoRotulo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  destacadoRotuloTexto: { fontSize: 11, fontWeight: '700' },
  destacadoMoto: { alignSelf: 'flex-end', width: 92, height: 54, marginTop: -6, marginRight: -6 },
  destacadoBoton: { position: 'absolute', right: 10, bottom: 12, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  prontoDestacado: { position: 'absolute', right: 10, bottom: 14, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }
});
