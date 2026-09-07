/**
 * Casa · Trabajo · Lugares favoritos · Recientes.
 *
 * Píldoras claras en fila deslizante, como en la referencia. Todas abren el
 * buscador de destino, que es la puerta real a elegir un sitio: los sitios
 * guardados y los recientes viven allí. Prometer aquí una lista propia de
 * favoritos que no existe sería un botón que no lleva a nada.
 */

import { Pressable, ScrollView } from 'react-native';
import { Txt } from './componentes';
import { Icono, type NombreDeIcono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export interface AccesoRapido {
  readonly clave: string;
  readonly icono: NombreDeIcono;
  readonly nombre: string;
}

export function AccesosRapidos({ accesos, onElegir }: {
  readonly accesos: readonly AccesoRapido[];
  readonly onElegir: (clave: string) => void;
}) {
  const tema = useTema();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -tema.ritmo.margenPantalla }}
      contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: 8 }}
    >
      {accesos.map(acceso => (
        <Pressable
          key={acceso.clave}
          onPress={() => onElegir(acceso.clave)}
          accessibilityRole="button"
          accessibilityLabel={acceso.nombre}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 40,
            paddingHorizontal: 14,
            borderRadius: tema.radio.insignia,
            backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
            borderWidth: 1,
            borderColor: tema.color.borde
          })}
        >
          <Icono nombre={acceso.icono} color={tema.color.textoPrimario} tamano={17} />
          <Txt nivel="etiqueta">{acceso.nombre}</Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}
