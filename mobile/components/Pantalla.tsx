/**
 * El contenedor de una pantalla.
 *
 * Resuelve de una vez las tres cosas que se olvidan por pantalla y luego se
 * arreglan a parches:
 *
 * 1. **Áreas seguras.** Se usan las de verdad, del sistema. No se dibuja una
 *    barra falsa de 44 puntos «para el notch»: eso está mal en cuanto cambia el
 *    modelo de teléfono, y hoy hay Dynamic Island, agujero, muesca y nada.
 *
 * 2. **El teclado.** En un formulario de acceso, el teclado tapa justo el campo
 *    que se está rellenando. `KeyboardAvoidingView` con el comportamiento que
 *    cada plataforma necesita —iOS y Android lo gestionan distinto— y desplazado
 *    para que se pueda llegar al botón.
 *
 * 3. **El fondo.** Grafito de la marca hasta el borde, incluso detrás de la
 *    barra de estado.
 */

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useTema } from '../theme/ThemeContext';
import { espaciado } from '../theme/tokens';

export interface PropiedadesDePantalla {
  readonly children: ReactNode;
  /** Con desplazamiento cuando el contenido puede no caber. */
  readonly desplazable?: boolean;
  /** Bordes a proteger. Por defecto arriba y abajo. */
  readonly bordes?: readonly ('top' | 'bottom' | 'left' | 'right')[];
  readonly testID?: string;
}

export function Pantalla({
  children,
  desplazable = false,
  bordes = ['top', 'bottom'],
  testID
}: PropiedadesDePantalla) {
  const tema = useTema();
  const contenido = desplazable ? (
    <ScrollView
      contentContainerStyle={estilos.contenidoDesplazable}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={estilos.contenido}>{children}</View>
  );

  return (
    // El fondo sale del tema, no de una constante: es lo que hace que la
    // pantalla entera cambie de dia a noche.
    <View style={[estilos.raiz, { backgroundColor: tema.color.fondo }]} testID={testID}>
      {/* Iconos claros: el fondo siempre es grafito. */}
      <StatusBar style="light" />
      <SafeAreaView style={estilos.segura} edges={bordes}>
        <KeyboardAvoidingView
          style={estilos.teclado}
          // `padding` en iOS y `height` en Android: es la combinación que
          // funciona en cada uno. Unificarla rompe uno de los dos.
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {contenido}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1 },
  segura: { flex: 1 },
  teclado: { flex: 1 },
  contenido: { flex: 1, paddingHorizontal: espaciado.xl },
  contenidoDesplazable: {
    flexGrow: 1,
    paddingHorizontal: espaciado.xl,
    paddingBottom: espaciado.xxl
  }
});
