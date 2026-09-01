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
  return marcador.destacado === true ? 62 : 42;
}

/**
 * La pieza de un marcador.
 *
 * Sin posición: la coloca quien la use. Esto sólo dice cómo se ve.
 */
export function PiezaDelMarcador({ marcador }: { readonly marcador: Marcador }) {
  const tema = useTema();

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
export function ReticulaCentral() {
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
