/**
 * Aliados comerciales locales para el Home Comercial de Pasajero.
 *
 * Muestra comercios asociados a +58Express con sus beneficios exclusivos.
 * Estructurado para poblarse desde el Panel de Administración en el futuro.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { useMovimientoReducido } from './movimiento';

export interface CommercialPartner {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly benefit: string;
  readonly rating?: string;
  readonly iconLetter?: string;
}

export const ALIADOS_MOCK: readonly CommercialPartner[] = Object.freeze([
  {
    id: 'aliado-1',
    name: 'Arepas Santa Rita',
    category: 'Restaurante',
    benefit: '15% con +58Express',
    rating: '4.9',
    iconLetter: 'AS'
  },
  {
    id: 'aliado-2',
    name: 'Farmatodo Delicias',
    category: 'Farmacia & Salud',
    benefit: 'Envio prioritario gratis',
    rating: '4.8',
    iconLetter: 'FD'
  },
  {
    id: 'aliado-3',
    name: 'De Candido Express',
    category: 'Supermercado',
    benefit: '10% en compras',
    rating: '4.7',
    iconLetter: 'DC'
  },
  {
    id: 'aliado-4',
    name: 'La Suiza Bella Vista',
    category: 'Panaderia & Cafe',
    benefit: 'Cafe de cortesia',
    rating: '4.9',
    iconLetter: 'LS'
  },
  {
    id: 'aliado-5',
    name: 'MotoRepuestos 58',
    category: 'Motos & Repuestos',
    benefit: '12% de descuento',
    rating: '4.9',
    iconLetter: 'MR'
  }
]);

interface PropiedadesCommercialPartners {
  readonly aliados?: readonly CommercialPartner[];
  readonly onSeleccionarAliado?: (aliado: CommercialPartner) => void;
  readonly onVerTodos?: () => void;
}

export function CommercialPartners({
  aliados = ALIADOS_MOCK,
  onSeleccionarAliado,
  onVerTodos
}: PropiedadesCommercialPartners) {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  if (aliados.length === 0) return null;

  return (
    <View style={estilos.contenedor}>
      {/* Cabecera de la seccion */}
      <View style={[estilos.cabecera, { paddingHorizontal: tema.ritmo.margenPantalla }]}>
        <View style={estilos.titulos}>
          <Text style={estilos.tituloSeccion}>Aliados comerciales</Text>
          <Text style={estilos.subtituloSeccion}>Beneficios en Maracaibo</Text>
        </View>
        {onVerTodos ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todos los aliados"
            onPress={onVerTodos}
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[estilos.verTodos, { color: tema.color.acento }]}>Ver todos</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tira horizontal de cards compactas */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          gap: 10,
          paddingVertical: 4
        }}
      >
        {aliados.map(aliado => (
          <Pressable
            key={aliado.id}
            accessibilityRole="button"
            accessibilityLabel={`${aliado.name}, ${aliado.category}. ${aliado.benefit}`}
            onPress={() => onSeleccionarAliado?.(aliado)}
            style={({ pressed }) => [
              estilos.card,
              {
                backgroundColor: tema.color.superficie,
                borderColor: tema.color.borde,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]
              }
            ]}
          >
            {/* Cabecera de card: Icono/Insignia + Rating */}
            <View style={estilos.filaInsignia}>
              <View style={[estilos.insignia, { backgroundColor: `${tema.color.acento}18`, borderColor: `${tema.color.acento}38` }]}>
                <Text style={[estilos.insigniaTexto, { color: tema.color.acento }]}>
                  {aliado.iconLetter ?? aliado.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              {aliado.rating ? (
                <View style={estilos.ratingBadge}>
                  <Text style={estilos.ratingEstrella}>★</Text>
                  <Text style={estilos.ratingNumero}>{aliado.rating}</Text>
                </View>
              ) : null}
            </View>

            {/* Nombre y categoria */}
            <View style={estilos.bloqueNombres}>
              <Text style={estilos.nombre} numberOfLines={1}>
                {aliado.name}
              </Text>
              <Text style={estilos.categoria} numberOfLines={1}>
                {aliado.category}
              </Text>
            </View>

            {/* Beneficio destacado */}
            <View style={[estilos.beneficioPill, { backgroundColor: `${tema.color.acento}14`, borderColor: `${tema.color.acento}30` }]}>
              <Text style={[estilos.beneficioTexto, { color: tema.color.acento }]} numberOfLines={1}>
                {aliado.benefit}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginVertical: 8
  },
  cabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10
  },
  titulos: {
    gap: 2
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
  verTodos: {
    fontSize: 13,
    fontWeight: '700'
  },
  card: {
    width: 170,
    minHeight: 142,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1.2,
    justifyContent: 'space-between'
  },
  filaInsignia: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  insignia: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  insigniaTexto: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)'
  },
  ratingEstrella: {
    fontSize: 10,
    color: '#FFD700'
  },
  ratingNumero: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E0E0E6'
  },
  bloqueNombres: {
    gap: 2,
    marginVertical: 8
  },
  nombre: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2
  },
  categoria: {
    fontSize: 11,
    color: '#8E8E93'
  },
  beneficioPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center'
  },
  beneficioTexto: {
    fontSize: 10.5,
    fontWeight: '700'
  }
});
