/**
 * Un campo de formulario: etiqueta, entrada y, si hace falta, el aviso.
 *
 * Funcional y sin pretensiones: el aspecto definitivo lo decide el trabajo de
 * diseño en `ui/`. Lo que sí es fijo es el comportamiento: el aviso se lee
 * debajo del campo, en el idioma de la persona, y la entrada no adivina nada
 * (sin autocorrección en cédulas, placas ni correos).
 */

import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colores, espaciado, radios, tipografia } from '../theme/tokens';

export interface PropiedadesDeCampo {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly error?: string | null;
  readonly ayuda?: string;
  readonly ejemplo?: string;
  readonly teclado?: KeyboardTypeOptions;
  readonly secreto?: boolean;
  readonly capitalizar?: 'none' | 'sentences' | 'words' | 'characters';
  readonly testID?: string;
}

export function CampoDeTexto({
  etiqueta, valor, onCambiar, error = null, ayuda, ejemplo, teclado = 'default', secreto = false, capitalizar = 'sentences', testID
}: PropiedadesDeCampo) {
  return (
    <View style={estilos.bloque}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        placeholder={ejemplo}
        placeholderTextColor={colores.textoTenue}
        keyboardType={teclado}
        secureTextEntry={secreto}
        autoCapitalize={capitalizar}
        autoCorrect={false}
        accessibilityLabel={etiqueta}
        style={[estilos.entrada, error ? estilos.entradaConError : null]}
        testID={testID}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: espaciado.xs },
  etiqueta: {
    color: colores.textoSecundario,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    fontWeight: '600'
  },
  entrada: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.md,
    backgroundColor: colores.superficie,
    color: colores.textoPrimario,
    paddingHorizontal: espaciado.md,
    fontSize: tipografia.cuerpo.tamano
  },
  entradaConError: { borderColor: colores.peligro },
  error: { color: colores.peligro, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  ayuda: { color: colores.textoTenue, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto }
});
