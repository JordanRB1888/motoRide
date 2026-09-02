/**
 * Los iconos del formulario de acceso.
 *
 * POR QUÉ NO ESTÁN EN `Icono.tsx`
 *
 * Aquél es el juego de la aplicación —inicio, viajes, perfil, moto—, dibujado
 * con un grosor de trazo relativo y pensado para la barra y las tarjetas.
 * Éstos son cuatro adornos de un formulario: viven dentro de un campo, a un
 * tamaño fijo, y no forman familia con los otros. Meterlos allí habría
 * obligado a ampliar la lista de nombres y las guardas que la vigilan para
 * ganar nada.
 *
 * Sin SVG: React Native no lo trae, así que se componen con vistas y bordes.
 * Es lo mismo que hace el juego principal.
 *
 * Ninguno lleva texto ni etiqueta: son decoración. Lo que se lee en voz alta
 * lo dice el campo o el botón que los contiene.
 */

import { View } from 'react-native';

const OCULTO = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no' as const
};

/** El sobre del correo: la caja y la solapa en «V». */
export function IconoDeCorreo({ tamano = 20, color }: {
  readonly tamano?: number;
  readonly color: string;
}) {
  const ancho = tamano;
  const alto = tamano * 0.76;
  const trazo = Math.max(1.4, tamano / 14);
  // La solapa: dos lineas que van de cada esquina de arriba al vertice del
  // centro. Se calculan, no se aproximan: `transformOrigin` no llega a todas
  // las versiones —sin el, la solapa no se dibujaba y el sobre quedaba en un
  // rectangulo vacio—, asi que cada linea gira sobre SU centro y se coloca
  // donde ese centro tiene que caer.
  const vertice = { x: ancho / 2, y: alto * 0.52 };
  const largo = Math.hypot(vertice.x, vertice.y);
  const angulo = (Math.atan2(vertice.y, vertice.x) * 180) / Math.PI;

  return (
    <View {...OCULTO} style={{ width: ancho, height: alto, justifyContent: 'center' }}>
      <View style={{
        width: ancho, height: alto,
        borderWidth: trazo, borderColor: color, borderRadius: 3,
        overflow: 'hidden'
      }}>
        {[-1, 1].map(lado => (
          <View
            key={lado}
            style={{
              position: 'absolute',
              width: largo,
              height: trazo,
              backgroundColor: color,
              left: (lado === -1 ? vertice.x / 2 : ancho - vertice.x / 2) - largo / 2 - trazo,
              top: vertice.y / 2 - trazo / 2 - trazo,
              transform: [{ rotate: `${lado * angulo}deg` }]
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** El candado: el arco encima del cuerpo. */
export function IconoDeCandado({ tamano = 20, color }: {
  readonly tamano?: number;
  readonly color: string;
}) {
  const cuerpoAncho = tamano * 0.78;
  const cuerpoAlto = tamano * 0.56;
  const arcoAncho = cuerpoAncho * 0.62;
  const arcoAlto = tamano * 0.42;
  const trazo = Math.max(1.4, tamano / 14);

  return (
    <View {...OCULTO} style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* El arco: una caja con los bordes de arriba y los lados, muy
          redondeada por arriba y abierta por abajo. */}
      <View style={{
        width: arcoAncho,
        height: arcoAlto + trazo,
        borderWidth: trazo,
        borderBottomWidth: 0,
        borderColor: color,
        borderTopLeftRadius: arcoAncho / 2,
        borderTopRightRadius: arcoAncho / 2,
        marginBottom: -trazo
      }} />
      <View style={{
        width: cuerpoAncho,
        height: cuerpoAlto,
        borderWidth: trazo,
        borderColor: color,
        borderRadius: 3
      }} />
    </View>
  );
}

/**
 * El ojo de «ver la contraseña».
 *
 * La lente es un cuadrado girado con dos esquinas opuestas redondeadas del
 * todo: es la forma de almendra, y sale sin curvas de verdad. Cuando la
 * contraseña está a la vista, el ojo se tacha.
 */
export function IconoDeOjo({ tamano = 20, color, tachado = false }: {
  readonly tamano?: number;
  readonly color: string;
  readonly tachado?: boolean;
}) {
  const lado = tamano * 0.62;
  const trazo = Math.max(1.4, tamano / 14);
  const pupila = tamano * 0.2;

  return (
    <View {...OCULTO} style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: lado,
        height: lado,
        borderWidth: trazo,
        borderColor: color,
        borderTopLeftRadius: lado,
        borderBottomRightRadius: lado,
        transform: [{ rotate: '45deg' }],
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <View style={{
          width: pupila, height: pupila, borderRadius: pupila / 2,
          backgroundColor: color
        }} />
      </View>

      {tachado ? (
        <View style={{
          position: 'absolute',
          width: tamano * 1.05,
          height: trazo,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }]
        }} />
      ) : null}
    </View>
  );
}

/** La flecha del botón: el asta y la punta. */
export function FlechaDerecha({ tamano = 18, color }: {
  readonly tamano?: number;
  readonly color: string;
}) {
  const trazo = Math.max(1.6, tamano / 10);
  const punta = tamano * 0.4;

  return (
    <View {...OCULTO} style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: tamano * 0.82,
        height: trazo,
        borderRadius: trazo,
        backgroundColor: color
      }} />
      <View style={{
        position: 'absolute',
        right: tamano * 0.1,
        width: punta,
        height: punta,
        borderRightWidth: trazo,
        borderTopWidth: trazo,
        borderColor: color,
        transform: [{ rotate: '45deg' }]
      }} />
    </View>
  );
}
