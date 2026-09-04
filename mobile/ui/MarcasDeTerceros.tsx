/**
 * Los logotipos de Google y de Apple, para los botones de entrada.
 *
 * SÓLO EL LOGOTIPO
 *
 * El dueño los quiere sin texto: un disco con la marca y nada más. Es lo que
 * hacen las dos guías cuando el botón es un icono, y deja los dos accesos
 * alineados con «Entrar» sin competir con él.
 *
 * Sin texto visible hace falta más cuidado con quien no ve la pantalla: cada
 * botón lleva su nombre completo en `accessibilityLabel` —«Continuar con
 * Google»— y, mientras no haya autenticación real, la razón por la que no se
 * puede pulsar.
 *
 * EL ARCHIVO DE GOOGLE ES EL OFICIAL
 *
 * Se usa el botón de icono aprobado por Google, sin recortarlo, recolorearlo ni
 * deformarlo. El activo de Apple sigue siendo el marcador local documentado
 * en `scripts/marcas-de-terceros.py`; ambos botones permanecen deshabilitados
 * hasta que exista autenticación social real.
 *
 * LA MANZANA SE TIÑE; LA «G», NO
 *
 * El glifo de Apple es monocromo y va en negro sobre claro y en blanco sobre
 * oscuro, que es su norma. La «G» es de cuatro colores y no se recolorea
 * nunca: va sobre un disco claro que le garantiza el contraste en los dos
 * esquemas.
 */

import { Image, View } from 'react-native';

import { MARCAS_DE_TERCEROS } from '../theme/marca';
import { useEsquema, useTema } from '../theme/ThemeContext';

/** La «G» de Google, a color y sobre su propio disco claro. */
export function LogoDeGoogle({ tamano = 28 }: { readonly tamano?: number }) {
  return (
    <Image
      source={MARCAS_DE_TERCEROS.google}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={{ width: tamano, height: tamano }}
    />
  );
}

/** El glifo de Apple, teñido según el esquema. */
export function LogoDeApple({ tamano = 28 }: { readonly tamano?: number }) {
  const tema = useTema();
  const esquema = useEsquema();

  return (
    <Image
      source={MARCAS_DE_TERCEROS.apple}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={{
        width: tamano,
        height: tamano,
        // Negro sobre claro, blanco sobre oscuro. El activo va en negro con
        // transparencia, así que el tinte sólo cambia el relleno.
        tintColor: esquema === 'claro' ? '#000000' : tema.color.textoPrimario,
        // La manzana pesa más que la «G» a igual caja: baja un punto para que
        // las dos se vean del mismo tamaño.
        transform: [{ scale: 0.92 }]
      }}
    />
  );
}

/** El disco que sostiene a cualquiera de los dos. */
export function DiscoDeMarca({ children, apagado = false }: {
  readonly children: React.ReactNode;
  readonly apagado?: boolean;
}) {
  return (
    <View style={{
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      // El boton ya baja la opacidad cuando no esta disponible. Bajarla
      // tambien aqui las multiplicaba y los logotipos casi no se veian.
      opacity: apagado ? 0.9 : 1
    }}>
      {children}
    </View>
  );
}
