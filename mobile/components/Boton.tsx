/**
 * El botón de +58express.
 *
 * Existe para que no haya veinte botones distintos hechos a mano por las
 * pantallas. Todo lo que importa —el área táctil, el contraste, el rol de
 * accesibilidad, la respuesta al toque— se decide una vez, aquí.
 *
 * ACCESIBILIDAD, NO COMO ADORNO
 *
 * · `accessibilityRole="button"` para que un lector de pantalla lo anuncie como
 *   botón y no como texto suelto;
 * · el área táctil nunca baja de 48 puntos, aunque el texto sea corto;
 * · `accessibilityState` comunica el estado deshabilitado, porque bajar la
 *   opacidad no se lo dice a quien no ve la pantalla;
 * · `hitSlop` amplía la zona sensible sin agrandar el dibujo.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colores, espaciado, radios, tipografia, AREA_TACTIL_MINIMA } from '../theme/tokens';

export type VarianteDeBoton = 'principal' | 'secundario';

export interface PropiedadesDeBoton {
  readonly titulo: string;
  readonly onPress: () => void;
  readonly variante?: VarianteDeBoton;
  /** Línea de apoyo bajo el título. Para explicar sin abrir un diálogo. */
  readonly descripcion?: string;
  readonly deshabilitado?: boolean;
  readonly cargando?: boolean;
  /** Lo que anuncia el lector de pantalla. Por defecto, el título. */
  readonly etiquetaAccesible?: string;
  readonly estilo?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function Boton({
  titulo,
  onPress,
  variante = 'principal',
  descripcion,
  deshabilitado = false,
  cargando = false,
  etiquetaAccesible,
  estilo,
  testID
}: PropiedadesDeBoton) {
  const inactivo = deshabilitado || cargando;
  const esPrincipal = variante === 'principal';

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      accessibilityHint={descripcion}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      // Amplía la zona sensible sin cambiar el dibujo: ayuda a quien pulsa con
      // el pulgar, en movimiento y con una sola mano.
      hitSlop={8}
      style={({ pressed }) => [
        estilos.base,
        esPrincipal ? estilos.principal : estilos.secundario,
        pressed && !inactivo && (esPrincipal ? estilos.principalPulsado : estilos.secundarioPulsado),
        inactivo && estilos.inactivo,
        estilo
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={esPrincipal ? colores.sobreAcento : colores.textoPrimario} />
      ) : (
        <View style={estilos.contenido}>
          <Text style={[estilos.titulo, esPrincipal ? estilos.tituloPrincipal : estilos.tituloSecundario]}>
            {titulo}
          </Text>
          {descripcion !== undefined && (
            <Text
              style={[estilos.descripcion, esPrincipal ? estilos.descripcionPrincipal : estilos.descripcionSecundaria]}
            >
              {descripcion}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: AREA_TACTIL_MINIMA,
    borderRadius: radios.lg,
    paddingVertical: espaciado.lg,
    paddingHorizontal: espaciado.xl,
    justifyContent: 'center',
    alignItems: 'center'
  },
  contenido: { alignItems: 'center', gap: espaciado.xs },
  principal: { backgroundColor: colores.acento },
  // Al pulsar cambia el COLOR, no sólo la opacidad: se distingue también con
  // poca luz y con el brillo al mínimo, que es como se usa esto de noche.
  principalPulsado: { backgroundColor: colores.acentoPresionado },
  secundario: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde
  },
  secundarioPulsado: { backgroundColor: colores.superficieElevada },
  inactivo: { opacity: 0.45 },
  titulo: { fontSize: tipografia.cuerpoFuerte.tamano, fontWeight: '600', textAlign: 'center' },
  tituloPrincipal: { color: colores.sobreAcento },
  tituloSecundario: { color: colores.textoPrimario },
  descripcion: { fontSize: tipografia.pie.tamano, textAlign: 'center' },
  descripcionPrincipal: { color: colores.sobreAcento, opacity: 0.75 },
  descripcionSecundaria: { color: colores.textoSecundario }
});
