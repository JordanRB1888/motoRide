/**
 * Iconografía propia, dibujada con vistas.
 *
 * POR QUÉ NO SE USA UNA LIBRERÍA
 *
 * Se intentó instalar `@expo/vector-icons`, la solución oficial, y **declara
 * incompatibilidad con `react@19.2.3`** — el mismo motivo por el que se descartó
 * AsyncStorage en la fundación. No se fuerza con `--legacy-peer-deps` una
 * dependencia que dice no soportar la versión de React del proyecto.
 *
 * Y resulta que conviene: los sets conocidos se reconocen al instante como
 * «iconos de aplicación», y esta fase trata precisamente de que +58express no
 * parezca una plantilla. Una familia propia, geométrica y de trazo uniforme, da
 * carácter y no pesa nada — son vistas, no fuentes ni SVG.
 *
 * REGLAS DE LA FAMILIA
 *
 * · un solo grosor de trazo, proporcional al tamaño;
 * · formas geométricas simples: círculo, cuadrado redondeado, línea;
 * · nada de relleno salvo cuando el icono está activo;
 * · `accessibilityElementsHidden`: son decorativos, y quien los rodea ya lleva
 *   la etiqueta. Un lector de pantalla que anuncie «icono» no ayuda a nadie.
 */

import { StyleSheet, View } from 'react-native';

export const NOMBRES_DE_ICONO = [
  'inicio',
  'destino',
  'viajes',
  'perfil',
  'moto',
  'escudo',
  'reloj',
  'rayo'
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
  const comun = { width: tamano, height: tamano };

  return (
    <View style={[estilos.marco, comun]} accessibilityElementsHidden importantForAccessibility="no">
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

function dibujar(nombre: NombreDeIcono, t: Trazado) {
  switch (nombre) {
    // Un tejado sobre una base: casa reducida a lo mínimo reconocible.
    case 'inicio':
      return (
        <>
          <View style={{
            width: t.tamano * 0.62, height: t.tamano * 0.62,
            borderWidth: t.trazo, borderColor: t.color,
            borderRadius: t.trazo, transform: [{ rotate: '45deg' }],
            position: 'absolute', top: -t.tamano * 0.12
          }} />
          <View style={{
            width: t.tamano * 0.66, height: t.tamano * 0.42,
            borderWidth: t.trazo, borderColor: t.color,
            borderRadius: t.trazo * 1.5,
            backgroundColor: t.activo ? t.color : 'transparent',
            position: 'absolute', bottom: t.tamano * 0.08
          }} />
        </>
      );

    // Gota de mapa: círculo con punta.
    case 'destino':
      return (
        <>
          <View style={{
            width: t.tamano * 0.6, height: t.tamano * 0.6,
            borderRadius: t.tamano * 0.3,
            borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent',
            position: 'absolute', top: t.tamano * 0.04
          }} />
          <View style={{
            width: t.trazo * 2, height: t.tamano * 0.26,
            backgroundColor: t.color, borderRadius: t.trazo,
            position: 'absolute', bottom: t.tamano * 0.04
          }} />
        </>
      );

    // Tres líneas de distinta longitud: una lista de viajes.
    case 'viajes':
      return (
        <View style={{ width: t.tamano * 0.72, gap: t.tamano * 0.14 }}>
          {[1, 0.72, 0.86].map((ancho, indice) => (
            <View key={indice} style={{
              width: `${ancho * 100}%`, height: t.trazo * 1.4,
              backgroundColor: t.color, borderRadius: t.trazo,
              opacity: t.activo ? 1 : 0.85
            }} />
          ))}
        </View>
      );

    // Cabeza y hombros.
    case 'perfil':
      return (
        <>
          <View style={{
            width: t.tamano * 0.36, height: t.tamano * 0.36,
            borderRadius: t.tamano * 0.18,
            borderWidth: t.trazo, borderColor: t.color,
            backgroundColor: t.activo ? t.color : 'transparent',
            position: 'absolute', top: t.tamano * 0.08
          }} />
          <View style={{
            width: t.tamano * 0.68, height: t.tamano * 0.34,
            borderTopLeftRadius: t.tamano * 0.34, borderTopRightRadius: t.tamano * 0.34,
            borderWidth: t.trazo, borderBottomWidth: 0, borderColor: t.color,
            position: 'absolute', bottom: t.tamano * 0.06
          }} />
        </>
      );

    // Dos ruedas y el manillar: mototaxi, que es de lo que va esto.
    case 'moto':
      return (
        <>
          <View style={{
            width: t.tamano * 0.3, height: t.tamano * 0.3,
            borderRadius: t.tamano * 0.15, borderWidth: t.trazo, borderColor: t.color,
            position: 'absolute', left: 0, bottom: t.tamano * 0.1
          }} />
          <View style={{
            width: t.tamano * 0.3, height: t.tamano * 0.3,
            borderRadius: t.tamano * 0.15, borderWidth: t.trazo, borderColor: t.color,
            position: 'absolute', right: 0, bottom: t.tamano * 0.1
          }} />
          <View style={{
            width: t.tamano * 0.44, height: t.trazo * 1.4,
            backgroundColor: t.color, borderRadius: t.trazo,
            position: 'absolute', top: t.tamano * 0.34,
            transform: [{ rotate: '-16deg' }]
          }} />
        </>
      );

    // Escudo: seguridad, sin cruces ni símbolos.
    case 'escudo':
      return (
        <View style={{
          width: t.tamano * 0.62, height: t.tamano * 0.72,
          borderWidth: t.trazo, borderColor: t.color,
          borderTopLeftRadius: t.trazo * 2, borderTopRightRadius: t.trazo * 2,
          borderBottomLeftRadius: t.tamano * 0.31, borderBottomRightRadius: t.tamano * 0.31,
          backgroundColor: t.activo ? t.color : 'transparent'
        }} />
      );

    // Reloj: círculo con dos agujas.
    case 'reloj':
      return (
        <View style={{
          width: t.tamano * 0.72, height: t.tamano * 0.72,
          borderRadius: t.tamano * 0.36, borderWidth: t.trazo, borderColor: t.color,
          alignItems: 'center', justifyContent: 'center'
        }}>
          <View style={{
            width: t.trazo, height: t.tamano * 0.2, backgroundColor: t.color,
            borderRadius: t.trazo, position: 'absolute', top: t.tamano * 0.12
          }} />
          <View style={{
            width: t.tamano * 0.18, height: t.trazo, backgroundColor: t.color,
            borderRadius: t.trazo, position: 'absolute', right: t.tamano * 0.12
          }} />
        </View>
      );

    // Rayo: velocidad. Dos triángulos enfrentados.
    case 'rayo':
      return (
        <>
          <View style={{
            width: 0, height: 0, position: 'absolute', top: 0,
            borderLeftWidth: t.tamano * 0.2, borderRightWidth: t.tamano * 0.08,
            borderBottomWidth: t.tamano * 0.42,
            borderLeftColor: 'transparent', borderRightColor: 'transparent',
            borderBottomColor: t.color
          }} />
          <View style={{
            width: 0, height: 0, position: 'absolute', bottom: 0,
            borderLeftWidth: t.tamano * 0.08, borderRightWidth: t.tamano * 0.2,
            borderTopWidth: t.tamano * 0.42,
            borderLeftColor: 'transparent', borderRightColor: 'transparent',
            borderTopColor: t.color
          }} />
        </>
      );

    default:
      return null;
  }
}

const estilos = StyleSheet.create({
  marco: { alignItems: 'center', justifyContent: 'center' }
});
