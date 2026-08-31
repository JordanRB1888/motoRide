/**
 * La hoja inferior: la superficie que sube sobre el mapa.
 *
 * POR QUÉ EXISTE, Y QUÉ SUSTITUYE
 *
 * Antes cada cosa —destino, servicio, seguridad, estado— era su propia tarjeta
 * flotando en una lista. Siete rectángulos apilados no son una jerarquía: son
 * siete elementos pidiendo lo mismo a la vez. Aquí hay UNA superficie que
 * agrupa lo que la persona está haciendo ahora, y dentro se ordena con
 * espacio, tipografía y separadores en lugar de con más recuadros.
 *
 * NUNCA TAPA EL MAPA ENTERO
 *
 * Ni siquiera abierta del todo. El tope es el 62 % del alto, y es una regla,
 * no una casualidad: mientras alguien pide un viaje tiene que seguir viendo
 * dónde está, hacia dónde va y qué hay alrededor. Una hoja a pantalla completa
 * convierte el mapa en una pantalla anterior.
 *
 * SOBRE EL GESTO
 *
 * Los tres estados existen y se pintan; arrastrar con el dedo llegará con el
 * mapa real, que es quien manda sobre el gesto. Meter ahora una biblioteca de
 * gestos sólo para la maqueta sería cargar el paquete por una animación.
 */

import { type ReactNode } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '../theme/ThemeContext';
import { altoDeHoja, siguienteEstadoDeHoja, type EstadoDeHoja } from '../theme/hoja';

// Las medidas viven en `theme/hoja.ts`, sin dependencias de React Native, para
// que el generador de evidencia y las pruebas lean los mismos números que el
// teléfono en vez de una copia. Se reexportan para no obligar a quien use la
// hoja a importar de dos sitios.
export { ESTADOS_DE_HOJA, FRACCION_POR_ESTADO, altoDeHoja } from '../theme/hoja';
export type { EstadoDeHoja } from '../theme/hoja';

export function HojaInferior({
  estado = 'media',
  onCambiarEstado,
  conAsa = true,
  alturaAutomatica = false,
  espacioInferior = 0,
  children
}: {
  readonly estado?: EstadoDeHoja;
  readonly onCambiarEstado?: (siguiente: EstadoDeHoja) => void;
  readonly conAsa?: boolean;
  /**
   * La hoja ocupa lo que ocupe su contenido, en vez de la fracción del estado.
   *
   * Hace falta cuando dentro va poco y fijo: el conductor conectado, que sólo
   * enseña tres cifras, o la confirmación de un punto. Con la altura del estado
   * quedaba media hoja vacía debajo del texto, que es alto de mapa regalado a
   * cambio de nada.
   */
  readonly alturaAutomatica?: boolean;
  /** Hueco que hay que dejar abajo para la barra de navegación. */
  readonly espacioInferior?: number;
  readonly children?: ReactNode;
}) {
  const tema = useTema();
  const inferior = useSafeAreaInsets().bottom;
  const alto = alturaAutomatica ? undefined : altoDeHoja(estado, Dimensions.get('window').height);

  const siguienteEstado: EstadoDeHoja = siguienteEstadoDeHoja(estado);

  return (
    <View
      style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: alto === undefined ? undefined : alto + espacioInferior,
        paddingBottom: espacioInferior + (espacioInferior > 0 ? 0 : inferior),
        backgroundColor: tema.color.superficie,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        // La hoja flota sobre el mapa, así que su sombra es la más marcada de
        // la interfaz: es lo único que separa dos superficies del mismo color.
        shadowColor: '#000000',
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -8 },
        elevation: 18
      }}
    >
      {conAsa ? (
        <Pressable
          onPress={() => onCambiarEstado?.(siguienteEstado)}
          accessibilityRole="button"
          accessibilityLabel="Cambiar el tamaño del panel"
          style={{ paddingTop: 10, paddingBottom: 6, alignItems: 'center' }}
        >
          <View style={{
            width: 38, height: 4, borderRadius: 2,
            backgroundColor: tema.color.textoTenue, opacity: 0.55
          }} />
        </Pressable>
      ) : null}

      <View style={{
        flex: alturaAutomatica ? undefined : 1,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingTop: conAsa ? tema.ritmo.entreElementos : tema.ritmo.dentroDeTarjeta,
        paddingBottom: alturaAutomatica ? tema.ritmo.dentroDeTarjeta : 0
      }}>
        {children}
      </View>
    </View>
  );
}

/**
 * Un separador dentro de la hoja.
 *
 * Es lo que hace innecesaria la segunda tarjeta: una línea de un píxel divide
 * dos grupos sin dibujar otro rectángulo alrededor de cada uno.
 */
export function Separador({ margen = 0 }: { readonly margen?: number }) {
  const tema = useTema();

  return (
    <View style={{
      height: 1,
      marginVertical: margen,
      backgroundColor: tema.color.borde,
      opacity: 0.9
    }} />
  );
}
