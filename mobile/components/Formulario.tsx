/**
 * La concha del formulario de postulación: cabecera fija, cuerpo que se
 * desplaza y pie con las acciones siempre a la vista.
 *
 * Es la estructura que el dueño eligió, la del formulario web. `Pantalla` no
 * sirve tal cual porque reparte su propio margen lateral y no distingue
 * cabecera de pie; esta es la misma idea con esas tres zonas, y la usan sólo
 * las pantallas de la postulación.
 *
 * El teclado no debe tapar el botón: el conjunto va dentro de un
 * `KeyboardAvoidingView`, con el mismo comportamiento por plataforma que ya
 * usa el resto de la aplicación.
 */

import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useTema } from '../theme/ThemeContext';

export interface PropiedadesDeFormulario {
  /** La cabecera con el título y los pasos. Fija arriba. */
  readonly cabecera: ReactNode;
  /** Las acciones. Fijas abajo; sin ellas, el cuerpo llega al final. */
  readonly pie?: ReactNode;
  readonly children: ReactNode;
  /**
   * Para llevar la vista a un sitio concreto al abrir.
   *
   * Lo usa el paso de documentos cuando administración pidió repetir algo que
   * está a mitad de una lista de doce: dejar a la persona buscándolo sería
   * hacerle perder el tiempo en lo único que tenía que hacer.
   */
  readonly refDelCuerpo?: RefObject<ScrollView | null>;
  readonly testID?: string;
}

export function Formulario({ cabecera, pie, children, refDelCuerpo, testID }: PropiedadesDeFormulario) {
  const tema = useTema();
  return (
    <View style={[estilos.raiz, { backgroundColor: tema.color.fondo }]} testID={testID}>
      <StatusBar style="light" />
      <SafeAreaView style={estilos.segura} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={estilos.teclado}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {cabecera}
          <ScrollView
            ref={refDelCuerpo}
            style={estilos.cuerpo}
            contentContainerStyle={estilos.contenido}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {pie}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1 },
  segura: { flex: 1 },
  teclado: { flex: 1 },
  cuerpo: { flex: 1 },
  contenido: { flexGrow: 1 }
});
