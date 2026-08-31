/**
 * Un campo de formulario.
 *
 * Concentra lo que se olvida cuando cada pantalla hace el suyo: la etiqueta
 * asociada, el anuncio del error, el área táctil y el estado de foco visible sin
 * depender sólo del color.
 *
 * EL ERROR SE ANUNCIA, NO SÓLO SE PINTA
 *
 * Un borde rojo no le dice nada a quien usa un lector de pantalla.
 * `accessibilityLiveRegion` en Android y `accessibilityLabel` incluyendo el
 * error hacen que se lea al aparecer.
 */

import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colores, espaciado, radios, tipografia, AREA_TACTIL_MINIMA } from '../theme/tokens';

export interface PropiedadesDeCampo extends Omit<TextInputProps, 'style'> {
  readonly etiqueta: string;
  readonly error?: string | null;
  /** Texto de ayuda permanente, bajo el campo. */
  readonly ayuda?: string;
}

export const Campo = forwardRef<TextInput, PropiedadesDeCampo>(function Campo(
  { etiqueta, error, ayuda, ...resto },
  ref
) {
  const [enfocado, setEnfocado] = useState(false);
  const hayError = typeof error === 'string' && error !== '';

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta} nativeID={`etiqueta-${etiqueta}`}>
        {etiqueta}
      </Text>

      <TextInput
        ref={ref}
        {...resto}
        // La etiqueta se asocia al campo: el lector la anuncia al entrar.
        accessibilityLabel={hayError ? `${etiqueta}. Error: ${error}` : etiqueta}
        accessibilityLabelledBy={`etiqueta-${etiqueta}`}
        accessibilityState={{ disabled: resto.editable === false }}
        placeholderTextColor={colores.textoTenue}
        onFocus={evento => { setEnfocado(true); resto.onFocus?.(evento); }}
        onBlur={evento => { setEnfocado(false); resto.onBlur?.(evento); }}
        style={[
          estilos.entrada,
          enfocado && estilos.entradaEnfocada,
          hayError && estilos.entradaConError
        ]}
      />

      {hayError && (
        <Text
          style={estilos.error}
          // Se lee en cuanto aparece, sin que haya que navegar hasta él.
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}

      {!hayError && ayuda !== undefined && <Text style={estilos.ayuda}>{ayuda}</Text>}
    </View>
  );
});

const estilos = StyleSheet.create({
  contenedor: { gap: espaciado.xs },
  etiqueta: {
    color: colores.textoSecundario,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    fontWeight: '600'
  },
  entrada: {
    minHeight: AREA_TACTIL_MINIMA,
    backgroundColor: colores.superficie,
    borderColor: colores.borde,
    borderWidth: 1,
    borderRadius: radios.md,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
    color: colores.textoPrimario,
    fontSize: tipografia.cuerpo.tamano
  },
  // El foco cambia el borde a amarillo: se ve también con el brillo al mínimo,
  // que es como se usa esto de noche.
  entradaEnfocada: { borderColor: colores.acento },
  entradaConError: { borderColor: colores.peligro },
  error: {
    color: colores.peligro,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto
  },
  ayuda: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto
  }
});
