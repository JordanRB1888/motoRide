/**
 * Un campo de formulario: etiqueta, entrada y, si hace falta, el aviso.
 *
 * Funcional y sin pretensiones: el aspecto definitivo lo decide el trabajo de
 * diseño en `ui/`. Lo que sí es fijo es el comportamiento: el aviso se lee
 * debajo del campo, en el idioma de la persona, y la entrada no adivina nada
 * (sin autocorrección en cédulas, placas ni correos).
 */

import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../theme/tokens';

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
  /** Marca el campo como obligatorio con un asterisco, como en el formulario. */
  readonly obligatorio?: boolean;
  /** Dentro de una `Pareja`, para que los dos campos repartan la fila. */
  readonly enPareja?: boolean;
  readonly testID?: string;
}

export function CampoDeTexto({
  etiqueta, valor, onCambiar, error = null, ayuda, ejemplo, teclado = 'default', secreto = false, capitalizar = 'sentences', obligatorio = false, enPareja = false, testID
}: PropiedadesDeCampo) {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  return (
    <View style={[estilos.bloque, enPareja ? estilos.enPareja : null]}>
      <Text style={estilos.etiqueta}>
        {etiqueta}
        {obligatorio ? <Text style={estilos.asterisco}> *</Text> : null}
      </Text>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        placeholder={ejemplo}
        placeholderTextColor={tema.color.textoTenue}
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

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  bloque: { gap: espaciado.xs },
  enPareja: { flex: 1, minWidth: 0 },
  asterisco: { color: c.acento },
  etiqueta: {
    color: c.textoSecundario,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    fontWeight: '600'
  },
  entrada: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.borde,
    borderRadius: radios.md,
    backgroundColor: c.superficie,
    color: c.textoPrimario,
    paddingHorizontal: espaciado.md,
    fontSize: tipografia.cuerpo.tamano
  },
  entradaConError: { borderColor: c.peligro },
  error: { color: c.peligro, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  ayuda: { color: c.textoTenue, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto }
});
