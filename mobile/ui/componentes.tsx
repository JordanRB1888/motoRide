/**
 * Los componentes de la interfaz, sensibles a la dirección visual activa.
 *
 * Todos leen el tema con `useTema()`. Ninguno escribe un color, un radio o un
 * espacio a mano: por eso las mismas pantallas se ven de tres maneras sin
 * duplicar una línea de estructura.
 *
 * LA FIRMA DE LA DIRECCIÓN C
 *
 * `presenciaDelAcento: 'firma'` activa el **filo amarillo**: una línea vertical
 * fina en el borde izquierdo de lo que importa. Es la decisión de identidad de
 * +58express — ni repartir amarillo por toda la pantalla, ni esconderlo en un
 * botón.
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { AREA_TACTIL_MINIMA } from '../theme/primitives';
import { Icono, type NombreDeIcono } from './Icono';

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export type Tono = 'primario' | 'secundario' | 'tenue' | 'acento' | 'sobreAcento';
export type Nivel = 'display' | 'titulo' | 'encabezado' | 'cuerpo' | 'etiqueta' | 'pie';

export function Txt({
  children, nivel = 'cuerpo', tono = 'primario', centrado = false, estilo, ...resto
}: {
  readonly children: ReactNode;
  readonly nivel?: Nivel;
  readonly tono?: Tono;
  readonly centrado?: boolean;
  readonly estilo?: StyleProp<ViewStyle>;
  readonly accessibilityRole?: 'header' | 'text';
  readonly numberOfLines?: number;
}) {
  const tema = useTema();
  const escala = tema.texto[nivel];
  const colores: Record<Tono, string> = {
    primario: tema.color.textoPrimario,
    secundario: tema.color.textoSecundario,
    tenue: tema.color.textoTenue,
    acento: tema.color.acento,
    sobreAcento: tema.color.sobreAcento
  };

  const esTitular = nivel === 'display' || nivel === 'titulo';

  return (
    <Text
      {...resto}
      style={[
        {
          color: colores[tono],
          fontSize: escala.tamano,
          lineHeight: escala.alto,
          fontWeight: 'peso' in escala ? escala.peso : '400',
          letterSpacing: esTitular ? tema.texto.ajusteDeTitular : 0,
          textAlign: centrado ? 'center' : 'left'
        },
        estilo as never
      ]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Superficie
// ---------------------------------------------------------------------------

export function Superficie({
  children, elevada = false, destacada = false, estilo, testID
}: {
  readonly children: ReactNode;
  readonly elevada?: boolean;
  /** Activa el filo de identidad en la dirección C. */
  readonly destacada?: boolean;
  readonly estilo?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  const tema = useTema();
  const conFilo = destacada && tema.presenciaDelAcento === 'firma';

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: elevada ? tema.color.superficieElevada : tema.color.superficie,
          borderRadius: tema.radio.tarjeta,
          padding: tema.ritmo.dentroDeTarjeta,
          overflow: 'hidden',
          // El borde amarillo SÓLO donde el acento es "presente" (dirección B).
          // En C la señal es el filo, y sumarle un borde completo hace que el
          // amarillo compita consigo mismo: con dos tarjetas destacadas en la
          // misma pantalla deja de destacar nada.
          ...(tema.superficie.conBorde
            ? {
                borderWidth: 1,
                borderColor: destacada && tema.presenciaDelAcento === 'presente'
                  ? tema.color.acento
                  : tema.color.borde
              }
            : {}),
          ...tema.superficie.sombra
        },
        estilo as never
      ]}
    >
      {conFilo && (
        <View style={[estilosBase.filo, { backgroundColor: tema.color.acento }]} />
      )}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Botón
// ---------------------------------------------------------------------------

export function Boton({
  titulo, onPress, variante = 'principal', descripcion,
  deshabilitado = false, cargando = false, etiquetaAccesible, estilo, testID
}: {
  readonly titulo: string;
  readonly onPress: () => void;
  readonly variante?: 'principal' | 'secundario' | 'silencioso';
  readonly descripcion?: string;
  readonly deshabilitado?: boolean;
  readonly cargando?: boolean;
  readonly etiquetaAccesible?: string;
  readonly estilo?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  const tema = useTema();
  const inactivo = deshabilitado || cargando;
  const esPrincipal = variante === 'principal';

  const fondo = (pulsado: boolean) => {
    if (variante === 'silencioso') return 'transparent';
    if (esPrincipal) return pulsado ? tema.color.acentoPresionado : tema.color.acento;
    return pulsado ? tema.color.superficieElevada : tema.color.superficie;
  };

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      accessibilityHint={descripcion}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      hitSlop={8}
      style={({ pressed }) => [
        {
          minHeight: AREA_TACTIL_MINIMA,
          borderRadius: tema.radio.boton,
          paddingVertical: tema.ritmo.entreElementos + 2,
          paddingHorizontal: tema.ritmo.dentroDeTarjeta,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fondo(pressed && !inactivo),
          ...(variante === 'secundario' ? { borderWidth: 1, borderColor: tema.color.borde } : {}),
          opacity: inactivo ? 0.45 : 1
        },
        estilo as never
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={esPrincipal ? tema.color.sobreAcento : tema.color.acento} />
      ) : (
        <View style={estilosBase.centro}>
          <Txt nivel="cuerpo" tono={esPrincipal ? 'sobreAcento' : 'primario'} centrado
            estilo={{ fontWeight: '600' } as never}>
            {titulo}
          </Txt>
          {descripcion !== undefined && (
            <Txt nivel="pie" tono={esPrincipal ? 'sobreAcento' : 'secundario'} centrado>
              {descripcion}
            </Txt>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Insignia de estado
// ---------------------------------------------------------------------------

export type TonoDeEstado = 'neutro' | 'exito' | 'aviso' | 'peligro' | 'acento';

export function Insignia({ texto, tono = 'neutro' }: {
  readonly texto: string;
  readonly tono?: TonoDeEstado;
}) {
  const tema = useTema();
  const color: Record<TonoDeEstado, string> = {
    neutro: tema.color.textoSecundario,
    exito: tema.color.exito,
    aviso: tema.color.aviso,
    peligro: tema.color.peligro,
    acento: tema.color.acento
  };
  const activo = color[tono];

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 5, paddingHorizontal: 10,
      borderRadius: tema.radio.insignia,
      borderWidth: 1, borderColor: `${activo}55`,
      backgroundColor: `${activo}18`
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: activo }} />
      <Text style={{
        color: activo,
        fontSize: tema.texto.etiqueta.tamano,
        lineHeight: tema.texto.etiqueta.alto,
        fontWeight: tema.texto.etiqueta.peso
      }}>
        {texto}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de servicio
// ---------------------------------------------------------------------------

export function TarjetaDeServicio({
  icono, titulo, detalle, precio, seleccionada = false, onPress, testID
}: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly detalle: string;
  readonly precio?: string;
  readonly seleccionada?: boolean;
  readonly onPress?: () => void;
  readonly testID?: string;
}) {
  const tema = useTema();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: seleccionada }}
      accessibilityLabel={`${titulo}. ${detalle}${precio ? `. ${precio}` : ''}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Superficie destacada={seleccionada} elevada={seleccionada}>
        <View style={estilosBase.fila}>
          <View style={{
            width: 44, height: 44, borderRadius: tema.radio.campo,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: seleccionada ? tema.color.acento : tema.color.superficieElevada
          }}>
            <Icono
              nombre={icono}
              color={seleccionada ? tema.color.sobreAcento : tema.color.textoSecundario}
              tamano={24}
            />
          </View>

          <View style={estilosBase.crece}>
            <Txt nivel="encabezado">{titulo}</Txt>
            <Txt nivel="pie" tono="secundario">{detalle}</Txt>
          </View>

          {precio !== undefined && (
            <Txt nivel="encabezado" tono={seleccionada ? 'acento' : 'primario'}>{precio}</Txt>
          )}
        </View>
      </Superficie>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export function Avatar({ iniciales, tamano = 44 }: {
  readonly iniciales: string;
  readonly tamano?: number;
}) {
  const tema = useTema();
  return (
    <View style={{
      width: tamano, height: tamano, borderRadius: tamano / 2,
      backgroundColor: tema.color.superficieElevada,
      borderWidth: 1, borderColor: tema.color.borde,
      alignItems: 'center', justifyContent: 'center'
    }}>
      <Text style={{
        color: tema.color.acento,
        fontSize: tamano * 0.36,
        fontWeight: '700'
      }}>
        {iniciales}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Barra inferior
// ---------------------------------------------------------------------------

export interface PestanaInferior {
  readonly clave: string;
  readonly icono: NombreDeIcono;
  readonly etiqueta: string;
}

export function BarraInferior({ pestanas, activa, onSeleccionar }: {
  readonly pestanas: readonly PestanaInferior[];
  readonly activa: string;
  readonly onSeleccionar?: (clave: string) => void;
}) {
  const tema = useTema();

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: tema.color.superficie,
      borderTopWidth: 1, borderTopColor: tema.color.borde,
      paddingTop: 8, paddingHorizontal: 6
    }}>
      {pestanas.map(pestana => {
        const esActiva = pestana.clave === activa;
        return (
          <Pressable
            key={pestana.clave}
            onPress={() => onSeleccionar?.(pestana.clave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: esActiva }}
            accessibilityLabel={pestana.etiqueta}
            style={estilosBase.pestana}
          >
            {/* La marca de selección es una línea amarilla sobre el icono: se ve
                de reojo, sin depender del color del propio icono. */}
            <View style={{
              height: 3, width: 22, borderRadius: 2, marginBottom: 6,
              backgroundColor: esActiva ? tema.color.acento : 'transparent'
            }} />
            <Icono
              nombre={pestana.icono}
              color={esActiva ? tema.color.acento : tema.color.textoTenue}
              tamano={22}
              activo={esActiva}
            />
            <Text style={{
              marginTop: 4,
              color: esActiva ? tema.color.textoPrimario : tema.color.textoTenue,
              fontSize: 11,
              fontWeight: esActiva ? '600' : '400'
            }}>
              {pestana.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Superficie de mapa (marcador visual)
// ---------------------------------------------------------------------------

/**
 * Un mapa simulado.
 *
 * NO se ha elegido proveedor: Google Navigation SDK frente a Mapbox sigue sin
 * decidirse, y meter uno aquí sería tomar la decisión por la puerta de atrás.
 *
 * Esto es una superficie con una retícula y un punto, pensada para que se
 * pueda sustituir por el mapa real sin tocar la composición de alrededor.
 */
export function MapaSimulado({ altura = 220, etiqueta }: {
  readonly altura?: number;
  readonly etiqueta?: string;
}) {
  const tema = useTema();

  return (
    <View
      accessibilityLabel={etiqueta ?? 'Vista previa del mapa'}
      accessibilityRole="image"
      style={{
        height: altura,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
        borderWidth: tema.superficie.conBorde ? 1 : 0,
        borderColor: tema.color.borde,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {/* Retícula: sugiere calles sin dibujar una ciudad concreta. */}
      {[0.22, 0.45, 0.68, 0.9].map(posicion => (
        <View key={`h${posicion}`} style={{
          position: 'absolute', left: 0, right: 0, top: `${posicion * 100}%`,
          height: 1, backgroundColor: tema.color.borde, opacity: 0.7
        }} />
      ))}
      {[0.18, 0.5, 0.82].map(posicion => (
        <View key={`v${posicion}`} style={{
          position: 'absolute', top: 0, bottom: 0, left: `${posicion * 100}%`,
          width: 1, backgroundColor: tema.color.borde, opacity: 0.7
        }} />
      ))}

      {/* El punto de origen, con su halo. */}
      <View style={{
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: `${tema.color.acento}22`,
        alignItems: 'center', justifyContent: 'center'
      }}>
        <View style={{
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: tema.color.acento,
          borderWidth: 2, borderColor: tema.color.fondo
        }} />
      </View>
    </View>
  );
}

const estilosBase = StyleSheet.create({
  centro: { alignItems: 'center', gap: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  crece: { flex: 1, gap: 2 },
  pestana: { flex: 1, alignItems: 'center', paddingBottom: 6 },
  filo: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 }
});
