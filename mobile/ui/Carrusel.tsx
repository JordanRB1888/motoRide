/**
 * Una fila de tarjetas que se desliza.
 *
 * POR QUÉ EXISTE
 *
 * Había dos filas deslizantes en el inicio —las campañas y los aliados— y cada
 * una se escribía a mano. Se veía: títulos de tamaños distintos, sangrados
 * distintos, y ninguna de las dos decía que se podía deslizar. Una tarjeta
 * cortada por el borde derecho, sin nada que lo explique, se lee como un fallo
 * de maquetación y no como «hay más».
 *
 * EL SANGRADO
 *
 * La fila se sale del margen de la pantalla por la derecha —`marginRight`
 * negativo— y devuelve ese espacio como relleno del contenido. Así la primera
 * tarjeta queda alineada con el resto de la pantalla y la última puede llegar
 * hasta el borde. Sin eso, o el carrusel queda encajonado y se ve estrecho, o
 * la última tarjeta se pega al borde sin aire al final del recorrido.
 *
 * LA FLECHA
 *
 * Aparece sólo cuando queda algo a la derecha y desaparece al llegar al final:
 * una flecha que no lleva a ninguna parte enseña a no hacer caso de las
 * flechas. Y no es sólo un cartel — se toca y avanza, que es lo que espera
 * quien la ve.
 */

import { useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';
import { Txt } from './componentes';
import { useTema } from '../theme/ThemeContext';

export function Carrusel({ titulo, rotulo, accion, onAccion, paso = 238, children }: {
  readonly titulo: string;
  /** Algo que va junto al título, como el rótulo de PUBLICIDAD. */
  readonly rotulo?: ReactNode;
  readonly accion?: string;
  readonly onAccion?: () => void;
  /** Cuánto avanza al tocar la flecha. Una tarjeta y su hueco. */
  readonly paso?: number;
  readonly children: ReactNode;
}) {
  const tema = useTema();
  const riel = useRef<ScrollView>(null);
  const [hayMas, setHayMas] = useState(false);

  // Se guardan en refs y no en estado: cambian en cada fotograma del gesto y
  // no hay nada que repintar por ellos.
  const donde = useRef(0);
  const visible = useRef(0);
  const total = useRef(0);

  function revisar() {
    // Cuatro puntos de tolerancia: el desplazamiento no cae exacto en el final
    // y sin margen la flecha parpadea al soltar.
    setHayMas(donde.current + visible.current < total.current - 4);
  }

  function alDeslizar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    donde.current = evento.nativeEvent.contentOffset.x;
    visible.current = evento.nativeEvent.layoutMeasurement.width;
    total.current = evento.nativeEvent.contentSize.width;
    revisar();
  }

  function alMedir(evento: LayoutChangeEvent) {
    visible.current = evento.nativeEvent.layout.width;
    revisar();
  }

  function alCrecer(ancho: number) {
    total.current = ancho;
    revisar();
  }

  return (
    <View style={{ marginTop: tema.ritmo.entreBloques }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Txt nivel="encabezado" accessibilityRole="header">{titulo}</Txt>
        {rotulo}
        <View style={{ flex: 1 }} />
        {accion !== undefined ? (
          <Pressable
            onPress={onAccion}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Txt nivel="etiqueta" tono="acento">{accion}</Txt>
          </Pressable>
        ) : null}
      </View>

      <View>
        <ScrollView
          ref={riel}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={alDeslizar}
          onLayout={alMedir}
          onContentSizeChange={alCrecer}
          scrollEventThrottle={32}
          style={{ marginTop: 11, marginRight: -tema.ritmo.margenPantalla }}
          contentContainerStyle={{ gap: 10, paddingRight: tema.ritmo.margenPantalla }}
        >
          {children}
        </ScrollView>

        {hayMas ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', right: 2, top: 11, bottom: 0, justifyContent: 'center' }}
          >
            <Pressable
              onPress={() => riel.current?.scrollTo({ x: donde.current + paso, animated: true })}
              accessibilityRole="button"
              accessibilityLabel={`Ver más de ${titulo.toLowerCase()}`}
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tema.color.superficieElevada,
                borderWidth: 1,
                borderColor: tema.color.borde,
                // Sombra propia: flota sobre las tarjetas, y sin ella se lee
                // como un recorte de la tarjeta que tiene debajo.
                shadowColor: '#000000',
                shadowOpacity: 0.34,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 6,
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.93 : 1 }]
              })}
            >
              <Chevron color={tema.color.textoPrimario} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * La punta de flecha.
 *
 * Un cuadrado con dos de sus lados pintados y girado cuarenta y cinco grados.
 * Es la forma de dibujar un ángulo limpio sin traer una biblioteca de gráficos,
 * y escala con el grosor sin deformarse.
 */
function Chevron({ color }: { readonly color: string }) {
  return (
    <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 9,
        height: 9,
        // Dos puntos a la izquierda: girado, el peso visual se va a la derecha
        // y sin corregirlo la flecha parece descentrada dentro del disco.
        marginLeft: -2,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderColor: color,
        transform: [{ rotate: '45deg' }]
      }} />
    </View>
  );
}
