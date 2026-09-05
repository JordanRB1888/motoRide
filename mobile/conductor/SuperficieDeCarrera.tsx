/**
 * La carrera que el conductor ya lleva, mientras la lleva.
 *
 * DÓNDE VIVE Y POR QUÉ
 *
 * En `conductor/`, junto a la superficie de oferta y por el mismo motivo: `ui/`
 * y `preview/` son territorio de la dirección visual. Aquí no se inventa ni un
 * color ni un tamaño; todo sale de `useTema` y de `Txt` y `Boton`, que ya
 * estaban aprobados. Los radios y el aire son los mismos que los de la oferta,
 * para que las dos superficies del conductor se lean como una sola cosa.
 *
 * UN SOLO BOTÓN, EL QUE TOCA
 *
 * Quien conduce mira esto en un semáforo, con casco y con una mano. No hay
 * menú, ni tres acciones a la vez, ni nada que obligue a elegir: el estado del
 * viaje decide cuál es el único botón posible, y ese es el que se pinta.
 *
 * Del viaje se enseña lo mínimo para no equivocarse de sitio —de dónde a
 * dónde— y nada más. La tarifa ya se decidió al aceptar; repetirla aquí sólo
 * añadiría algo que leer con el motor encendido.
 */

import { View } from 'react-native';

import { Boton, Txt } from '../ui/componentes';
import { useTema } from '../theme/ThemeContext';
import type { AccionDelConductor, FaseDeLaAccion } from '../domain/accionesDelConductor';

function Punto({
  etiqueta, valor, color
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly color: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginTop: 6 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt nivel="etiqueta" tono="tenue">{etiqueta}</Txt>
        <Txt nivel="cuerpo">{valor}</Txt>
      </View>
    </View>
  );
}

export function SuperficieDeCarrera({
  titular, origen, destino, accion, fase, fallo, sePuede, onPulsar
}: {
  readonly titular: string;
  readonly origen: string;
  readonly destino: string;
  readonly accion: AccionDelConductor;
  readonly fase: FaseDeLaAccion;
  readonly fallo: string | null;
  readonly sePuede: boolean;
  readonly onPulsar: () => void;
}) {
  const tema = useTema();
  const enviando = fase === 'SUBMITTING';

  return (
    <View
      testID="superficie-de-carrera"
      style={{
        backgroundColor: tema.color.superficie,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: tema.color.borde,
        padding: 20,
        gap: 16
      }}
    >
      <View style={{ gap: 2 }}>
        <Txt nivel="etiqueta" tono="tenue">Carrera en curso</Txt>
        <Txt nivel="titulo">{titular}</Txt>
      </View>

      <View style={{ gap: 10 }}>
        <Punto etiqueta="Recoger" valor={origen} color={tema.color.acento} />
        <Punto etiqueta="Llevar a" valor={destino} color={tema.color.textoPrimario} />
      </View>

      {/* SIN CONEXIÓN NO ES UN ERROR, y por eso no se pinta como tal: se cuenta
          qué pasa y el botón sigue ahí, porque vuelve a funcionar solo en
          cuanto hay red. Un mensaje rojo haría pensar que algo se rompió. */}
      {fase === 'OFFLINE' ? (
        <View testID="carrera-sin-conexion">
          <Txt nivel="pie" tono="tenue">Sin conexión. Vuelve a intentarlo cuando tengas señal.</Txt>
        </View>
      ) : null}

      {fallo === null ? null : (
        <View testID="fallo-de-carrera">
          <Txt nivel="pie" tono="peligro">{fallo}</Txt>
        </View>
      )}

      <Boton
        titulo={enviando ? accion.textoEnviando : accion.texto}
        onPress={onPulsar}
        cargando={enviando}
        deshabilitado={!sePuede}
        testID={accion.testID}
      />
    </View>
  );
}
