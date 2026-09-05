/**
 * Superficie comercial principal del Home de Pasajero.
 *
 * Reemplaza el mapa de fondo por una experiencia comercial de alta gama:
 *   1. Carrusel promocional con auto-slide y dots interactivos.
 *   2. Aliados comerciales de Maracaibo en formato horizontal compacto.
 *   3. Bloque ligero de promociones y beneficios +58Express.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { PromoCarousel, type BannerItem } from './PromoCarousel';
import { CommercialPartners, type CommercialPartner } from './CommercialPartners';

interface PropiedadesPassengerHomeCommercial {
  readonly onSeleccionarBanner?: (banner: BannerItem) => void;
  readonly onSeleccionarAliado?: (aliado: CommercialPartner) => void;
  readonly onVerAliados?: () => void;
  readonly onPedirViaje?: () => void;
}

export function PassengerHomeCommercial({
  onSeleccionarBanner,
  onSeleccionarAliado,
  onVerAliados,
  onPedirViaje
}: PropiedadesPassengerHomeCommercial) {
  const tema = useTema();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.scrollContenido}
    >
      {/* 1. Carrusel Promocional con Auto-slide */}
      <PromoCarousel
        onSeleccionarBanner={banner => {
          if (banner.ctaAction === 'pedir') onPedirViaje?.();
          else if (banner.ctaAction === 'comercios') onVerAliados?.();
          else onSeleccionarBanner?.(banner);
        }}
      />

      {/* 2. Aliados Comerciales de Maracaibo */}
      <CommercialPartners
        onSeleccionarAliado={onSeleccionarAliado}
        onVerTodos={onVerAliados}
      />

      {/* 3. Bloque comercial ligero: Promociones para ti */}
      <View style={[estilos.seccionPromos, { paddingHorizontal: tema.ritmo.margenPantalla }]}>
        <View style={estilos.cabeceraSeccion}>
          <Text style={estilos.tituloSeccion}>Promociones para ti</Text>
          <Text style={estilos.subtituloSeccion}>Aprovecha hoy en Maracaibo</Text>
        </View>

        <View style={estilos.columnaPromos}>
          {/* Card Promo 1: Saldo */}
          <View style={[estilos.promoCard, { backgroundColor: tema.color.superficie, borderColor: tema.color.borde }]}>
            <View style={[estilos.iconoPromo, { backgroundColor: `${tema.color.acento}18` }]}>
              <Text style={[estilos.iconoPromoTexto, { color: tema.color.acento }]}>$</Text>
            </View>
            <View style={estilos.cuerpoPromo}>
              <Text style={estilos.promoTitulo}>Recarga tu saldo sin comisiones</Text>
              <Text style={estilos.promoDetalle}>Pago móvil instantáneo con acreditación al segundo.</Text>
            </View>
          </View>

          {/* Card Promo 2: Seguridad */}
          <View style={[estilos.promoCard, { backgroundColor: tema.color.superficie, borderColor: tema.color.borde }]}>
            <View style={[estilos.iconoPromo, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}>
              <Text style={estilos.iconoPromoTexto}>🛡</Text>
            </View>
            <View style={estilos.cuerpoPromo}>
              <Text style={estilos.promoTitulo}>Conductores verificados 24/7</Text>
              <Text style={estilos.promoDetalle}>Documentación auditada y monitoreo en tiempo real.</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  scrollContenido: {
    paddingBottom: 120
  },
  seccionPromos: {
    marginTop: 10,
    marginBottom: 16
  },
  cabeceraSeccion: {
    gap: 2,
    marginBottom: 10
  },
  tituloSeccion: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2
  },
  subtituloSeccion: {
    fontSize: 12,
    color: '#8E8E93'
  },
  columnaPromos: {
    gap: 10
  },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.2,
    gap: 12
  },
  iconoPromo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconoPromoTexto: {
    fontSize: 18,
    fontWeight: '800'
  },
  cuerpoPromo: {
    flex: 1,
    gap: 2
  },
  promoTitulo: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2
  },
  promoDetalle: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#8E8E93'
  }
});
