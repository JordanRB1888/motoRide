/**
 * El título de una sección del inicio y su «Ver todos ›».
 *
 * Aliados, promociones y servicios abren igual: mismo nivel de texto, misma
 * acción a la derecha, mismo chevron. Con tres cabeceras escritas a mano se
 * notaba —tamaños distintos, una con flecha y otra sin ella— y se leían como
 * tres pantallas pegadas.
 */

import { Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export function CabeceraDeSeccion({ titulo, accion, onAccion }: {
  readonly titulo: string;
  readonly accion?: string;
  readonly onAccion?: () => void;
}) {
  const tema = useTema();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Txt nivel="encabezado" accessibilityRole="header" estilo={{ flex: 1 }}>{titulo}</Txt>
      {accion !== undefined ? (
        <Pressable
          onPress={onAccion}
          accessibilityRole="button"
          accessibilityLabel={`${accion}: ${titulo.toLowerCase()}`}
          // Área táctil de 48: el texto mide diecisiete y el resto lo pone el hitSlop.
          hitSlop={{ top: 16, bottom: 16, left: 12, right: 12 }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}
        >
          <Txt nivel="etiqueta" tono="secundario">{accion}</Txt>
          <Icono nombre="chevron-derecha" color={tema.color.textoSecundario} tamano={14} />
        </Pressable>
      ) : null}
    </View>
  );
}
