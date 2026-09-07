/**
 * Un documento legal, tal como está hoy.
 *
 * NO SE INVENTA NADA JURÍDICO
 *
 * La bienvenida enlaza los Términos y Condiciones y la Política de Privacidad.
 * Los documentos reales todavía no están publicados, y esta pantalla lo dice
 * tal cual: el título oficial, y que se está preparando. Redactar aquí un texto
 * legal «de relleno» sería peor que no tener ninguno, porque alguien lo leería
 * como si fuera el de verdad.
 *
 * El día que exista, `DOCUMENTOS_LEGALES` pasa a `publicado: true` con su
 * contenido, y esta pantalla lo enseña sin cambiar nada de la bienvenida.
 */

import { View } from 'react-native';

import { Pantalla } from '../components/Pantalla';
import { Boton, Superficie, Txt } from './componentes';
import { useTema } from '../theme/ThemeContext';
import { DOCUMENTOS_LEGALES, type ClaveDeDocumentoLegal } from '../domain/entrada';

export function DocumentoLegal({ clave, onVolver }: {
  readonly clave: ClaveDeDocumentoLegal;
  readonly onVolver: () => void;
}) {
  const tema = useTema();
  const documento = DOCUMENTOS_LEGALES[clave];

  return (
    <Pantalla desplazable testID={`legal-${clave}`}>
      <View style={{ paddingTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreBloques }}>
        <Txt nivel="titulo" accessibilityRole="header">{documento.titulo}</Txt>

        {documento.publicado ? null : (
          <Superficie testID="documento-en-preparacion">
            <View style={{ gap: 8 }}>
              <Txt nivel="encabezado">Todavía no está publicado</Txt>
              <Txt nivel="cuerpo" tono="secundario">
                Este documento se está preparando. Cuando esté publicado podrás
                leerlo aquí, dentro de la aplicación.
              </Txt>
            </View>
          </Superficie>
        )}

        <Boton titulo="Volver" variante="secundario" onPress={onVolver} testID="volver" />
      </View>
    </Pantalla>
  );
}
