/**
 * La familia de iconos de +58express.
 *
 * DIBUJADOS CON VISTAS, POR NECESIDAD
 *
 * Lo suyo sería SVG. Se intentó instalar `react-native-svg` y **no se puede**:
 * el árbol de dependencias tiene `react-dom@19.2.8` exigiendo una versión de
 * React distinta de la que trae Expo SDK 57, y npm no resuelve. Es el **cuarto**
 * choque del ecosistema de Expo con `react@19.2.3`, después de AsyncStorage,
 * `react-native-web` y `@expo/vector-icons`. No se fuerza con
 * `--legacy-peer-deps`.
 *
 * Así que se dibujan con vistas. Eso tiene un techo —no hay curvas libres— y
 * hay que trabajar dentro de él en lugar de fingir que no existe:
 *
 *   · los triángulos salen del truco de los bordes: una vista de tamaño cero
 *     con dos bordes transparentes y uno de color
 *   · los arcos, de esquinas redondeadas con lados sin pintar
 *   · el símbolo del dólar es TEXTO, porque una «S» con rectángulos no es una
 *     «S»; el sistema ya sabe dibujarla y se ve bien a cualquier tamaño
 *
 * QUÉ SE APRENDIÓ DE LA PRIMERA VERSIÓN
 *
 * «Inicio» era un cuadrado girado 45° sobre otro cuadrado, y en pantalla se
 * leía como un rombo. La silueta de una casa no es un rombo encima de una caja:
 * es un TRIÁNGULO encima de una caja, y con el truco de los bordes sale.
 *
 * Todos comparten grosor de trazo relativo al tamaño, así que a 16 o a 24
 * puntos la familia se sigue viendo igual de pesada.
 */

import { StyleSheet, Text, View } from 'react-native';

export const NOMBRES_DE_ICONO = [
  'inicio',
  'destino',
  'viajes',
  'perfil',
  'moto',
  'escudo',
  'reloj',
  'rayo',
  'maletin',
  'campana',
  'ajustes',
  'dolar'
] as const;
export type NombreDeIcono = (typeof NOMBRES_DE_ICONO)[number];

export interface PropiedadesDeIcono {
  readonly nombre: NombreDeIcono;
  readonly color: string;
  readonly tamano?: number;
  /** Relleno sólido para el estado seleccionado. */
  readonly activo?: boolean;
}

export function Icono({ nombre, color, tamano = 24, activo = false }: PropiedadesDeIcono) {
  const trazo = Math.max(1.5, tamano / 12);

  return (
    <View
      style={[estilos.marco, { width: tamano, height: tamano }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {dibujar(nombre, { tamano, trazo, color, activo })}
    </View>
  );
}

interface Trazado {
  readonly tamano: number;
  readonly trazo: number;
  readonly color: string;
  readonly activo: boolean;
}

/**
 * Un triángulo apuntando hacia arriba.
 *
 * El truco de los bordes: una vista sin tamaño donde los bordes izquierdo y
 * derecho son transparentes y el de abajo lleva el color. Es la única forma de
 * conseguir una diagonal sin SVG.
 */
function Triangulo({ base, alto, color }: {
  readonly base: number;
  readonly alto: number;
  readonly color: string;
}) {
  return (
    <View style={{
      width: 0,
      height: 0,
      borderLeftWidth: base / 2,
      borderRightWidth: base / 2,
      borderBottomWidth: alto,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: color,
      backgroundColor: 'transparent'
    }} />
  );
}

function dibujar(nombre: NombreDeIcono, t: Trazado) {
  switch (nombre) {
    // Casa: tejado triangular sobre el cuerpo. Antes era un cuadrado girado 45°
    // y se leía como un rombo — que es exactamente lo que era.
    case 'inicio':
      return (
        <>
          <View style={{ position: 'absolute', top: t.tamano * 0.11 }}>
            <Triangulo base={t.tamano * 0.84} alto={t.tamano * 0.4} color={t.color} />
          </View>
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.13,
            width: t.tamano * 0.6,
            height: t.tamano * 0.36,
            backgroundColor: t.activo ? t.color : 'transparent',
            borderWidth: t.trazo,
            borderTopWidth: 0,
            borderColor: t.color
          }} />
          {/* La puerta. Sin ella, la casa apagada es un triángulo sobre una
              caja vacía y podría ser un icono de subir un archivo. */}
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.13,
            width: t.tamano * 0.19,
            height: t.tamano * 0.18,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.activo ? '#00000000' : t.color,
            backgroundColor: t.activo ? '#00000055' : 'transparent'
          }} />
        </>
      );

    // Gota de mapa: círculo con punta abajo.
    case 'destino':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.06,
            width: t.tamano * 0.6,
            height: t.tamano * 0.6,
            borderRadius: t.tamano * 0.3,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.09,
            transform: [{ rotate: '180deg' }]
          }}>
            <Triangulo base={t.tamano * 0.32} alto={t.tamano * 0.26} color={t.color} />
          </View>
        </>
      );

    // Historial: tres renglones de distinto largo. Los largos desiguales son lo
    // que lo distingue de tres rayas iguales, que serían un menú.
    case 'viajes':
      return (
        <>
          {[
            { ancho: 0.74, arriba: 0.24 },
            { ancho: 0.54, arriba: 0.46 },
            { ancho: 0.66, arriba: 0.68 }
          ].map(renglon => (
            <View key={renglon.arriba} style={{
              position: 'absolute',
              top: t.tamano * renglon.arriba,
              left: t.tamano * 0.13,
              width: t.tamano * renglon.ancho,
              height: t.trazo,
              borderRadius: t.trazo,
              backgroundColor: t.color
            }} />
          ))}
        </>
      );

    // Persona: cabeza y hombros.
    case 'perfil':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.11,
            width: t.tamano * 0.36,
            height: t.tamano * 0.36,
            borderRadius: t.tamano * 0.18,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.09,
            width: t.tamano * 0.68,
            height: t.tamano * 0.32,
            borderTopLeftRadius: t.tamano * 0.34,
            borderTopRightRadius: t.tamano * 0.34,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
        </>
      );

    // Dinero: el símbolo, en texto.
    //
    // Una «S» hecha con rectángulos no es una «S». El sistema ya sabe dibujarla
    // y se ve bien a cualquier tamaño; usar tipografía aquí no es hacer trampa,
    // es usar la herramienta que corresponde.
    case 'dolar':
      return (
        <>
          <View style={{
            position: 'absolute',
            width: t.tamano * 0.84,
            height: t.tamano * 0.84,
            borderRadius: t.tamano * 0.42,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <Text style={{
            color: t.activo ? '#0b0a09' : t.color,
            fontSize: t.tamano * 0.52,
            lineHeight: t.tamano * 0.66,
            fontWeight: '700',
            includeFontPadding: false
          }}>
            $
          </Text>
        </>
      );

    /**
     * Moto.
     *
     * Dos ruedas y un cuadro son una BICICLETA, que es lo que parecía antes.
     * Lo que distingue una moto en trazo es el manillar alto y el depósito: sin
     * esas dos piezas no hay forma de saber cuál de las dos es.
     *
     * Se dibuja con vistas porque esta familia no usa SVG. Cada barra es una
     * línea girada, y las medidas van en fracciones del tamaño para que el
     * glifo aguante a 15 y a 24 puntos.
     */
    case 'moto': {
      const barra = (clave: string, x: number, y: number, largo: number, giro: number) => (
        <View
          key={clave}
          style={{
            position: 'absolute',
            left: t.tamano * x,
            top: t.tamano * y,
            width: t.tamano * largo,
            height: t.trazo,
            borderRadius: t.trazo,
            backgroundColor: t.color,
            transform: [{ rotate: `${giro}deg` }]
          }}
        />
      );

      return (
        <>
          {/* Las dos ruedas */}
          {[0.06, 0.64].map(x => (
            <View key={x} style={{
              position: 'absolute',
              bottom: t.tamano * 0.06,
              left: t.tamano * x,
              width: t.tamano * 0.3,
              height: t.tamano * 0.3,
              borderRadius: t.tamano * 0.15,
              borderWidth: t.trazo,
              borderColor: t.color,
              backgroundColor: t.activo ? t.color : 'transparent'
            }} />
          ))}

          {/* El depósito y el asiento: la línea larga de arriba */}
          {barra('deposito', 0.3, 0.47, 0.32, 0)}
          {/* El chasis, de la rueda trasera al depósito */}
          {barra('chasis', 0.17, 0.62, 0.22, -38)}
          {/* La horquilla, del depósito al manillar */}
          {barra('horquilla', 0.58, 0.38, 0.2, -62)}
          {/* El manillar */}
          {barra('manillar', 0.6, 0.28, 0.18, 0)}
          {/* De la horquilla a la rueda delantera */}
          {barra('tijera', 0.63, 0.52, 0.3, 72)}
        </>
      );
    }

    // Escudo: cuerpo recto arriba y redondeado hacia la punta.
    case 'escudo':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.11,
            width: t.tamano * 0.64,
            height: t.tamano * 0.44,
            borderTopLeftRadius: t.trazo * 2,
            borderTopRightRadius: t.trazo * 2,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.11,
            width: t.tamano * 0.64,
            height: t.tamano * 0.34,
            borderBottomLeftRadius: t.tamano * 0.32,
            borderBottomRightRadius: t.tamano * 0.32,
            borderWidth: t.trazo,
            borderTopWidth: 0,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
        </>
      );

    // Reloj: esfera y dos agujas.
    case 'reloj':
      return (
        <>
          <View style={{
            position: 'absolute',
            width: t.tamano * 0.78,
            height: t.tamano * 0.78,
            borderRadius: t.tamano * 0.39,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.29,
            width: t.trazo,
            height: t.tamano * 0.22,
            borderRadius: t.trazo,
            backgroundColor: t.activo ? '#0b0a09' : t.color
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.48,
            left: t.tamano * 0.5,
            width: t.tamano * 0.17,
            height: t.trazo,
            borderRadius: t.trazo,
            backgroundColor: t.activo ? '#0b0a09' : t.color
          }} />
        </>
      );

    // Rayo: dos triángulos opuestos y desplazados.
    case 'rayo':
      return (
        <>
          <View style={{ position: 'absolute', top: t.tamano * 0.08, left: t.tamano * 0.26 }}>
            <Triangulo base={t.tamano * 0.44} alto={t.tamano * 0.44} color={t.color} />
          </View>
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.08,
            right: t.tamano * 0.26,
            transform: [{ rotate: '180deg' }]
          }}>
            <Triangulo base={t.tamano * 0.44} alto={t.tamano * 0.44} color={t.color} />
          </View>
        </>
      );

    // Maletín: asa sobre el cuerpo. Hace pareja con la casa en los sitios
    // guardados, así que comparte proporciones.
    case 'maletin':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.15,
            width: t.tamano * 0.32,
            height: t.tamano * 0.16,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.color,
            borderTopLeftRadius: t.trazo * 2,
            borderTopRightRadius: t.trazo * 2
          }} />
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.15,
            width: t.tamano * 0.76,
            height: t.tamano * 0.48,
            borderRadius: t.trazo * 2,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
        </>
      );

    // Campana: cuerpo acampanado, base y badajo.
    case 'campana':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.15,
            width: t.tamano * 0.56,
            height: t.tamano * 0.46,
            borderTopLeftRadius: t.tamano * 0.28,
            borderTopRightRadius: t.tamano * 0.28,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.61,
            width: t.tamano * 0.74,
            height: t.trazo,
            borderRadius: t.trazo,
            backgroundColor: t.color
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.68,
            width: t.tamano * 0.2,
            height: t.tamano * 0.13,
            borderWidth: t.trazo,
            borderTopWidth: 0,
            borderColor: t.color,
            borderBottomLeftRadius: t.tamano * 0.1,
            borderBottomRightRadius: t.tamano * 0.1
          }} />
        </>
      );

    // Ajustes: tres carriles con su mando. Deslizadores y no un engranaje: un
    // engranaje a este tamaño y con vistas se convierte en una mancha.
    case 'ajustes':
      return (
        <>
          {[
            { alto: 0.26, mando: 0.6 },
            { alto: 0.5, mando: 0.26 },
            { alto: 0.74, mando: 0.64 }
          ].map(carril => (
            <View key={carril.alto}>
              <View style={{
                position: 'absolute',
                top: t.tamano * carril.alto,
                left: t.tamano * 0.13,
                width: t.tamano * 0.74,
                height: t.trazo,
                borderRadius: t.trazo,
                backgroundColor: t.color
              }} />
              <View style={{
                position: 'absolute',
                top: t.tamano * carril.alto - t.trazo * 1.4,
                left: t.tamano * carril.mando,
                width: t.trazo * 3.4,
                height: t.trazo * 3.4,
                borderRadius: t.trazo * 1.7,
                borderWidth: t.trazo,
                borderColor: t.color,
                backgroundColor: t.activo ? t.color : '#0b0a09'
              }} />
            </View>
          ))}
        </>
      );
  }
}

const estilos = StyleSheet.create({
  marco: { alignItems: 'center', justifyContent: 'center' }
});
