/**
 * Carrusel promocional con auto-slide para el Home Comercial de Pasajero.
 *
 * ESTRUCTURA PREPARADA PARA ADMIN
 *
 * Los banners están definidos con un contrato de datos desacoplado { id, title,
 * subtitle, image, ctaLabel, ctaAction, active, tag } para que posteriormente
 * el Panel Administrativo pueda inyectar promociones dinámicas.
 *
 * EL COLOR DEL BANNER ES UNA SUPERFICIE, NO UNA TINTA
 *
 * `colorAcento` viene con el banner y sirve para el resplandor, el filo, el
 * fondo de la etiqueta y el del botón. Como TEXTO no siempre vale: los tres
 * amarillos de la lista sobre el marfil del día rondan el 1,3:1 —el mismo
 * cálculo que ya trae `theme/esquemas.ts`— y la etiqueta se volvía un fantasma.
 * Por eso en día la etiqueta se escribe con `acentoTexto`, el ámbar legible, y
 * en noche sigue con el color propio del banner. El botón no cambia: ahí el
 * amarillo es fondo y lleva tinta oscura encima, que es su papel correcto.
 *
 * El titular y el subtítulo estaban fijados en blanco y gris de noche, y en día
 * el titular desaparecía por completo mientras el subtítulo aguantaba. Ahora los
 * dos salen del tema.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { useEsquema, useTema } from '../theme/ThemeContext';
import { useMovimientoReducido } from './movimiento';

export interface BannerItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly image?: any;
  readonly ctaLabel?: string;
  readonly ctaAction?: string;
  readonly active: boolean;
  readonly tag?: string;
  readonly colorAcento?: string;
}

export const BANNERS_MOCK: readonly BannerItem[] = Object.freeze([
  {
    id: 'promo-1',
    title: '20% de descuento',
    subtitle: 'En tu próximo viaje en moto o auto. Válido esta semana.',
    tag: 'EXCLUSIVO',
    ctaLabel: 'Pedir ahora',
    ctaAction: 'pedir',
    active: true,
    colorAcento: '#FFD700'
  },
  {
    id: 'promo-2',
    title: 'Delivery gratis',
    subtitle: 'En comercios aliados seleccionados al pagar con +58Express.',
    tag: 'FIN DE SEMANA',
    ctaLabel: 'Ver aliados',
    ctaAction: 'comercios',
    active: true,
    colorAcento: '#FFC72C'
  },
  {
    id: 'promo-3',
    title: 'Comercios aliados',
    subtitle: 'Acumula saldo y beneficios comprando cerca de ti en Maracaibo.',
    tag: 'COMUNIDAD',
    ctaLabel: 'Explorar',
    ctaAction: 'comercios',
    active: true,
    colorAcento: '#FFE066'
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
  intervaloMs = 5500
}: PropiedadesPromoCarousel) {
  const tema = useTema();
  const esquema = useEsquema();
  const quieto = useMovimientoReducido();
  const scrollRef = useRef<ScrollView>(null);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const interactuandoRef = useRef(false);
  const anchoPantalla = Dimensions.get('window').width;
  const anchoTarjeta = Math.min(anchoPantalla - tema.ritmo.margenPantalla * 2, 380);

  const bannersActivos = banners.filter(b => b.active);
  const total = bannersActivos.length;

  const irAlSiguiente = useCallback(() => {
    if (interactuandoRef.current || total <= 1 || quieto) return;
    setIndiceActivo(prev => {
      const siguiente = (prev + 1) % total;
      scrollRef.current?.scrollTo({
        x: siguiente * (anchoTarjeta + 12),
        animated: true
      });
      return siguiente;
    });
  }, [total, quieto, anchoTarjeta]);

  useEffect(() => {
    if (total <= 1 || quieto) return;
    const temporizador = setInterval(irAlSiguiente, intervaloMs);
    return () => clearInterval(temporizador);
  }, [irAlSiguiente, intervaloMs, total, quieto]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const indice = Math.round(offsetX / (anchoTarjeta + 12));
    setIndiceActivo(Math.max(0, Math.min(indice, total - 1)));
    interactuandoRef.current = false;
  };

  if (total === 0) return null;

  return (
    <View style={estilos.contenedor}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={anchoTarjeta + 12}
        decelerationRate="fast"
        onTouchStart={() => { interactuandoRef.current = true; }}
        onTouchEnd={() => {
          setTimeout(() => { interactuandoRef.current = false; }, 2000);
        }}
        onScrollBeginDrag={() => { interactuandoRef.current = true; }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          gap: 12
        }}
      >
        {bannersActivos.map(banner => {
          const colorMarca = banner.colorAcento ?? tema.color.acento;
          // El mismo amarillo no puede ser superficie y tinta en día: aquí sólo
          // se decide con qué se ESCRIBE la etiqueta.
          const tintaDeMarca = esquema === 'claro' ? tema.color.acentoTexto : colorMarca;
          return (
            <Pressable
              key={banner.id}
              accessibilityRole="button"
              accessibilityLabel={`${banner.title}. ${banner.subtitle}`}
              onPress={() => onSeleccionarBanner?.(banner)}
              style={({ pressed }) => [
                estilos.tarjeta,
                {
                  width: anchoTarjeta,
                  backgroundColor: tema.color.superficieElevada,
                  borderColor: `${colorMarca}44`,
                  opacity: pressed ? 0.92 : 1,
                  transform: [{ scale: pressed && !quieto ? 0.985 : 1 }]
                }
              ]}
            >
              {/* Resplandor superior sutil */}
              <View
                pointerEvents="none"
                style={[
                  estilos.resplandor,
                  { backgroundColor: `${colorMarca}18` }
                ]}
              />

              {/* Tag superior */}
              {banner.tag ? (
                <View style={[estilos.tagPill, { borderColor: `${colorMarca}55`, backgroundColor: `${colorMarca}1c` }]}>
                  <Text style={[estilos.tagTexto, { color: tintaDeMarca }]}>
                    {banner.tag}
                  </Text>
                </View>
              ) : null}

              {/* Textos */}
              <View style={estilos.cuerpoTexto}>
                <Text style={[estilos.titulo, { color: tema.color.textoPrimario }]} numberOfLines={1}>
                  {banner.title}
                </Text>
                <Text style={[estilos.subtitulo, { color: tema.color.textoSecundario }]} numberOfLines={2}>
                  {banner.subtitle}
                </Text>
              </View>

              {/* Boton de accion / CTA */}
              {banner.ctaLabel ? (
                <View style={estilos.filaAccion}>
                  <View style={[estilos.botonCta, { backgroundColor: colorMarca }]}>
                    <Text style={[estilos.botonCtaTexto, { color: tema.color.sobreAcento }]}>{banner.ctaLabel}</Text>
                    <Text style={[estilos.botonCtaFlecha, { color: tema.color.sobreAcento }]}>→</Text>
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Indicador de puntos (dots) */}
      {total > 1 ? (
        <View style={estilos.dotsContenedor}>
          {bannersActivos.map((_, i) => (
            <View
              key={i}
              style={[
                estilos.dot,
                {
                  // El punto apagado era blanco al 20%: sobre marfil no se veía.
                  backgroundColor: i === indiceActivo ? tema.color.acento : tema.color.borde,
                  width: i === indiceActivo ? 18 : 6
                }
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginVertical: 12
  },
  tarjeta: {
    height: 146,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.2,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative'
  },
  resplandor: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60
  },
  tagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  tagTexto: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  cuerpoTexto: {
    gap: 4
  },
  // Sin `color`: lo pone el tema en el punto de uso.
  titulo: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  subtitulo: {
    fontSize: 12.5,
    lineHeight: 17
  },
  filaAccion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  botonCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  // Tinta oscura sobre el amarillo: la pone `sobreAcento`, que es el token que
  // significa exactamente eso.
  botonCtaTexto: {
    fontSize: 12,
    fontWeight: '800'
  },
  botonCtaFlecha: {
    fontSize: 12,
    fontWeight: '800'
  },
  dotsContenedor: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10
  },
  dot: {
    height: 5,
    borderRadius: 2.5
  }
});
