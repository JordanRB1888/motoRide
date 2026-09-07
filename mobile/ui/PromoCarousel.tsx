/**
 * El hero del inicio: una pieza publicitaria grande que domina la pantalla.
 *
 * DOS DUEÑOS DEL MISMO HUECO
 *
 * Un banner puede ser +58express contando algo suyo —se compone con los
 * tokens: titular con una palabra en amarillo, línea de apoyo, botón— o el
 * arte que entrega un anunciante con su texto dentro (`soloImagen`), que la
 * aplicación sólo enmarca. El contrato { id, title, tituloDestacado, subtitle,
 * imagen, ctaLabel, ctaAction, tag, active } es el que el panel administrativo
 * podrá rellenar.
 *
 * SIN FOTOGRAFÍA, LA MOTO REAL
 *
 * La referencia lleva la foto de un motorizado con su caja +58. Mientras no
 * exista, la composición de marca pone la moto amarilla real sobre grafito: es
 * un activo aprobado, no un pictograma «mientras tanto». Cuando llegue la foto,
 * va en `imagen` y esta composición deja de pintarse sola.
 *
 * EL TEXTO SOBRE LA FOTO NO SABE DE ESQUEMAS
 *
 * Va con `sobreImagen`, que es igual de día que de noche porque lo que hay
 * debajo es un velo oscuro sobre una imagen, no una superficie del tema. El
 * velo se dibuja con vistas —no hay degradados sin biblioteca— en dos capas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_CAMPANA, VEHICULOS } from '../theme/marca';
import { LIENZO_DE_IMAGEN } from '../theme/primitives';
import { useMovimientoReducido } from './movimiento';

export interface BannerItem {
  readonly id: string;
  readonly title: string;
  /** La parte del titular que va en amarillo. Va DESPUÉS de `title`. */
  readonly tituloDestacado?: string;
  readonly subtitle: string;
  readonly imagen?: ImageSourcePropType;
  /** El arte trae su propio texto: se enmarca y no se escribe nada encima. */
  readonly soloImagen?: boolean;
  readonly ctaLabel?: string;
  readonly ctaAction?: string;
  readonly active: boolean;
  /** El rótulo manuscrito de arriba a la derecha. */
  readonly tag?: string;
}

// El grafito y el velo son los de `LIENZO_DE_IMAGEN`: un solo sitio para el
// hero y las promociones, y el que la custodia mide.
const LIENZO = LIENZO_DE_IMAGEN;

const ALTO_DEL_HERO = 228;

export const BANNERS_MOCK: readonly BannerItem[] = Object.freeze([
  {
    id: 'hero-ciudad',
    title: 'Más que un destino,',
    tituloDestacado: 'es tu ciudad',
    subtitle: 'Movilidad, entregas y más, en una sola app.',
    ctaLabel: 'Descubre +58Express',
    ctaAction: 'pedir',
    tag: 'Venezuela se mueve contigo',
    active: true
  },
  {
    id: 'hero-repuestos',
    title: 'Repuestos y accesorios',
    subtitle: 'Moter Repuestos UM',
    imagen: ARTE_DE_CAMPANA['campana-repuestos'],
    soloImagen: true,
    ctaAction: 'comercios',
    active: true
  },
  {
    id: 'hero-aviso',
    title: 'Espacio de aviso',
    subtitle: 'Para lo que +58express necesite contar ese día.',
    imagen: ARTE_DE_CAMPANA['campana-aviso'],
    soloImagen: true,
    ctaAction: 'comercios',
    active: true
  }
]);

interface PropiedadesPromoCarousel {
  readonly banners?: readonly BannerItem[];
  readonly onSeleccionarBanner?: (banner: BannerItem) => void;
  readonly intervaloMs?: number;
}

export function PromoCarousel({
  banners = BANNERS_MOCK,
  onSeleccionarBanner,
  intervaloMs = 6000
}: PropiedadesPromoCarousel) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const { width: anchoPantalla } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const interactuandoRef = useRef(false);
  const reanudarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchoTarjeta = anchoPantalla - tema.ritmo.margenPantalla * 2;
  // Dos márgenes de hueco: la siguiente tarjeta empieza justo en el borde de
  // la pantalla y no asoma, y cada paso del carrusel mide exactamente el
  // ancho de la pantalla, como en la referencia.
  const HUECO = tema.ritmo.margenPantalla * 2;

  const bannersActivos = banners.filter(b => b.active);
  const total = bannersActivos.length;

  const irAlSiguiente = useCallback(() => {
    if (interactuandoRef.current || total <= 1 || quieto) return;
    setIndiceActivo(prev => {
      const siguiente = (prev + 1) % total;
      scrollRef.current?.scrollTo({ x: siguiente * (anchoTarjeta + HUECO), animated: true });
      return siguiente;
    });
  }, [total, quieto, anchoTarjeta, HUECO]);

  useEffect(() => {
    if (total <= 1 || quieto) return;
    const temporizador = setInterval(irAlSiguiente, intervaloMs);
    return () => clearInterval(temporizador);
  }, [irAlSiguiente, intervaloMs, total, quieto]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const indice = Math.round(e.nativeEvent.contentOffset.x / (anchoTarjeta + HUECO));
    setIndiceActivo(Math.max(0, Math.min(indice, total - 1)));
    interactuandoRef.current = false;
  };

  // Un arrastre que se suelta quieto no produce inercia y `onMomentumScrollEnd`
  // no llega nunca: sin esto el carrusel se quedaba parado el resto de la
  // sesión. Se reanuda solo, con un respiro para no arrancar bajo el dedo.
  const onScrollEndDrag = () => {
    if (reanudarRef.current !== null) clearTimeout(reanudarRef.current);
    reanudarRef.current = setTimeout(() => { interactuandoRef.current = false; }, 1500);
  };
  useEffect(() => () => {
    if (reanudarRef.current !== null) clearTimeout(reanudarRef.current);
  }, []);

  if (total === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={anchoTarjeta + HUECO}
        decelerationRate="fast"
        onScrollBeginDrag={() => { interactuandoRef.current = true; }}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: HUECO }}
      >
        {bannersActivos.map(banner => (
          <Pressable
            key={banner.id}
            accessibilityRole="button"
            accessibilityLabel={`${banner.title} ${banner.tituloDestacado ?? ''}. ${banner.subtitle}`}
            onPress={() => onSeleccionarBanner?.(banner)}
            style={({ pressed }) => [
              estilos.tarjeta,
              {
                width: anchoTarjeta,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: LIENZO.fondo,
                opacity: pressed ? 0.94 : 1,
                transform: [{ scale: pressed && !quieto ? 0.99 : 1 }]
              }
            ]}
          >
            {banner.imagen !== undefined ? (
              // Ancho y alto EXPLÍCITOS. Con sólo `absoluteFill`, Android da a
              // la imagen su tamaño intrínseco y luego la recorta: el arte se
              // veía ampliado al doble y cortado por la derecha.
              <Image
                source={banner.imagen}
                resizeMode="cover"
                style={{ position: 'absolute', top: 0, left: 0, width: anchoTarjeta, height: ALTO_DEL_HERO }}
              />
            ) : (
              // La composición de marca: la moto real, grande, a la derecha.
              <Image
                source={VEHICULOS.MOTO.tarjeta}
                resizeMode="contain"
                style={{
                  position: 'absolute',
                  right: -anchoTarjeta * 0.08,
                  bottom: 6,
                  width: anchoTarjeta * 0.66,
                  height: ALTO_DEL_HERO * 0.78
                }}
              />
            )}

            {banner.soloImagen ? null : (
              <>
                {/* El velo, en dos capas: clara arriba, densa abajo. Es lo que
                    hace legible el texto sin apagar la imagen entera. */}
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: LIENZO.veloAlto }]} />
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', backgroundColor: LIENZO.veloBajo }}
                />

                {banner.tag ? (
                  <View style={estilos.rotulo}>
                    <Text style={[estilos.rotuloTexto, { color: tema.color.sobreImagen }]}>{banner.tag}</Text>
                    <View style={{ height: 2, borderRadius: 1, backgroundColor: tema.color.acento, marginTop: 2, width: '70%', alignSelf: 'flex-end' }} />
                  </View>
                ) : null}

                <View style={estilos.cuerpo}>
                  <Text style={[estilos.titular, { color: tema.color.sobreImagen }]} numberOfLines={2}>
                    {banner.title}
                    {banner.tituloDestacado ? <Text style={{ color: tema.color.acentoSobreImagen }}>{' '}{banner.tituloDestacado}</Text> : null}
                  </Text>
                  <Text style={[estilos.apoyo, { color: tema.color.sobreImagen }]} numberOfLines={2}>{banner.subtitle}</Text>
                  {banner.ctaLabel ? (
                    <View style={[estilos.cta, { backgroundColor: tema.color.acento, borderRadius: tema.radio.boton }]}>
                      <Text style={[estilos.ctaTexto, { color: tema.color.sobreAcento }]}>{banner.ctaLabel}</Text>
                      <Text style={[estilos.ctaTexto, { color: tema.color.sobreAcento }]}>→</Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {total > 1 ? (
        <View style={estilos.puntos} accessibilityElementsHidden importantForAccessibility="no">
          {bannersActivos.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === indiceActivo ? 10 : 8,
                height: i === indiceActivo ? 10 : 8,
                borderRadius: 5,
                backgroundColor: i === indiceActivo ? tema.color.acento : tema.color.borde
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { height: ALTO_DEL_HERO, overflow: 'hidden', justifyContent: 'flex-end' },
  rotulo: { position: 'absolute', top: 16, right: 18, alignItems: 'flex-end', transform: [{ rotate: '-6deg' }] },
  rotuloTexto: { fontSize: 13, fontStyle: 'italic', fontWeight: '700', letterSpacing: 0.2 },
  cuerpo: { padding: 18, gap: 6, maxWidth: '68%' },
  titular: { fontSize: 24, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6 },
  apoyo: { fontSize: 12.5, lineHeight: 17, opacity: 0.92 },
  cta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 36, paddingHorizontal: 14, marginTop: 6 },
  ctaTexto: { fontSize: 13, fontWeight: '800' },
  puntos: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 }
});
