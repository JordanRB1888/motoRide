/**
 * Promociones: tarjetas con fotografía, etiqueta de color, titular y botón.
 *
 * Son MOCK VISUAL, estructurado como lo rellenará el panel administrativo:
 * { id, etiqueta, tonoEtiqueta, titulo, tituloDestacado, detalle, imagen,
 * accion }. Las fotografías de la referencia no existen: se usan los artes de
 * publicidad que ya hay —compuestos con las ilustraciones de la aplicación—,
 * y cada uno se sustituye cambiando `imagen`.
 *
 * El texto va sobre un velo oscuro, con `sobreImagen`: igual de día que de
 * noche, porque debajo hay una imagen y no una superficie del tema.
 */

import { useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_ALIADO } from '../theme/marca';
import { CabeceraDeSeccion } from './CabeceraDeSeccion';
import { Icono } from './Icono';
import { useMovimientoReducido } from './movimiento';

export interface Promocion {
  readonly id: string;
  readonly etiqueta: string;
  readonly tonoEtiqueta: 'acento' | 'exito';
  readonly titulo: string;
  readonly tituloDestacado?: string;
  readonly detalle: string;
  readonly imagen?: ImageSourcePropType;
  readonly accion: string;
}

export const PROMOCIONES_MOCK: readonly Promocion[] = Object.freeze([
  {
    id: 'promo-comida',
    etiqueta: 'HASTA 30% OFF',
    tonoEtiqueta: 'acento',
    titulo: 'Tu comida favorita más cerca',
    detalle: 'Con +58Express',
    imagen: ARTE_DE_ALIADO['aliado-comida'],
    accion: 'comercios'
  },
  {
    id: 'promo-viaje',
    etiqueta: 'VIAJA SEGURO',
    tonoEtiqueta: 'exito',
    titulo: 'Primer viaje con',
    tituloDestacado: '20% OFF',
    detalle: 'Usa el código: HOLA58',
    imagen: ARTE_DE_ALIADO['aliado-moto'],
    accion: 'pedir'
  },
  {
    id: 'promo-mercado',
    etiqueta: 'TU MERCADO EN MINUTOS',
    tonoEtiqueta: 'acento',
    titulo: 'Frescura a tu puerta',
    detalle: 'Ahorra tiempo, vive más',
    imagen: ARTE_DE_ALIADO['aliado-mercado'],
    accion: 'comercios'
  }
]);

const ANCHO = 152;
const ALTO = 190;
const HUECO = 10;
/** El velo sobre la foto, en dos capas. Igual de día que de noche. */
const VELO = Object.freeze({ alto: 'rgba(11, 10, 9, 0.16)', bajo: 'rgba(11, 10, 9, 0.66)' });

export function PromocionesDelInicio({ promociones = PROMOCIONES_MOCK, onAbrir, onVerTodas }: {
  readonly promociones?: readonly Promocion[];
  readonly onAbrir: (promocion: Promocion) => void;
  readonly onVerTodas: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);
  // Caben dos y media: el número de puntos es el de «pantallas» de tarjetas.
  const visibles = Math.max(1, Math.floor((width - tema.ritmo.margenPantalla * 2) / (ANCHO + HUECO)));
  const paginas = Math.max(1, Math.ceil(promociones.length / visibles));

  if (promociones.length === 0) return null;

  return (
    <View>
      <CabeceraDeSeccion titulo="Promociones" accion="Ver todas" onAccion={onVerTodas} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ANCHO + HUECO}
        decelerationRate="fast"
        onMomentumScrollEnd={e => setIndice(Math.min(
          paginas - 1,
          Math.round(e.nativeEvent.contentOffset.x / ((ANCHO + HUECO) * visibles))
        ))}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: HUECO }}
      >
        {promociones.map(promo => {
          const fondoEtiqueta = promo.tonoEtiqueta === 'exito' ? tema.color.exito : tema.color.acento;
          const tintaEtiqueta = promo.tonoEtiqueta === 'exito' ? tema.color.sobreImagen : tema.color.sobreAcento;
          return (
            <Pressable
              key={promo.id}
              accessibilityRole="button"
              accessibilityLabel={`${promo.etiqueta}. ${promo.titulo} ${promo.tituloDestacado ?? ''}. ${promo.detalle}`}
              onPress={() => onAbrir(promo)}
              style={({ pressed }) => [
                estilos.tarjeta,
                {
                  borderRadius: 16,
                  backgroundColor: tema.color.superficieHundida,
                  opacity: pressed ? 0.94 : 1,
                  transform: [{ scale: pressed && !quieto ? 0.985 : 1 }]
                }
              ]}
            >
              {promo.imagen !== undefined ? <Image source={promo.imagen} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: VELO.alto }]} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%', backgroundColor: VELO.bajo }} />

              <View style={[estilos.etiqueta, { backgroundColor: fondoEtiqueta }]}>
                <Text style={[estilos.etiquetaTexto, { color: tintaEtiqueta }]} numberOfLines={2}>{promo.etiqueta}</Text>
              </View>

              <View style={estilos.cuerpo}>
                <Text style={[estilos.titulo, { color: tema.color.sobreImagen }]} numberOfLines={3}>
                  {promo.titulo}
                  {promo.tituloDestacado ? <Text style={{ color: tema.color.acentoSobreImagen }}>{' '}{promo.tituloDestacado}</Text> : null}
                </Text>
                <Text style={[estilos.detalle, { color: tema.color.sobreImagen }]} numberOfLines={2}>{promo.detalle}</Text>
              </View>

              <View style={[estilos.boton, { backgroundColor: tema.color.superficieElevada }]}>
                <Icono nombre="chevron-derecha" color={tema.color.textoPrimario} tamano={14} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {paginas > 1 ? (
        <View style={estilos.puntos} accessibilityElementsHidden importantForAccessibility="no">
          {Array.from({ length: paginas }, (_, i) => (
            <View
              key={i}
              style={{
                width: i === indice ? 10 : 8,
                height: i === indice ? 10 : 8,
                borderRadius: 5,
                backgroundColor: i === indice ? tema.color.acento : tema.color.borde
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { width: ANCHO, height: ALTO, overflow: 'hidden', padding: 12, justifyContent: 'flex-end' },
  etiqueta: { position: 'absolute', top: 12, left: 12, maxWidth: ANCHO - 24, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9 },
  etiquetaTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  cuerpo: { gap: 3, paddingRight: 30 },
  titulo: { fontSize: 15, lineHeight: 18, fontWeight: '800', letterSpacing: -0.3 },
  detalle: { fontSize: 11, lineHeight: 14, opacity: 0.9 },
  boton: { position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  puntos: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 }
});
