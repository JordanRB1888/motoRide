/**
 * La píldora de saldo y el botón de ubicación del bloque utilitario.
 *
 * SIN CIFRA NO HAY CIFRA
 *
 * La referencia enseña «Bs. 25,60». La cartera de la aplicación todavía no
 * está encendida en el servidor y la sesión no trae ningún importe, así que
 * en la app real la píldora dice «Ver saldo» y lleva a la pantalla de saldo,
 * donde se explica. Un importe inventado en la pantalla que más se abre acaba
 * citado como el dinero de alguien. En el laboratorio sale el del fixture.
 */

import { Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export interface SaldoDelInicio {
  readonly etiqueta: string;
  readonly valor: string;
}

export function TarjetaDeSaldo({ saldo, onPress }: {
  readonly saldo: SaldoDelInicio | null;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  const etiqueta = saldo === null ? 'Saldo' : saldo.etiqueta;
  const valor = saldo === null ? 'Ver saldo' : saldo.valor;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta}, ${valor}`}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 6,
        paddingRight: 12,
        height: 52,
        borderRadius: tema.radio.pildora,
        backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: tema.color.borde
      })}
    >
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        // El amarillo de marca como fondo rebajado: es superficie, no tinta.
        backgroundColor: `${tema.color.acento}33`
      }}>
        <Icono nombre="billetera" color={tema.color.acentoTexto} tamano={20} />
      </View>
      <View style={{ gap: 1 }}>
        <Txt nivel="pie" tono="tenue">{etiqueta}</Txt>
        <Txt nivel="etiqueta" estilo={{ fontWeight: '800', fontSize: 15 }}>{valor}</Txt>
      </View>
      <Icono nombre="chevron-derecha" color={tema.color.textoTenue} tamano={16} />
    </Pressable>
  );
}

/**
 * El botón cuadrado de ubicación que la referencia pone junto al buscador.
 * Abre Pedir, que arranca localizando a la persona: la etiqueta dice eso y no
 * «usar mi ubicación», que prometería centrar un mapa que aquí no hay.
 */
export function BotonDeUbicacion({ onPress }: { readonly onPress: () => void }) {
  const tema = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Pedir desde mi ubicación"
      hitSlop={6}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: tema.radio.campo,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: tema.color.borde
      })}
    >
      <Icono nombre="ubicacion" color={tema.color.textoPrimario} tamano={22} />
    </Pressable>
  );
}
