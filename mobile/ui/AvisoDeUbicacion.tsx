/**
 * Lo que se le dice al conductor sobre su ubicación, encima del mapa.
 *
 * DISCRETO A PROPÓSITO
 *
 * El mapa se pinta SIEMPRE, con ubicación o sin ella. Esto es una pastilla
 * pequeña que aparece encima: buscar el GPS no puede bloquear la pantalla de
 * alguien que está trabajando, y un aviso a pantalla completa por una lectura
 * que tarda dos segundos sería peor que el problema.
 *
 * Sin mensaje no se pinta nada: cuando todo va bien, el sitio es del mapa.
 */

import { Pressable, View } from 'react-native';

import { Txt } from './componentes';
import { useTema } from '../theme/ThemeContext';

export function AvisoDeUbicacionEnMapa({
  mensaje,
  onReintentar
}: {
  readonly mensaje: string | null;
  /** Sólo cuando reintentar puede arreglar algo. Un permiso denegado, no. */
  readonly onReintentar?: () => void;
}) {
  const tema = useTema();
  if (mensaje === null) return null;

  return (
    <View
      testID="aviso-ubicacion-conductor"
      accessibilityRole="alert"
      style={{
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: tema.color.borde
      }}
    >
      <Txt nivel="pie" tono="secundario">{mensaje}</Txt>
      {onReintentar === undefined ? null : (
        <Pressable
          onPress={onReintentar}
          accessibilityRole="button"
          accessibilityLabel="Reintentar la ubicación"
          testID="reintentar-ubicacion"
          hitSlop={8}
        >
          <Txt nivel="pie" tono="acento">Reintentar</Txt>
        </Pressable>
      )}
    </View>
  );
}
