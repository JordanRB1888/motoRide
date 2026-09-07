/**
 * Aliados comerciales: seis discos con logotipo y el nombre debajo.
 *
 * LOS LOGOTIPOS NO ESTÁN
 *
 * La referencia enseña seis marcas reales. Ninguna ha entregado su logotipo,
 * así que cada disco lleva un monograma sobre el color de la marca: es el hueco
 * preparado, no un adorno. El día que llegue el archivo, va en `logo` y el
 * monograma deja de pintarse. Los colores de marca son DATOS del aliado, no
 * tintas de la interfaz: por eso viven en el mock y no en el tema.
 *
 * El nombre debajo va en la tinta del tema, que es la que sabe si es de día.
 */

import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { CabeceraDeSeccion } from './CabeceraDeSeccion';
import { useMovimientoReducido } from './movimiento';

export interface CommercialPartner {
  readonly id: string;
  readonly name: string;
  readonly logo?: ImageSourcePropType;
  readonly colorDeMarca?: string;
  readonly tintaDeMarca?: string;
  readonly inicial?: string;
}

export const ALIADOS_MOCK: readonly CommercialPartner[] = Object.freeze([
  { id: 'mcdonalds', name: 'McDonald’s', colorDeMarca: '#da291c', tintaDeMarca: '#ffc72c', inicial: 'M' },
  { id: 'farmatodo', name: 'Farmatodo', colorDeMarca: '#0b4ea2', tintaDeMarca: '#ffffff', inicial: 'F' },
  { id: 'automercado', name: 'Automercado', colorDeMarca: '#1d7a3a', tintaDeMarca: '#ffffff', inicial: 'A' },
  { id: 'cafe-amanecer', name: 'Café Amanecer', colorDeMarca: '#5b3a1e', tintaDeMarca: '#f7d774', inicial: 'C' },
  { id: 'yummy', name: 'Yummy', colorDeMarca: '#2dbb8f', tintaDeMarca: '#ffffff', inicial: 'Y' },
  { id: 'multimax', name: 'MultiMax', colorDeMarca: '#ffffff', tintaDeMarca: '#1a2b6d', inicial: 'M' }
]);

const DIAMETRO = 70;
const ANCHO_DE_CELDA = 84;

interface PropiedadesCommercialPartners {
  readonly aliados?: readonly CommercialPartner[];
  readonly onSeleccionarAliado?: (aliado: CommercialPartner) => void;
  readonly onVerTodos?: () => void;
}

export function CommercialPartners({ aliados = ALIADOS_MOCK, onSeleccionarAliado, onVerTodos }: PropiedadesCommercialPartners) {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  if (aliados.length === 0) return null;

  return (
    <View>
      <CabeceraDeSeccion titulo="Aliados comerciales" accion="Ver todos" onAccion={onVerTodos} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: 6 }}
      >
        {aliados.map(aliado => (
          <Pressable
            key={aliado.id}
            accessibilityRole="button"
            accessibilityLabel={aliado.name}
            onPress={() => onSeleccionarAliado?.(aliado)}
            style={({ pressed }) => [
              estilos.celda,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed && !quieto ? 0.97 : 1 }] }
            ]}
          >
            <View style={[
              estilos.disco,
              {
                backgroundColor: aliado.colorDeMarca ?? tema.color.superficieElevada,
                borderColor: tema.color.borde,
                ...tema.superficie.sombra
              }
            ]}>
              {aliado.logo !== undefined ? (
                <Image source={aliado.logo} resizeMode="contain" style={{ width: DIAMETRO * 0.62, height: DIAMETRO * 0.62 }} />
              ) : (
                <Text style={[estilos.monograma, { color: aliado.tintaDeMarca ?? tema.color.acentoTexto }]}>
                  {aliado.inicial ?? aliado.name.slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={[estilos.nombre, { color: tema.color.textoPrimario }]} numberOfLines={2}>{aliado.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  celda: { width: ANCHO_DE_CELDA, alignItems: 'center', gap: 8 },
  disco: { width: DIAMETRO, height: DIAMETRO, borderRadius: DIAMETRO / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monograma: { fontSize: 28, fontWeight: '900', fontStyle: 'italic' },
  nombre: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', lineHeight: 16 }
});
