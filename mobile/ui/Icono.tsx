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
  'dolar',
  'mensaje',
  'imagen',
  'volante',
  'lapiz',
  'documento',
  'ayuda',
  'salir',
  'papelera',
  'billetera',
  'buscar',
  'calendario',
  'flecha-arriba',
  'flecha-abajo',
  'servicios',
  'telefono',
  'mas'
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
      style={[estilos.marco, { width: tamano, height: tamano, position: 'relative' }]}
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

    // Escudo / Seguridad: candado con arco superior y cerradura.
    case 'escudo':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.10,
            width: t.tamano * 0.42,
            height: t.tamano * 0.38,
            borderTopLeftRadius: t.tamano * 0.21,
            borderTopRightRadius: t.tamano * 0.21,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.color
          }} />
          <View style={{
            position: 'absolute',
            bottom: t.tamano * 0.12,
            width: t.tamano * 0.68,
            height: t.tamano * 0.48,
            borderRadius: t.trazo * 2.5,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <View style={{
              width: t.trazo * 1.3,
              height: t.tamano * 0.16,
              borderRadius: t.trazo * 0.65,
              backgroundColor: t.activo ? '#0b0a09' : t.color
            }} />
          </View>
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

    // Campana: corona superior, cuerpo esbelto acampanado, base y badajo.
    case 'campana':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.08,
            width: t.tamano * 0.22,
            height: t.tamano * 0.16,
            borderRadius: t.tamano * 0.08,
            borderWidth: t.trazo * 0.9,
            borderColor: t.color,
            borderBottomWidth: 0
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.18,
            width: t.tamano * 0.60,
            height: t.tamano * 0.50,
            borderTopLeftRadius: t.tamano * 0.30,
            borderTopRightRadius: t.tamano * 0.30,
            borderWidth: t.trazo,
            borderBottomWidth: 0,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.68,
            width: t.tamano * 0.78,
            height: t.trazo * 1.1,
            borderRadius: t.trazo,
            backgroundColor: t.color
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.73,
            width: t.tamano * 0.24,
            height: t.tamano * 0.16,
            borderWidth: t.trazo,
            borderTopWidth: 0,
            borderColor: t.color,
            borderBottomLeftRadius: t.tamano * 0.12,
            borderBottomRightRadius: t.tamano * 0.12,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
        </>
      );

    // Ajustes: dos deslizadores horizontales perfectamente alineados y centrados.
    case 'ajustes':
      return (
        <>
          {/* Pista superior */}
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.33,
            left: t.tamano * 0.12,
            width: t.tamano * 0.76,
            height: t.trazo,
            borderRadius: t.trazo,
            backgroundColor: t.color
          }} />
          {/* Pomo superior a la derecha */}
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.33 - t.tamano * 0.09,
            left: t.tamano * 0.58,
            width: t.tamano * 0.22,
            height: t.tamano * 0.22,
            borderRadius: t.tamano * 0.11,
            backgroundColor: t.color
          }} />

          {/* Pista inferior */}
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.65,
            left: t.tamano * 0.12,
            width: t.tamano * 0.76,
            height: t.trazo,
            borderRadius: t.trazo,
            backgroundColor: t.color
          }} />
          {/* Pomo inferior a la izquierda */}
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.65 - t.tamano * 0.09,
            left: t.tamano * 0.20,
            width: t.tamano * 0.22,
            height: t.tamano * 0.22,
            borderRadius: t.tamano * 0.11,
            backgroundColor: t.color
          }} />
        </>
      );

    // Volante: aro exterior, buje central y radios (conductor).
    case 'volante':
      return (
        <>
          <View style={{
            position: 'absolute',
            width: t.tamano * 0.82,
            height: t.tamano * 0.82,
            borderRadius: t.tamano * 0.41,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? `${t.color}22` : 'transparent'
          }} />
          <View style={{
            position: 'absolute',
            width: t.tamano * 0.28,
            height: t.tamano * 0.28,
            borderRadius: t.tamano * 0.14,
            backgroundColor: t.color
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.41 - t.trazo / 2,
            left: t.tamano * 0.09,
            width: t.tamano * 0.27,
            height: t.trazo,
            backgroundColor: t.color
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.41 - t.trazo / 2,
            right: t.tamano * 0.09,
            width: t.tamano * 0.27,
            height: t.trazo,
            backgroundColor: t.color
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.41,
            bottom: t.tamano * 0.09,
            width: t.trazo,
            backgroundColor: t.color
          }} />
        </>
      );

    // Una fotografía: el marco con su montaña y su sol.
    //
    // Los dos elementos hacen falta. Sólo el marco es un rectángulo, y sólo la
    // montaña no se entiende sin algo que la encuadre.
    case 'imagen':
      return (
        <>
          <View style={{
            position: 'absolute',
            width: t.tamano * 0.8,
            height: t.tamano * 0.66,
            borderRadius: t.tamano * 0.14,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent',
            overflow: 'hidden'
          }} />
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.27,
            left: t.tamano * 0.28,
            width: t.tamano * 0.13,
            height: t.tamano * 0.13,
            borderRadius: t.tamano * 0.07,
            backgroundColor: t.activo ? '#00000066' : t.color
          }} />
          {/* La montaña asoma por detrás del borde de abajo. */}
          <View style={{ position: 'absolute', bottom: t.tamano * 0.18, right: t.tamano * 0.22 }}>
            <Triangulo
              base={t.tamano * 0.44}
              alto={t.tamano * 0.26}
              color={t.activo ? '#00000066' : t.color}
            />
          </View>
        </>
      );

    // Burbuja de conversación: el rectángulo con la cola abajo a la izquierda.
    //
    // La cola es lo que la hace burbuja. Sin ella, un rectángulo redondeado con
    // dos rayas dentro se lee igual de bien como «documento» o «lista», y este
    // icono tiene que decir «aquí se habló» de un vistazo.
    case 'mensaje':
      return (
        <>
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.16,
            width: t.tamano * 0.78,
            height: t.tamano * 0.56,
            borderRadius: t.tamano * 0.17,
            borderWidth: t.trazo,
            borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          {/* Apoyada en el borde de abajo y medio punto por dentro, para que
              se lea como una sola silueta y no como dos piezas pegadas. */}
          <View style={{
            position: 'absolute',
            top: t.tamano * 0.70,
            left: t.tamano * 0.26,
            width: 0,
            height: 0,
            borderLeftWidth: t.tamano * 0.09,
            borderRightWidth: t.tamano * 0.09,
            borderTopWidth: t.tamano * 0.15,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: t.color
          }} />
          {/* Dos rayas: lo que convierte la burbuja vacía en conversación. */}
          {[0.34, 0.48].map(alto => (
            <View
              key={alto}
              style={{
                position: 'absolute',
                top: t.tamano * alto,
                left: t.tamano * 0.28,
                width: t.tamano * (alto === 0.34 ? 0.44 : 0.30),
                height: t.trazo * 0.8,
                borderRadius: t.trazo,
                backgroundColor: t.activo ? '#00000066' : t.color
              }}
            />
          ))}
        </>
      );

    // Lápiz: cuerpo diagonal, goma y punta. La inclinación comunica edición.
    case 'lapiz':
      return (
        <>
          <View style={{
            position: 'absolute', width: t.tamano * 0.68, height: t.tamano * 0.22,
            borderRadius: t.trazo, borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent',
            transform: [{ rotate: '-45deg' }]
          }} />
          <View style={{
            position: 'absolute', right: t.tamano * 0.12, top: t.tamano * 0.13,
            width: t.tamano * 0.19, height: t.tamano * 0.19,
            borderRadius: t.trazo, backgroundColor: t.color,
            transform: [{ rotate: '-45deg' }]
          }} />
        </>
      );

    // Hoja con renglones: documentos, condiciones y licencias.
    case 'documento':
      return (
        <>
          <View style={{
            position: 'absolute', width: t.tamano * 0.68, height: t.tamano * 0.82,
            borderRadius: t.trazo * 1.5, borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? `${t.color}22` : 'transparent'
          }} />
          {[0.38, 0.53, 0.68].map((arriba, indice) => (
            <View key={arriba} style={{
              position: 'absolute', top: t.tamano * arriba, left: t.tamano * 0.27,
              width: t.tamano * (indice === 2 ? 0.3 : 0.45), height: t.trazo,
              borderRadius: t.trazo, backgroundColor: t.color
            }} />
          ))}
        </>
      );

    // Ayuda: círculo y signo inequívoco, legible también a 18 puntos.
    case 'ayuda':
      return (
        <View style={{
          width: t.tamano * 0.82, height: t.tamano * 0.82,
          borderRadius: t.tamano * 0.41, borderWidth: t.trazo, borderColor: t.color,
          backgroundColor: t.activo ? t.color : 'transparent',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <Text style={{
            color: t.activo ? '#0b0a09' : t.color,
            fontSize: t.tamano * 0.55, lineHeight: t.tamano * 0.65,
            fontWeight: '800', includeFontPadding: false
          }}>?</Text>
        </View>
      );

    // Salida: marco abierto y flecha que abandona la cuenta.
    case 'salir':
      return (
        <>
          <View style={{
            position: 'absolute', left: t.tamano * 0.12,
            width: t.tamano * 0.5, height: t.tamano * 0.76,
            borderWidth: t.trazo, borderRightWidth: 0, borderColor: t.color,
            borderTopLeftRadius: t.trazo * 2, borderBottomLeftRadius: t.trazo * 2
          }} />
          <View style={{ position: 'absolute', left: t.tamano * 0.35, width: t.tamano * 0.48, height: t.trazo, backgroundColor: t.color }} />
          <View style={{
            position: 'absolute', right: t.tamano * 0.12,
            width: t.tamano * 0.25, height: t.tamano * 0.25,
            borderTopWidth: t.trazo, borderRightWidth: t.trazo, borderColor: t.color,
            transform: [{ rotate: '45deg' }]
          }} />
        </>
      );

    // Papelera contenida: tapa, asa y cuerpo. Sin gesto juguetón.
    case 'papelera':
      return (
        <>
          <View style={{
            position: 'absolute', bottom: t.tamano * 0.1,
            width: t.tamano * 0.58, height: t.tamano * 0.58,
            borderWidth: t.trazo, borderTopWidth: 0, borderColor: t.color,
            borderBottomLeftRadius: t.trazo * 2, borderBottomRightRadius: t.trazo * 2
          }} />
          <View style={{ position: 'absolute', top: t.tamano * 0.27, width: t.tamano * 0.76, height: t.trazo, backgroundColor: t.color }} />
          <View style={{
            position: 'absolute', top: t.tamano * 0.14,
            width: t.tamano * 0.28, height: t.tamano * 0.14,
            borderWidth: t.trazo, borderBottomWidth: 0, borderColor: t.color,
            borderTopLeftRadius: t.trazo * 2, borderTopRightRadius: t.trazo * 2
          }} />
        </>
      );

    // Billetera: cuerpo y broche lateral.
    case 'billetera':
      return (
        <>
          <View style={{
            position: 'absolute', width: t.tamano * 0.82, height: t.tamano * 0.62,
            borderRadius: t.tamano * 0.12, borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? `${t.color}22` : 'transparent'
          }} />
          <View style={{
            position: 'absolute', right: t.tamano * 0.04,
            width: t.tamano * 0.36, height: t.tamano * 0.25,
            borderRadius: t.tamano * 0.08, borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent'
          }} />
          <View style={{ position: 'absolute', right: t.tamano * 0.18, width: t.trazo * 1.2, height: t.trazo * 1.2, borderRadius: t.trazo, backgroundColor: t.color }} />
        </>
      );

    // Lupa: búsqueda, no historial ni destino.
    case 'buscar':
      return (
        <>
          <View style={{
            position: 'absolute', top: t.tamano * 0.11, left: t.tamano * 0.12,
            width: t.tamano * 0.56, height: t.tamano * 0.56,
            borderRadius: t.tamano * 0.28, borderWidth: t.trazo, borderColor: t.color
          }} />
          <View style={{
            position: 'absolute', bottom: t.tamano * 0.18, right: t.tamano * 0.11,
            width: t.tamano * 0.34, height: t.trazo, borderRadius: t.trazo,
            backgroundColor: t.color, transform: [{ rotate: '45deg' }]
          }} />
        </>
      );

    // Calendario: hoja, lomo y dos anillas.
    case 'calendario':
      return (
        <>
          <View style={{
            position: 'absolute', top: t.tamano * 0.18,
            width: t.tamano * 0.78, height: t.tamano * 0.68,
            borderRadius: t.tamano * 0.1, borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? `${t.color}22` : 'transparent'
          }} />
          <View style={{ position: 'absolute', top: t.tamano * 0.39, width: t.tamano * 0.78, height: t.trazo, backgroundColor: t.color }} />
          {[0.33, 0.67].map(izquierda => (
            <View key={izquierda} style={{ position: 'absolute', top: t.tamano * 0.08, left: t.tamano * izquierda, width: t.trazo, height: t.tamano * 0.22, borderRadius: t.trazo, backgroundColor: t.color }} />
          ))}
        </>
      );

    case 'flecha-arriba':
    case 'flecha-abajo':
      return (
        <>
          <View style={{ position: 'absolute', width: t.trazo, height: t.tamano * 0.66, borderRadius: t.trazo, backgroundColor: t.color }} />
          <View style={{
            position: 'absolute',
            top: nombre === 'flecha-arriba' ? t.tamano * 0.15 : undefined,
            bottom: nombre === 'flecha-abajo' ? t.tamano * 0.15 : undefined,
            width: t.tamano * 0.33, height: t.tamano * 0.33,
            borderTopWidth: t.trazo, borderLeftWidth: t.trazo, borderColor: t.color,
            transform: [{ rotate: nombre === 'flecha-arriba' ? '45deg' : '225deg' }]
          }} />
        </>
      );

    // Servicios / Hub de aplicaciones / Launcher: cuadrícula 2x2 armónica, moderna y simétrica.
    // Cuatro baldosas redondeadas que comunican un hub de aplicaciones y servicios.
    case 'servicios': {
      const ladoBaldosa = t.tamano * 0.33;
      const separacion = t.tamano * 0.12;
      const radioBaldosa = Math.max(2, t.tamano * 0.08);
      const margen = (t.tamano - (ladoBaldosa * 2 + separacion)) / 2;

      return (
        <>
          {[
            { x: margen, y: margen },
            { x: margen + ladoBaldosa + separacion, y: margen },
            { x: margen, y: margen + ladoBaldosa + separacion },
            { x: margen + ladoBaldosa + separacion, y: margen + ladoBaldosa + separacion }
          ].map((pos, idx) => (
            <View
              key={idx}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: ladoBaldosa,
                height: ladoBaldosa,
                borderRadius: radioBaldosa,
                backgroundColor: t.activo ? t.color : 'transparent',
                borderWidth: t.activo ? 0 : t.trazo,
                borderColor: t.color
              }}
            />
          ))}
        </>
      );
    }

    case 'telefono': {
      const ancho = t.tamano * 0.54;
      const alto = t.tamano * 0.84;
      const radio = Math.max(3, t.tamano * 0.12);
      return (
        <View style={{
          position: 'absolute',
          width: ancho,
          height: alto,
          borderRadius: radio,
          borderWidth: t.trazo,
          borderColor: t.color,
          backgroundColor: t.activo ? `${t.color}22` : 'transparent',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Math.max(2, t.trazo * 1.5)
        }}>
          <View style={{ width: ancho * 0.35, height: t.trazo, borderRadius: t.trazo / 2, backgroundColor: t.color }} />
          <View style={{ width: t.trazo * 1.8, height: t.trazo * 1.8, borderRadius: t.trazo, backgroundColor: t.color }} />
        </View>
      );
    }

    case 'mas': {
      const largo = t.tamano * 0.62;
      return (
        <View style={{ position: 'absolute', width: largo, height: largo, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: largo, height: t.trazo, borderRadius: t.trazo / 2, backgroundColor: t.color }} />
          <View style={{ position: 'absolute', width: t.trazo, height: largo, borderRadius: t.trazo / 2, backgroundColor: t.color }} />
        </View>
      );
    }
  }
}

const estilos = StyleSheet.create({
  marco: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  }
});
