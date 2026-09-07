/**
 * Promociones: tarjetas con fotografía, etiqueta de color, titular y botón.
 *
 * Son MOCK VISUAL, estructurado como lo rellenará el panel administrativo:
 * { id, etiqueta, tonoEtiqueta, titulo, tituloDestacado, detalle, imagen,
 * ajuste, accion }. Las fotografías de la referencia no existen: mientras
 * llegan, cada tarjeta lleva una ilustración de la aplicación sobre grafito.
 *
 * POR QUÉ LAS ILUSTRACIONES CUADRADAS Y NO LOS BANNERS DE PUBLICIDAD
 *
 * Se probó primero con `ARTE_DE_ALIADO`, los banners apaisados. En una
 * tarjeta vertical el recorte se queda con el fondo negro del banner y el arte
 * —pequeño y centrado— desaparece: en pantalla eran tres cajas negras. Las
 * ilustraciones cuadradas (`ARTE_DE_SERVICIO`) llenan el recorte, y la moto
 * real va a `contener` sobre el mismo grafito que el hero. Una fotografía
 * de verdad entra con `ajuste: 'cubrir'` y se acabó.
 *
 * El texto va sobre un velo oscuro, con `sobreImagen`: igual de día que de
 * noche, porque debajo hay una imagen y no una superficie del tema.
 */

import { useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useEsquema, useTema } from '../theme/ThemeContext';
import { ARTE_DE_SERVICIO, VEHICULOS } from '../theme/marca';
import { LIENZO_DE_IMAGEN } from '../theme/primitives';
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
  /** `cubrir` para una fotografía; `contener` para una ilustración recortada. */
  readonly ajuste?: 'cubrir' | 'contener';
  readonly accion: string;
}

export const PROMOCIONES_MOCK: readonly Promocion[] = Object.freeze([
  {
    id: 'promo-comida',
    etiqueta: 'HASTA 30% OFF',
    tonoEtiqueta: 'acento',
    titulo: 'Tu comida favorita más cerca',
    detalle: 'Con +58Express',
    imagen: ARTE_DE_SERVICIO['servicio-comida'],
    accion: 'comercios'
  },
  {
    id: 'promo-viaje',
    etiqueta: 'VIAJA SEGURO',
    tonoEtiqueta: 'exito',
    titulo: 'Primer viaje con',
    tituloDestacado: '20% OFF',
    detalle: 'Usa el código: HOLA58',
    imagen: VEHICULOS.MOTO.tarjeta,
    ajuste: 'contener',
    accion: 'pedir'
  },
  {
    id: 'promo-mercado',
    etiqueta: 'TU MERCADO EN MINUTOS',
    tonoEtiqueta: 'acento',
    titulo: 'Frescura a tu puerta',
    detalle: 'Ahorra tiempo, vive más',
    imagen: ARTE_DE_SERVICIO['servicio-mercado'],
    accion: 'comercios'
  }
]);

const ANCHO = 152;
const ALTO = 190;
const HUECO = 10;
/** El velo sobre la foto, en dos capas. Igual de día que de noche. */
// El grafito y el velo son los de `LIENZO_DE_IMAGEN`: un solo sitio, el
// mismo que usa el hero, y el que la custodia mide.
const LIENZO = LIENZO_DE_IMAGEN;

export function PromocionesDelInicio({ promociones = PROMOCIONES_MOCK, onAbrir, onVerTodas }: {
  readonly promociones?: readonly Promocion[];
  readonly onAbrir: (promocion: Promocion) => void;
  readonly onVerTodas: () => void;
}) {
  const tema = useTema();
  const esquema = useEsquema();
  const quieto = useMovimientoReducido();
  const [indice, setIndice] = useState(0);
  // Un punto por tarjeta, y el índice sale del mismo paso que el snap: antes
  // los puntos contaban «pantallas» y el desplazamiento nunca llegaba a la
  // última, así que el segundo punto no se encendía jamás.
  const paginas = promociones.length;

  if (promociones.length === 0) return null;

  return (
    <View>
      <CabeceraDeSeccion titulo="Promociones" accion="Ver todas" onAccion={onVerTodas} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ANCHO + HUECO}
        decelerationRate="fast"
        onMomentumScrollEnd={e => setIndice(Math.max(0, Math.min(
          paginas - 1,
          Math.round(e.nativeEvent.contentOffset.x / (ANCHO + HUECO))
        )))}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: HUECO }}
      >
        {promociones.map(promo => {
          const fondoEtiqueta = promo.tonoEtiqueta === 'exito' ? tema.color.exito : tema.color.acento;
          // El verde de éxito es oscuro de día y claro de noche (ver `esquemas.ts`):
          // encima va tinta clara o tinta oscura según el esquema. Medido en la
          // custodia, como el resto.
          const tintaDeExito = esquema === 'claro' ? tema.color.sobreImagen : tema.color.sobreAcento;
          const tintaEtiqueta = promo.tonoEtiqueta === 'exito' ? tintaDeExito : tema.color.sobreAcento;
          return (
            <Pressable
              key={promo.id}
              accessibilityRole="button"
              accessibilityLabel={`${promo.etiqueta}. ${promo.titulo} ${promo.tituloDestacado ?? ''}. ${promo.detalle}`}
              onPress={() => onAbrir(promo)}
              style={({ pressed }) => [
                estilos.tarjeta,
                {
                  borderRadius: tema.radio.tarjeta,
                  backgroundColor: LIENZO.fondo,
                  opacity: pressed ? 0.94 : 1,
                  transform: [{ scale: pressed && !quieto ? 0.985 : 1 }]
                }
              ]}
            >
              {promo.imagen !== undefined ? (
                promo.ajuste === 'contener' ? (
                  // La ilustración entera, en la mitad de arriba, dejando la
                  // franja del texto libre.
                  <Image
                    source={promo.imagen}
                    resizeMode="contain"
                    // Ancho explícito: con `left`/`right` y sin `width`, Android
                    // no pintaba la imagen.
                    style={{ position: 'absolute', top: 34, left: 6, width: ANCHO - 12, height: ALTO * 0.48 }}
                  />
                ) : (
                  // Ancho y alto explícitos por lo mismo que en el hero: sin
                  // ellos la foto se pinta a su tamaño y sale recortada.
                  <Image
                    source={promo.imagen}
                    resizeMode="cover"
                    style={{ position: 'absolute', top: 0, left: 0, width: ANCHO, height: ALTO }}
                  />
                )
              ) : null}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: LIENZO.veloAlto }]} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', backgroundColor: LIENZO.veloBajo }} />

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
          {promociones.map((_, i) => (
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
