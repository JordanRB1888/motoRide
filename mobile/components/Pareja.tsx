/**
 * Dos campos en una fila, como en el formulario web (nombre y apellido, cédula
 * y fecha, teléfono y correo, ciudad y estado).
 *
 * En una pantalla estrecha o con el texto ampliado la fila se rompe sola y los
 * campos se apilan: dos columnas de 160 puntos no caben en un teléfono pequeño
 * y partir una etiqueta a la mitad no ayuda a nadie.
 */

import { useWindowDimensions } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { espaciado } from '../theme/tokens';

/** Por debajo de este ancho, en columna. */
const ANCHO_MINIMO_PARA_DOS = 380;

export function Pareja({ children }: { readonly children: ReactNode }) {
  const { width, fontScale } = useWindowDimensions();
  const enFila = width >= ANCHO_MINIMO_PARA_DOS && fontScale <= 1.3;
  return <View style={[estilos.fila, enFila ? null : estilos.columna]}>{children}</View>;
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', gap: espaciado.md },
  columna: { flexDirection: 'column' }
});
