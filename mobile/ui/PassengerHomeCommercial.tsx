/**
 * La superficie comercial del inicio de la pasajera, en el orden de la
 * referencia del dueño: bloque utilitario (lo trae la pantalla), hero,
 * aliados, promociones y servicios. Todo desliza; sólo la top bar queda fija.
 *
 * La tinta de todo lo que se escribe aquí sale del tema. Ver la nota de
 * `inicioPasajera.test.mjs`: esta superficie nació dibujada sobre grafito y en
 * el modo día sus títulos desaparecían.
 */

import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { PromoCarousel, type BannerItem } from './PromoCarousel';
import { CommercialPartners, type CommercialPartner } from './CommercialPartners';
import { PromocionesDelInicio, type Promocion } from './PromocionesDelInicio';
import { RejillaDeServicios, type ServicioDelInicio, type ServicioDestacadoDelInicio } from './RejillaDeServicios';

interface PropiedadesPassengerHomeCommercial {
  /** Saldo, ubicación, buscador y accesos rápidos. Los monta la pantalla. */
  readonly encabezado?: ReactNode;
  readonly servicios: readonly ServicioDelInicio[];
  readonly destacado: ServicioDestacadoDelInicio;
  readonly onPedirViaje: () => void;
  readonly onVerAliados: () => void;
  readonly onSeleccionarAliado?: (aliado: CommercialPartner) => void;
  readonly onAbrirPromocion: (promocion: Promocion) => void;
  readonly onVerPromociones: () => void;
  readonly onElegirServicio: (clave: string) => void;
  readonly onSeleccionarBanner?: (banner: BannerItem) => void;
}

export function PassengerHomeCommercial({
  encabezado,
  servicios,
  destacado,
  onPedirViaje,
  onVerAliados,
  onSeleccionarAliado,
  onAbrirPromocion,
  onVerPromociones,
  onElegirServicio,
  onSeleccionarBanner
}: PropiedadesPassengerHomeCommercial) {
  const tema = useTema();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingTop: 4,
        // La barra de abajo y su área segura.
        paddingBottom: 132,
        gap: tema.ritmo.entreBloques
      }}
    >
      {encabezado}

      <PromoCarousel
        onSeleccionarBanner={banner => {
          if (banner.ctaAction === 'pedir') onPedirViaje();
          else if (banner.ctaAction === 'comercios') onVerAliados();
          else onSeleccionarBanner?.(banner);
        }}
      />

      <CommercialPartners onSeleccionarAliado={onSeleccionarAliado} onVerTodos={onVerAliados} />

      <PromocionesDelInicio onAbrir={onAbrirPromocion} onVerTodas={onVerPromociones} />

      <RejillaDeServicios servicios={servicios} destacado={destacado} onElegir={onElegirServicio} />

      <View style={{ height: 4 }} />
    </ScrollView>
  );
}
