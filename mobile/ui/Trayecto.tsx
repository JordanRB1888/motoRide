/**
 * El trayecto: de dónde sales, a dónde vas y para quién es el viaje.
 *
 * LA LÍNEA QUE SE ENCIENDE
 *
 * Origen y destino van unidos por una línea vertical, y esa línea **se pone
 * amarilla cuando el trayecto está completo**. Es el filo de la marca haciendo
 * un trabajo: no decora, dice que ya se puede pedir. Mientras falta el destino
 * está apagada, y la diferencia se ve sin leer nada.
 *
 * Es también la razón de que aquí no haya tarjetas. Origen, destino, paradas y
 * favoritos son un solo asunto —a dónde vas—, y meterlos en tres rectángulos
 * los convertiría en tres asuntos.
 *
 * VIAJE PARA OTRA PERSONA
 *
 * El selector existe y funciona en la interfaz. **El backend todavía no sabe
 * pedir un viaje para un tercero**: no hay campo de beneficiario en la API, ni
 * forma de avisar a quien va a montarse. Está aquí porque la composición tenía
 * que dejarle sitio antes de que se construya, no porque ya se pueda usar; en
 * el laboratorio se anuncia como preparación, y una prueba comprueba que ese
 * aviso sigue puesto.
 */

import { Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono, type NombreDeIcono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export const BENEFICIARIOS = ['mi', 'otra-persona'] as const;
export type Beneficiario = (typeof BENEFICIARIOS)[number];

// ---------------------------------------------------------------------------
// Para quién es el viaje
// ---------------------------------------------------------------------------

/** El chip compacto que abre la elección. Va arriba del trayecto. */
export function ChipDeBeneficiario({ beneficiario, onPress }: {
  readonly beneficiario: Beneficiario;
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const esParaOtro = beneficiario === 'otra-persona';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={esParaOtro ? 'El viaje es para otra persona. Cambiar' : 'El viaje es para ti. Cambiar'}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 7,
        paddingLeft: 11, paddingRight: 9, paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida
      })}
    >
      <Icono
        nombre="perfil"
        color={esParaOtro ? tema.color.acento : tema.color.textoSecundario}
        tamano={15}
      />
      <Txt nivel="etiqueta" tono={esParaOtro ? 'acento' : 'secundario'}>
        {esParaOtro ? 'Para otra persona' : 'Para mí'}
      </Txt>
      <Galon color={tema.color.textoTenue} />
    </Pressable>
  );
}

/** La punta de flecha hacia abajo, dibujada con dos barras. */
function Galon({ color }: { readonly color: string }) {
  return (
    <View style={{ width: 11, height: 11, alignItems: 'center', justifyContent: 'center' }}>
      {[45, -45].map((giro, indice) => (
        <View key={giro} style={{
          position: 'absolute',
          width: 7, height: 1.8, borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: `${giro}deg` }, { translateX: indice === 0 ? -2 : 2 }]
        }} />
      ))}
    </View>
  );
}

/** Las dos opciones, para elegir dentro de la hoja. */
export function OpcionesDeBeneficiario({ elegido, onElegir }: {
  readonly elegido: Beneficiario;
  readonly onElegir?: (beneficiario: Beneficiario) => void;
}) {
  const tema = useTema();

  const opciones: readonly {
    readonly clave: Beneficiario;
    readonly titulo: string;
    readonly detalle: string;
    readonly icono: NombreDeIcono;
  }[] = [
    { clave: 'mi', titulo: 'Para mí', detalle: 'Tú te montas', icono: 'perfil' },
    { clave: 'otra-persona', titulo: 'Para otra persona', detalle: 'Pídelo por alguien más', icono: 'perfil' }
  ];

  return (
    <View style={{ gap: tema.ritmo.entreElementos }}>
      {opciones.map(opcion => {
        const activa = opcion.clave === elegido;
        return (
          <Pressable
            key={opcion.clave}
            onPress={() => onElegir?.(opcion.clave)}
            accessibilityRole="radio"
            accessibilityState={{ selected: activa }}
            accessibilityLabel={`${opcion.titulo}. ${opcion.detalle}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              padding: 14,
              borderRadius: tema.radio.tarjeta,
              backgroundColor: activa ? tema.color.superficieElevada : tema.color.superficie,
              overflow: 'hidden'
            }}
          >
            {activa ? (
              <View style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: 3, backgroundColor: tema.color.acento
              }} />
            ) : null}
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: activa ? `${tema.color.acento}1f` : tema.color.superficieHundida
            }}>
              <Icono
                nombre={opcion.icono}
                color={activa ? tema.color.acento : tema.color.textoSecundario}
                tamano={19}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt nivel="cuerpo">{opcion.titulo}</Txt>
              <Txt nivel="pie" tono="tenue">{opcion.detalle}</Txt>
            </View>
            <Marca activa={activa} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** El punto de elección: aro que se rellena. */
function Marca({ activa }: { readonly activa: boolean }) {
  const tema = useTema();

  return (
    <View style={{
      width: 21, height: 21, borderRadius: 11,
      borderWidth: 2,
      borderColor: activa ? tema.color.acento : tema.color.borde,
      alignItems: 'center', justifyContent: 'center'
    }}>
      {activa ? (
        <View style={{
          width: 11, height: 11, borderRadius: 6,
          backgroundColor: tema.color.acento
        }} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// El trayecto
// ---------------------------------------------------------------------------

export function Trayecto({ origen, destino, onTocarOrigen, onTocarDestino, onAnadirParada, onElegirEnMapa }: {
  readonly origen: string;
  /** Vacío mientras no se haya puesto: la línea se queda apagada. */
  readonly destino?: string;
  readonly onTocarOrigen?: () => void;
  readonly onTocarDestino?: () => void;
  readonly onAnadirParada?: () => void;
  readonly onElegirEnMapa?: () => void;
}) {
  const tema = useTema();
  const completo = Boolean(destino);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* La columna de puntos y la línea que los une. */}
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <View style={{
            width: 13, height: 13, borderRadius: 7,
            borderWidth: 3, borderColor: tema.color.textoPrimario
          }} />
          <View style={{
            width: 2, flex: 1, minHeight: 26,
            backgroundColor: completo ? tema.color.acento : tema.color.borde
          }} />
          <View style={{
            width: 13, height: 13, borderRadius: 3,
            backgroundColor: completo ? tema.color.acento : 'transparent',
            borderWidth: completo ? 0 : 2,
            borderColor: tema.color.borde
          }} />
        </View>

        <View style={{ flex: 1, gap: 8 }}>
          <CampoDeLugar texto={origen} onPress={onTocarOrigen} etiqueta="Punto de recogida" />
          <CampoDeLugar
            texto={destino}
            marcador="¿A dónde vas?"
            onPress={onTocarDestino}
            etiqueta="Destino"
            resaltado
          />
        </View>

        <Pressable
          onPress={onAnadirParada}
          accessibilityRole="button"
          accessibilityLabel="Añadir una parada"
          style={({ pressed }) => ({
            width: 42, height: 42, borderRadius: tema.radio.campo,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida
          })}
        >
          <Mas color={tema.color.textoSecundario} />
        </Pressable>
      </View>

      <Pressable
        onPress={onElegirEnMapa}
        accessibilityRole="button"
        accessibilityLabel="Escoger la dirección en el mapa"
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 7,
          alignSelf: 'flex-end',
          opacity: pressed ? 0.6 : 1
        })}
      >
        <Icono nombre="destino" color={tema.color.acento} tamano={15} />
        <Txt nivel="etiqueta" tono="acento">Escoger en el mapa</Txt>
      </Pressable>
    </View>
  );
}

function CampoDeLugar({ texto, marcador, onPress, etiqueta, resaltado = false }: {
  readonly texto?: string;
  readonly marcador?: string;
  readonly onPress?: () => void;
  readonly etiqueta: string;
  /** El destino es el campo que hay que rellenar: lleva algo más de presencia. */
  readonly resaltado?: boolean;
}) {
  const tema = useTema();
  const vacio = !texto;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={vacio ? `${etiqueta}. Sin definir` : `${etiqueta}: ${texto}`}
      style={({ pressed }) => ({
        justifyContent: 'center',
        height: 46,
        paddingHorizontal: 14,
        borderRadius: tema.radio.campo,
        backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida,
        borderWidth: resaltado && vacio ? 1 : 0,
        borderColor: tema.color.borde
      })}
    >
      <Txt nivel="cuerpo" tono={vacio ? 'tenue' : 'primario'} numberOfLines={1}>
        {texto ?? marcador ?? ''}
      </Txt>
    </Pressable>
  );
}

/** El signo de más, dibujado con dos barras. */
function Mas({ color }: { readonly color: string }) {
  return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 16, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: 2, height: 16, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Los sitios de siempre
// ---------------------------------------------------------------------------

export interface LugarGuardado {
  readonly clave: string;
  readonly icono: NombreDeIcono;
  readonly nombre: string;
  /** Sin dirección todavía: el atajo está, pero hay que enseñarle dónde es. */
  readonly direccion?: string;
}

/**
 * Casa, trabajo y lo que se añada.
 *
 * Van en fila horizontal y no apilados: son atajos, no una lista que haya que
 * leer. Los que aún no tienen dirección se ven a medias, con un más, para que
 * se entienda que están por configurar y no que están rotos.
 */
/** El campo de «¿A dónde vas?», en reposo. Al tocarlo se abre la petición. */
export function CampoDeDestino({ onPress }: { readonly onPress?: () => void }) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="¿A dónde vas? Buscar destino"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingHorizontal: 15,
        height: 52,
        borderRadius: tema.radio.campo,
        backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida
      })}
    >
      <Icono nombre="destino" color={tema.color.acento} tamano={19} />
      <Txt nivel="cuerpo" tono="secundario">¿A dónde vas?</Txt>
    </Pressable>
  );
}

export function LugaresGuardados({ lugares, onElegir, onAnadir, onNuevo }: {
  readonly lugares: readonly LugarGuardado[];
  readonly onElegir?: (clave: string) => void;
  readonly onAnadir?: (clave: string) => void;
  /** Guardar un sitio nuevo. Sin esto sólo se puede tener casa y trabajo. */
  readonly onNuevo?: () => void;
}) {
  const tema = useTema();

  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {lugares.map(lugar => {
        const configurado = Boolean(lugar.direccion);
        return (
          <Pressable
            key={lugar.clave}
            onPress={() => (configurado ? onElegir?.(lugar.clave) : onAnadir?.(lugar.clave))}
            accessibilityRole="button"
            accessibilityLabel={configurado
              ? `${lugar.nombre}: ${lugar.direccion}`
              : `Añadir la dirección de ${lugar.nombre}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 11, paddingRight: 13, paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida,
              opacity: configurado ? 1 : 0.72
            })}
          >
            <Icono
              nombre={lugar.icono}
              color={configurado ? tema.color.acento : tema.color.textoTenue}
              tamano={16}
            />
            <Txt nivel="etiqueta" tono={configurado ? 'primario' : 'tenue'}>
              {lugar.nombre}
            </Txt>
            {configurado ? null : <Mas color={tema.color.textoTenue} />}
          </Pressable>
        );
      })}

      {/* Guardar un sitio nuevo. Casa y trabajo son los dos de siempre, pero
          casi nadie se mueve sólo entre esos dos: la universidad, la casa de
          la madre, el taller. Sin esto habría que escribir la dirección
          entera cada vez. */}
      {onNuevo ? (
        <Pressable
          onPress={onNuevo}
          accessibilityRole="button"
          accessibilityLabel="Guardar un lugar nuevo"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingLeft: 11, paddingRight: 13, paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: pressed ? tema.color.superficieElevada : 'transparent',
            borderWidth: 1,
            borderColor: tema.color.borde
          })}
        >
          <Mas color={tema.color.acento} />
          <Txt nivel="etiqueta" tono="secundario">Añadir</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
