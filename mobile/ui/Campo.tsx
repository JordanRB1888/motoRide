/**
 * Un campo de texto del sistema nuevo.
 *
 * POR QUÉ NO SE REUTILIZA `components/Campo.tsx`
 *
 * Aquel existe, funciona y se queda donde está: lo usa la pantalla de acceso.
 * Pero lee sus colores de `theme/tokens`, que es la paleta FIJA anterior al
 * tema de día y noche. Montado aquí se vería con los colores de noche a
 * mediodía.
 *
 * Lo que sí se copia es su accesibilidad, que estaba bien resuelta: la etiqueta
 * se asocia al campo para que el lector la anuncie al entrar, y el error viaja
 * DENTRO de la etiqueta accesible. Un borde rojo no le dice nada a quien no ve
 * la pantalla.
 */

import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Txt } from './componentes';
import { useTema } from '../theme/ThemeContext';

export interface PropiedadesDeCampo extends Omit<TextInputProps, 'style'> {
  readonly etiqueta: string;
  readonly error?: string | null;
  /** Texto de ayuda permanente, bajo el campo. */
  readonly ayuda?: string;
}

export const Campo = forwardRef<TextInput, PropiedadesDeCampo>(function Campo(
  { etiqueta, error, ayuda, ...resto },
  referencia
) {
  const tema = useTema();
  const [enfocado, setEnfocado] = useState(false);
  const hayError = typeof error === 'string' && error !== '';

  const borde = hayError
    ? tema.color.peligro
    : enfocado
      ? tema.color.acento
      : tema.color.borde;

  return (
    <View style={{ gap: 6 }}>
      <Txt nivel="etiqueta" tono="secundario">{etiqueta}</Txt>

      <TextInput
        ref={referencia}
        {...resto}
        accessibilityLabel={hayError ? `${etiqueta}. Error: ${error}` : etiqueta}
        accessibilityState={{ disabled: resto.editable === false }}
        placeholderTextColor={tema.color.textoTenue}
        onFocus={evento => { setEnfocado(true); resto.onFocus?.(evento); }}
        onBlur={evento => { setEnfocado(false); resto.onBlur?.(evento); }}
        style={{
          minHeight: 48,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: tema.radio.campo,
          borderWidth: 1,
          borderColor: borde,
          backgroundColor: tema.color.superficieHundida,
          color: resto.editable === false ? tema.color.textoTenue : tema.color.textoPrimario,
          fontSize: tema.texto.cuerpo.tamano
        }}
      />

      {/* El error manda sobre la ayuda: si están los dos, se enseña lo que hay
          que arreglar, no lo que había que saber. */}
      {hayError ? (
        // La región viva va en la vista, no en el texto: es la que hace que
        // Android lo lea al APARECER, sin que haga falta volver al campo.
        <View accessibilityLiveRegion="polite">
          <Txt nivel="pie" tono="peligro">{error}</Txt>
        </View>
      ) : ayuda !== undefined ? (
        <Txt nivel="pie" tono="tenue">{ayuda}</Txt>
      ) : null}
    </View>
  );
});
