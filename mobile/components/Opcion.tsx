/**
 * Una opción que se elige tocándola: vehículo, servicio, ciudad, documento.
 *
 * Sirve para elección única y para múltiple; quien la usa decide qué hace al
 * tocar. Accesible como casilla o botón de radio según el caso.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colores, espaciado, radios, tipografia } from '../theme/tokens';

export interface PropiedadesDeOpcion {
  readonly titulo: string;
  readonly detalle?: string;
  readonly elegida: boolean;
  readonly onElegir: () => void;
  /** `radio` para una entre varias; `casilla` para varias a la vez. */
  readonly tipo?: 'radio' | 'casilla';
  readonly deshabilitada?: boolean;
  readonly testID?: string;
}

export function Opcion({ titulo, detalle, elegida, onElegir, tipo = 'radio', deshabilitada = false, testID }: PropiedadesDeOpcion) {
  return (
    <Pressable
      onPress={onElegir}
      disabled={deshabilitada}
      accessibilityRole={tipo === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ selected: elegida, checked: elegida, disabled: deshabilitada }}
      accessibilityLabel={titulo}
      style={({ pressed }) => [
        estilos.caja,
        elegida ? estilos.cajaElegida : null,
        pressed ? estilos.cajaPresionada : null,
        deshabilitada ? estilos.cajaDeshabilitada : null
      ]}
      testID={testID}
    >
      <View style={[estilos.marca, elegida ? estilos.marcaElegida : null]} />
      <View style={estilos.textos}>
        <Text style={estilos.titulo}>{titulo}</Text>
        {detalle ? <Text style={estilos.detalle}>{detalle}</Text> : null}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    minHeight: 56,
    paddingVertical: espaciado.md,
    paddingHorizontal: espaciado.lg,
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie
  },
  cajaElegida: { borderColor: colores.acento },
  cajaPresionada: { backgroundColor: colores.superficieElevada },
  cajaDeshabilitada: { opacity: 0.5 },
  marca: {
    width: 18,
    height: 18,
    borderRadius: radios.completo,
    borderWidth: 2,
    borderColor: colores.textoTenue
  },
  marcaElegida: { borderColor: colores.acento, backgroundColor: colores.acento },
  textos: { flex: 1, gap: 2 },
  titulo: { color: colores.textoPrimario, fontSize: tipografia.cuerpoFuerte.tamano, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto }
});
