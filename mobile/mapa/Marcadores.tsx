/**
 * Lo que se pinta ENCIMA del mapa, sea cual sea el mapa.
 *
 * Los dos adaptadores —el del teléfono y el del navegador— colocan estas
 * mismas piezas. Así la moto amarilla es la misma moto en los dos sitios, y
 * cambiar de proveedor no cambia la marca.
 *
 * NADA DE PINES GENÉRICOS
 *
 * Google trae un marcador rojo por defecto. Aquí no se usa: hay ilustraciones
 * aprobadas para la moto y el carro, y el origen y el destino tienen su forma
 * —círculo y cuadrado— desde el primer diseño. Un pin rojo de Google en medio
 * de esta pantalla se ve como lo que sería: otra aplicación.
 */

import { View } from 'react-native';
import { MarcadorDeVehiculo } from '../ui/Marca';
import { useTema } from '../theme/ThemeContext';
import type { Marcador } from './modelo';

/**
 * El tamaño de la caja de un marcador.
 *
 * Los adaptadores lo necesitan para centrar la pieza sobre su coordenada: el
 * navegador lo hace con un desplazamiento y el teléfono con `anchor`, pero los
 * dos parten de aquí.
 */
export function tamanoDelMarcador(marcador: Marcador): number {
  if (marcador.clase === 'origen' || marcador.clase === 'destino') return 22;
  // El punto del usuario cuenta con su anillo: es lo que ocupa en pantalla.
  if (marcador.clase === 'usuario') return 26;
  return marcador.destacado === true ? 62 : 42;
}

/**
 * La pieza de un marcador.
 *
 * Sin posición: la coloca quien la use. Esto sólo dice cómo se ve.
 */
export function PiezaDelMarcador({ marcador }: { readonly marcador: Marcador }) {
  const tema = useTema();

  // DÓNDE ESTÁS TÚ
  //
  // El punto de toda la vida: un círculo con anillo que lo despega del mapa.
  // No lleva vehículo —quien mira no conduce nada— ni estrena un color: usa el
  // acento de la marca. Y es más pequeño que la moto a propósito: es una
  // referencia, no el protagonista de la pantalla.
  if (marcador.clase === 'usuario') {
    return (
      <View style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${tema.color.acento}33`
      }}>
        <View style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: tema.color.acento,
          borderWidth: 2.5,
          borderColor: tema.color.fondo
        }} />
      </View>
    );
  }

  if (marcador.clase === 'origen' || marcador.clase === 'destino') {
    const esOrigen = marcador.clase === 'origen';
    return (
      <View style={{
        width: 22,
        height: 22,
        // El origen es redondo y el destino cuadrado, como en el lienzo
        // dibujado y como en el historial: se reconoce sin leer.
        borderRadius: esOrigen ? 11 : 5,
        backgroundColor: esOrigen ? tema.color.textoPrimario : tema.color.acento,
        borderWidth: 3,
        borderColor: tema.color.fondo
      }} />
    );
  }

  return (
    <MarcadorDeVehiculo
      tipo={marcador.clase === 'auto' ? 'AUTO' : 'MOTO'}
      tamano={marcador.destacado === true ? 62 : 42}
      // Sin rumbo conocido, cero: la ilustración mira al frente. No se inventa
      // una orientación, que sobre un mapa real se leería como información.
      rumbo={marcador.rumbo ?? 0}
      halo={marcador.destacado === true}
    />
  );
}

/**
 * El retículo de «mueve el mapa, no el pin».
 *
 * Va fijo en el centro de la pantalla, no sobre una coordenada: es el gesto que
 * usan las aplicaciones de movilidad y el que ya tenía el diseño aprobado.
 */
/**
 * El punto de mira de «elige moviendo el mapa».
 *
 * `aireInferior` es el mismo que el mapa recibe como `mapPadding`: el hueco
 * que se le reserva abajo a la hoja. El mapa reporta como centro el de su
 * rectángulo ÚTIL --el que queda por encima de ese hueco-- así que el punto de
 * mira tiene que subir lo mismo. Sin esto señalaba un sitio y se confirmaba
 * otro, o se quedaba escondido detrás de la hoja.
 */
export function ReticulaCentral({ aireInferior = 0 }: { readonly aireInferior?: number }) {
  const tema = useTema();

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <View style={{
        // Centrado en el área útil: un margen abajo de `aire` sube el punto la
        // mitad de ese aire, que es justo lo que hace `mapPadding`.
        marginBottom: aireInferior,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: tema.color.acento,
        borderWidth: 3,
        borderColor: tema.color.fondo
      }} />
    </View>
  );
}
