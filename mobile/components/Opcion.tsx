/**
 * Una opción que se elige tocándola: vehículo, servicio, ciudad, documento.
 *
 * Sirve para elección única y para múltiple; quien la usa decide qué hace al
 * tocar. Accesible como casilla o botón de radio según el caso.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../theme/tokens';

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
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
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

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    minHeight: 56,
    paddingVertical: espaciado.md,
    paddingHorizontal: espaciado.lg,
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie
  },
  cajaElegida: { borderColor: c.acento },
  cajaPresionada: { backgroundColor: c.superficieElevada },
  cajaDeshabilitada: { opacity: 0.5 },
  marca: {
    width: 18,
    height: 18,
    borderRadius: radios.completo,
    borderWidth: 2,
    borderColor: c.textoTenue
  },
  marcaElegida: { borderColor: c.acento, backgroundColor: c.acento },
  textos: { flex: 1, gap: 2 },
  titulo: { color: c.textoPrimario, fontSize: tipografia.cuerpoFuerte.tamano, fontWeight: '600' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto }
});
