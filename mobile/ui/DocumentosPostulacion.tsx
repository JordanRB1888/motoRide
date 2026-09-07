/**
 * Componentes visuales para POSTULACIÓN → PASO 3 · DOCUMENTOS.
 *
 * QUÉ ES ESTO
 *
 * Un sistema de superficies y tarjetas premium, modular y limpio, diseñado para
 * transformar la lista de 11-12 documentos y el vídeo de presentación en una
 * experiencia de verificación seria, ordenada y fácil de entender en +58Express.
 *
 * ORGANIZACIÓN EN 4 GRUPOS VISUALES:
 *   1. IDENTIDAD (Cédula frontal, Cédula posterior, RIF, Tu foto / Selfie)
 *   2. CONDUCCIÓN (Licencia de conducir, Certificado médico)
 *   3. VEHÍCULO (Documento legal, Frente, Atrás, Placa, Casco o Interior)
 *   4. PRESENTACIÓN (Vídeo de presentación)
 *
 * ESTADOS DE CADA DOCUMENTO:
 *   · PENDIENTE: claro, no alarmante, con acciones compactas y elegantes (cámara / galería).
 *   · SUBIENDO: con indicador de carga y bloqueo de acciones.
 *   · SUBIDO: terminado, con check sutil y jerarquía relajada (sin teñir toda la tarjeta de verde).
 *   · REQUIERE_CAMBIOS: máxima jerarquía, filo de aviso, motivo real destacado y CTA de repetición.
 *   · LISTO / CORREGIDO: recién reemplazado, listo para revisión.
 *
 * SÓLO UI: sin llamadas a API, sin lógica de subida, sin dependencias de backend.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Text, View, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';

import { useTema } from '../theme/ThemeContext';
import { useMovimientoReducido } from './movimiento';
import { Txt } from './componentes';
import { type NombreDeIcono } from './Icono';
import { IconoAnimado } from './IconoAnimado';
import { FlechaDerecha } from './IconosDeCampo';

export type EstadoDocumentoVisual =
  | 'PENDIENTE'
  | 'SUBIENDO'
  | 'SUBIDO'
  | 'REQUIERE_CAMBIOS'
  | 'CORREGIDO'
  | 'ERROR';

export type GrupoDocumentalClave = 'identidad' | 'conduccion' | 'vehiculo' | 'presentacion';

export interface DatosGrupoDocumental {
  readonly clave: GrupoDocumentalClave;
  readonly titulo: string;
  readonly icono: NombreDeIcono | 'video';
  readonly descripcion: string;
}

export const GRUPOS_DOCUMENTALES: readonly DatosGrupoDocumental[] = Object.freeze([
  Object.freeze({
    clave: 'identidad',
    titulo: 'Identidad y verificación',
    icono: 'perfil',
    descripcion: 'Tus documentos personales de identidad'
  }),
  Object.freeze({
    clave: 'conduccion',
    titulo: 'Aptitud para conducir',
    icono: 'volante',
    descripcion: 'Licencia vigente y certificado médico vial'
  }),
  Object.freeze({
    clave: 'vehiculo',
    titulo: 'Datos del vehículo',
    icono: 'moto',
    descripcion: 'Papeles del vehículo y fotos de seguridad'
  }),
  Object.freeze({
    clave: 'presentacion',
    titulo: 'Presentación',
    icono: 'video',
    descripcion: 'Un vídeo breve con tu cara y tu voz'
  })
]);

/** Asigna un documento a su grupo visual correspondiente. */
export function clasificarDocumentoEnGrupo(tipo: string): GrupoDocumentalClave {
  if (tipo === 'identity_front' || tipo === 'identity_back' || tipo === 'rif' || tipo === 'driver_selfie') {
    return 'identidad';
  }
  if (tipo === 'driver_license' || tipo === 'medical_certificate') {
    return 'conduccion';
  }
  if (tipo === 'presentation_video') {
    return 'presentacion';
  }
  return 'vehiculo';
}

// ---------------------------------------------------------------------------
// Iconos específicos de la pantalla de documentos (dibujados con vistas)
// ---------------------------------------------------------------------------

/** Icono de cámara fotográfica con lente central y botón. */
export function IconoCamara({
  color,
  tamano = 18,
  reaccionando = false
}: {
  readonly color: string;
  readonly tamano?: number;
  readonly reaccionando?: boolean;
}) {
  const trazo = Math.max(1.3, tamano / 13);
  const quieto = useMovimientoReducido();
  const avance = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(avance);
    if (!reaccionando || quieto) {
      avance.set(withTiming(0, { duration: quieto ? 80 : 120 }));
      return;
    }
    avance.set(withSequence(
      withTiming(1, { duration: 90, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
      withSpring(0, { duration: 160, dampingRatio: 0.9 })
    ));
  }, [avance, quieto, reaccionando]);

  const estiloAnimado = useAnimatedStyle(() => {
    if (quieto) return { opacity: reaccionando ? 0.8 : 1 };
    const t = avance.get();
    return {
      transform: [
        { scale: interpolate(t, [0, 1], [1, 0.86]) }
      ]
    };
  });

  return (
    <Reanimated.View
      style={[{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }, estiloAnimado]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {/* Cuerpo de la cámara */}
      <View style={{
        width: tamano * 0.84,
        height: tamano * 0.62,
        borderRadius: tamano * 0.14,
        borderWidth: trazo,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Lente */}
        <View style={{
          width: tamano * 0.32,
          height: tamano * 0.32,
          borderRadius: tamano * 0.16,
          borderWidth: trazo,
          borderColor: color
        }} />
      </View>
      {/* Visor superior */}
      <View style={{
        position: 'absolute',
        top: tamano * 0.12,
        left: tamano * 0.28,
        width: tamano * 0.22,
        height: tamano * 0.12,
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
        backgroundColor: color
      }} />
    </Reanimated.View>
  );
}

/** Icono de cámara de vídeo para la presentación. */
export function IconoVideoCamara({
  color,
  tamano = 20,
  reaccionando = false
}: {
  readonly color: string;
  readonly tamano?: number;
  readonly reaccionando?: boolean;
}) {
  const trazo = Math.max(1.4, tamano / 14);
  const quieto = useMovimientoReducido();
  const avance = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(avance);
    if (!reaccionando || quieto) {
      avance.set(withTiming(0, { duration: quieto ? 80 : 120 }));
      return;
    }
    avance.set(withSequence(
      withTiming(1, { duration: 90, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
      withSpring(0, { duration: 160, dampingRatio: 0.9 })
    ));
  }, [avance, quieto, reaccionando]);

  const estiloAnimado = useAnimatedStyle(() => {
    if (quieto) return { opacity: reaccionando ? 0.8 : 1 };
    const t = avance.get();
    return {
      transform: [
        { scale: interpolate(t, [0, 1], [1, 0.88]) }
      ]
    };
  });

  return (
    <Reanimated.View
      style={[{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, estiloAnimado]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {/* Cuerpo principal */}
      <View style={{
        width: tamano * 0.58,
        height: tamano * 0.54,
        borderRadius: 3.5,
        borderWidth: trazo,
        borderColor: color
      }} />
      {/* Cono / objetivo a la derecha */}
      <View style={{
        width: 0,
        height: 0,
        borderTopWidth: tamano * 0.22,
        borderBottomWidth: tamano * 0.22,
        borderRightWidth: tamano * 0.26,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderRightColor: color,
        transform: [{ rotate: '180deg' }],
        marginLeft: 1.5
      }} />
    </Reanimated.View>
  );
}

/** Checkmark refinado para documentos completados. */
export function IconoCheck({ color, tamano = 16 }: { readonly color: string; readonly tamano?: number }) {
  return (
    <View style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center', position: 'relative' }} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{
        position: 'absolute',
        left: tamano * 0.2,
        bottom: tamano * 0.34,
        width: tamano * 0.28,
        height: 1.8,
        borderRadius: 1,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }]
      }} />
      <View style={{
        position: 'absolute',
        left: tamano * 0.36,
        bottom: tamano * 0.44,
        width: tamano * 0.52,
        height: 1.8,
        borderRadius: 1,
        backgroundColor: color,
        transform: [{ rotate: '-50deg' }]
      }} />
    </View>
  );
}

/**
 * Contenedor animado para avisos de error y correcciones.
 *
 * RESUELVE EL DEFECTO VISUAL DE ERRORES QUE PERMANECEN VISIBLES:
 * Cuando la operación posterior tiene éxito (subida terminada o nuevo archivo
 * tomado), el aviso no parpadea ni se queda atascado: se desvanece
 * suavemente con una transición fluida en opacidad y altura, manteniendo la
 * pantalla limpia.
 */
export function ContenedorAvisoAnimado({
  visible,
  children,
  estilo
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
  readonly estilo?: StyleProp<ViewStyle>;
}) {
  const quieto = useMovimientoReducido();
  const progreso = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progreso.set(withTiming(visible ? 1 : 0, {
      duration: quieto ? 80 : 200,
      easing: Easing.bezier(0.25, 1, 0.5, 1)
    }));
  }, [visible, progreso, quieto]);

  const estiloAnimado = useAnimatedStyle(() => ({
    opacity: progreso.get(),
    transform: quieto ? [] : [{ translateY: interpolate(progreso.get(), [0, 1], [-4, 0]) }]
  }));

  if (!visible && progreso.get() === 0) return null;

  return (
    <Reanimated.View style={[estiloAnimado, estilo]}>
      {children}
    </Reanimated.View>
  );
}

// ---------------------------------------------------------------------------
// Resumen de progreso de documentos
// ---------------------------------------------------------------------------

export interface PropiedadesResumenProgreso {
  readonly listos: number;
  readonly total: number;
  readonly porRepetir?: number;
  readonly subtituloVehiculo?: string;
  readonly estilo?: StyleProp<ViewStyle>;
}

export function ResumenProgresoDocumentos({
  listos,
  total,
  porRepetir = 0,
  subtituloVehiculo,
  estilo
}: PropiedadesResumenProgreso) {
  const tema = useTema();
  const porcentaje = total > 0 ? Math.min(100, Math.round((listos / total) * 100)) : 0;
  const completo = listos === total && total > 0;

  return (
    <View
      style={[
        {
          backgroundColor: tema.color.superficieElevada,
          borderRadius: tema.radio.tarjeta,
          borderWidth: 1,
          borderColor: porRepetir > 0 ? `${tema.color.aviso}55` : tema.color.borde,
          padding: 14,
          gap: 10,
          ...tema.superficie.sombra
        },
        estilo
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`Progreso de documentos: ${listos} de ${total} listos.`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt nivel="etiqueta" estilo={{ fontWeight: '700', fontSize: 13.5 }}>
            Documentos para verificación
          </Txt>
          <Txt nivel="pie" tono="tenue" numberOfLines={1}>
            {subtituloVehiculo ?? 'Verifica cada foto para activar tu cuenta'}
          </Txt>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ color: completo ? tema.color.exito : tema.color.acento, fontSize: 18, fontWeight: '800' }}>
              {listos}
            </Text>
            <Text style={{ color: tema.color.textoSecundario, fontSize: 13, fontWeight: '600' }}>
              /{total}
            </Text>
          </View>
          <Txt nivel="pie" tono={completo ? 'exito' : 'secundario'} estilo={{ fontSize: 11 }}>
            {completo ? 'Completos' : `${porcentaje}% listos`}
          </Txt>
        </View>
      </View>

      {/* Barra de progreso visual con relleno dinámico */}
      <View style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: tema.color.superficieHundida,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: tema.color.borde
      }}>
        <View style={{
          width: `${porcentaje}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: completo ? tema.color.exito : tema.color.acento
        }} />
      </View>

      {/* Si hay documentos rechazados que repetir, destacamos el aviso */}
      {porRepetir > 0 ? (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 8,
          backgroundColor: `${tema.color.aviso}16`,
          borderWidth: 1,
          borderColor: `${tema.color.aviso}44`
        }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tema.color.aviso }} />
          <Text style={{ color: tema.color.aviso, fontSize: 11.5, fontWeight: '700' }}>
            {porRepetir === 1 ? '1 documento requiere tu corrección' : `${porRepetir} documentos requieren corrección`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Separador de Sección / Grupo Documental
// ---------------------------------------------------------------------------

export interface PropiedadesCabeceraGrupo {
  readonly grupo: DatosGrupoDocumental;
  readonly listosEnGrupo: number;
  readonly totalEnGrupo: number;
  readonly estilo?: StyleProp<ViewStyle>;
}

export function CabeceraGrupoDocumental({
  grupo,
  listosEnGrupo,
  totalEnGrupo,
  estilo
}: PropiedadesCabeceraGrupo) {
  const tema = useTema();
  const grupoCompleto = listosEnGrupo === totalEnGrupo && totalEnGrupo > 0;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 2 }, estilo]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: grupoCompleto ? `${tema.color.exito}1a` : `${tema.color.acento}1a`,
          borderWidth: 1,
          borderColor: grupoCompleto ? `${tema.color.exito}44` : `${tema.color.acento}44`
        }}>
          {grupo.icono === 'video' ? (
            <IconoVideoCamara color={grupoCompleto ? tema.color.exito : tema.color.acento} tamano={15} />
          ) : (
            <IconoAnimado
              nombre={grupo.icono}
              color={grupoCompleto ? tema.color.exito : tema.color.acento}
              tamano={15}
              activo={grupoCompleto}
            />
          )}
        </View>

        <View>
          <Txt nivel="etiqueta" estilo={{ fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {grupo.titulo}
          </Txt>
        </View>
      </View>

      <View style={{
        paddingHorizontal: 8,
        paddingVertical: 2.5,
        borderRadius: 12,
        backgroundColor: grupoCompleto ? `${tema.color.exito}18` : tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: grupoCompleto ? `${tema.color.exito}44` : tema.color.borde
      }}>
        <Text style={{
          color: grupoCompleto ? tema.color.exito : tema.color.textoSecundario,
          fontSize: 11,
          fontWeight: '700'
        }}>
          {listosEnGrupo}/{totalEnGrupo}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de Fotografía / Documento (Sistema Consistente)
// ---------------------------------------------------------------------------

export interface PropiedadesTarjetaDocumento {
  readonly tipo: string;
  readonly titulo: string;
  readonly instruccion: string;
  readonly estado: EstadoDocumentoVisual;
  readonly motivo?: string | null;
  readonly ocupado?: boolean;
  readonly bloqueada?: boolean;
  readonly onTomarFoto?: () => void;
  readonly onElegirGaleria?: () => void;
  readonly testID?: string;
  readonly estilo?: StyleProp<ViewStyle>;
}

export function TarjetaDocumento({
  tipo,
  titulo,
  instruccion,
  estado,
  motivo,
  ocupado = false,
  bloqueada = false,
  onTomarFoto,
  onElegirGaleria,
  testID = `documento-${tipo}`,
  estilo
}: PropiedadesTarjetaDocumento) {
  const tema = useTema();
  const [pulsandoTomar, setPulsandoTomar] = useState(false);
  const [pulsandoGaleria, setPulsandoGaleria] = useState(false);

  const esHecho = estado === 'SUBIDO' || estado === 'CORREGIDO';
  const esRequiereCambios = estado === 'REQUIERE_CAMBIOS' || Boolean(motivo);

  // Configuración de estilo perimetral según estado
  const bordeColor = esRequiereCambios
    ? `${tema.color.aviso}99`
    : esHecho
      ? `${tema.color.exito}44`
      : tema.color.borde;

  return (
    <View
      testID={testID}
      style={[
        {
          position: 'relative',
          backgroundColor: tema.color.superficieElevada,
          borderRadius: tema.radio.tarjeta,
          borderWidth: 1,
          borderColor: bordeColor,
          padding: 13,
          gap: 10,
          overflow: 'hidden',
          ...tema.superficie.sombra
        },
        estilo
      ]}
      accessibilityLabel={`${titulo}. ${esRequiereCambios ? `Corrección requerida: ${motivo}` : esHecho ? 'Subido' : 'Pendiente'}`}
    >
      {/* Filo de aviso vertical a la izquierda si requiere cambios (marca de atención) */}
      {esRequiereCambios ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: tema.color.aviso
          }}
        />
      ) : null}

      {/* Cabecera de la tarjeta: Título + Badge de estado */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt nivel="etiqueta" estilo={{ fontWeight: '700', fontSize: 13.5 }} numberOfLines={1}>
              {titulo}
            </Txt>
          </View>

          {/* Instrucción o detalle */}
          <Txt nivel="pie" tono="secundario" estilo={{ fontSize: 11.5, lineHeight: 15 }} numberOfLines={2}>
            {instruccion}
          </Txt>
        </View>

        {/* Insignia / Estado */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4.5,
          paddingVertical: 3.5,
          paddingHorizontal: 8,
          borderRadius: 8,
          backgroundColor: esRequiereCambios
            ? `${tema.color.aviso}1a`
            : esHecho
              ? `${tema.color.exito}1a`
              : ocupado
                ? `${tema.color.acento}1a`
                : `${tema.color.textoSecundario}14`,
          borderWidth: 1,
          borderColor: esRequiereCambios
            ? `${tema.color.aviso}55`
            : esHecho
              ? `${tema.color.exito}55`
              : ocupado
                ? `${tema.color.acento}55`
                : `${tema.color.textoSecundario}28`
        }}>
          {ocupado ? (
            <ActivityIndicator size="small" color={tema.color.acento} style={{ transform: [{ scale: 0.7 }] }} />
          ) : esHecho ? (
            <IconoCheck color={tema.color.exito} tamano={12} />
          ) : esRequiereCambios ? (
            <View style={{ width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: tema.color.aviso }} />
          ) : (
            <View style={{ width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: tema.color.textoSecundario }} />
          )}

          <Text style={{
            color: esRequiereCambios
              ? tema.color.aviso
              : esHecho
                ? tema.color.exito
                : ocupado
                  ? tema.color.acento
                  : tema.color.textoSecundario,
            fontSize: 10.5,
            fontWeight: '700'
          }}>
            {ocupado
              ? 'Subiendo…'
              : esRequiereCambios
                ? 'Requiere cambio'
                : esHecho
                  ? 'Listo'
                  : 'Pendiente'}
          </Text>
        </View>
      </View>

      {/* BLOQUE DESTACADO DE CORRECCIÓN: Si administración pidió repetir (con salida suave al resolverse) */}
      <ContenedorAvisoAnimado visible={Boolean(esRequiereCambios && motivo)}>
        <View style={{
          backgroundColor: `${tema.color.aviso}12`,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: `${tema.color.aviso}44`,
          paddingVertical: 7,
          paddingHorizontal: 10,
          gap: 2
        }}>
          <Text style={{ color: tema.color.aviso, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Motivo de Administración:
          </Text>
          <Text style={{ color: tema.color.textoPrimario, fontSize: 12, lineHeight: 16, fontWeight: '500' }}>
            {motivo}
          </Text>
        </View>
      </ContenedorAvisoAnimado>

      {/* ACCIONES COMPACTAS Y ELEGANTES (Cámara / Galería) */}
      {!bloqueada ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <Pressable
            testID={`tomar-${tipo}`}
            accessibilityRole="button"
            accessibilityLabel={esHecho ? `Repetir foto de ${titulo}` : `Tomar foto de ${titulo}`}
            disabled={ocupado}
            onPress={onTomarFoto}
            onPressIn={() => setPulsandoTomar(true)}
            onPressOut={() => setPulsandoTomar(false)}
            hitSlop={4}
            style={({ pressed }) => [
              {
                flex: 1.2,
                minHeight: 34,
                borderRadius: tema.radio.boton,
                backgroundColor: esRequiereCambios
                  ? (pressed ? tema.color.acentoPresionado : tema.color.acento)
                  : esHecho
                    ? (pressed ? tema.color.superficieHundida : tema.color.superficie)
                    : (pressed ? tema.color.acentoPresionado : tema.color.acento),
                borderWidth: esHecho && !esRequiereCambios ? 1 : 0,
                borderColor: tema.color.borde,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 10,
                opacity: ocupado ? 0.5 : 1
              }
            ]}
          >
            <IconoCamara
              color={esHecho && !esRequiereCambios ? tema.color.textoPrimario : tema.color.sobreAcento}
              tamano={15}
              reaccionando={pulsandoTomar}
            />
            <Text style={{
              color: esHecho && !esRequiereCambios ? tema.color.textoPrimario : tema.color.sobreAcento,
              fontSize: 12,
              fontWeight: '700'
            }}>
              {esRequiereCambios ? 'Repetir foto' : esHecho ? 'Cambiar foto' : 'Tomar foto'}
            </Text>
          </Pressable>

          <Pressable
            testID={`elegir-${tipo}`}
            accessibilityRole="button"
            accessibilityLabel={`Elegir de galería para ${titulo}`}
            disabled={ocupado}
            onPress={onElegirGaleria}
            onPressIn={() => setPulsandoGaleria(true)}
            onPressOut={() => setPulsandoGaleria(false)}
            hitSlop={4}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 34,
                borderRadius: tema.radio.boton,
                backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficie,
                borderWidth: 1,
                borderColor: tema.color.borde,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 8,
                opacity: ocupado ? 0.5 : 1
              }
            ]}
          >
            <IconoAnimado
              nombre="imagen"
              color={tema.color.textoSecundario}
              tamano={14}
              reaccionando={pulsandoGaleria}
              variante="elevar"
            />
            <Text style={{ color: tema.color.textoSecundario, fontSize: 11.5, fontWeight: '600' }}>
              Galería
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta Distintiva para Vídeo de Presentación
// ---------------------------------------------------------------------------

export type EstadoVideoVisual = 'SIN_VIDEO' | 'LISTO' | 'SUBIENDO' | 'SUBIDO' | 'REPETIR';

export interface PropiedadesTarjetaVideo {
  readonly titulo: string;
  readonly instruccion: string;
  readonly estado: EstadoVideoVisual;
  readonly motivo?: string | null;
  readonly duracion?: number | null;
  readonly ocupado?: boolean;
  readonly bloqueada?: boolean;
  readonly onGrabarVideo?: () => void;
  readonly onElegirVideo?: () => void;
  readonly onSubirVideo?: () => void;
  readonly onRepetirVideo?: () => void;
  readonly testID?: string;
  readonly estilo?: StyleProp<ViewStyle>;
}

export function TarjetaVideoPresentacion({
  titulo,
  instruccion,
  estado,
  motivo,
  duracion,
  ocupado = false,
  bloqueada = false,
  onGrabarVideo,
  onElegirVideo,
  onSubirVideo,
  onRepetirVideo,
  testID = 'documento-presentation_video',
  estilo
}: PropiedadesTarjetaVideo) {
  const tema = useTema();
  const [pulsandoGrabar, setPulsandoGrabar] = useState(false);
  const [pulsandoElegirVideo, setPulsandoElegirVideo] = useState(false);

  const esSubido = estado === 'SUBIDO';
  const esListoParaSubir = estado === 'LISTO';
  const esRequiereRepetir = estado === 'REPETIR' || Boolean(motivo);

  const bordeColor = esRequiereRepetir
    ? `${tema.color.aviso}99`
    : esSubido
      ? `${tema.color.exito}55`
      : esListoParaSubir
        ? `${tema.color.acento}77`
        : tema.color.borde;

  return (
    <View
      testID={testID}
      style={[
        {
          position: 'relative',
          backgroundColor: tema.color.superficieElevada,
          borderRadius: tema.radio.tarjeta,
          borderWidth: 1.2,
          borderColor: bordeColor,
          padding: 14,
          gap: 10,
          overflow: 'hidden',
          ...tema.superficie.sombra
        },
        estilo
      ]}
      accessibilityLabel={`Vídeo de presentación: ${titulo}`}
    >
      {/* Filo lateral según estado */}
      {esRequiereRepetir ? (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: tema.color.aviso }} />
      ) : esListoParaSubir ? (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: tema.color.acento }} />
      ) : null}

      {/* Cabecera propia de Vídeo */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: esSubido
              ? `${tema.color.exito}1a`
              : esRequiereRepetir
                ? `${tema.color.aviso}1a`
                : `${tema.color.acento}1e`,
            borderWidth: 1,
            borderColor: esSubido
              ? `${tema.color.exito}44`
              : esRequiereRepetir
                ? `${tema.color.aviso}44`
                : `${tema.color.acento}55`
          }}>
            <IconoVideoCamara
              color={esSubido ? tema.color.exito : esRequiereRepetir ? tema.color.aviso : tema.color.acento}
              tamano={18}
            />
          </View>

          <View style={{ flex: 1, gap: 1 }}>
            <Txt nivel="etiqueta" estilo={{ fontWeight: '700', fontSize: 13.5 }}>
              {titulo}
            </Txt>
            <Txt nivel="pie" tono="tenue" estilo={{ fontSize: 11 }}>
              Máximo 30 segundos · audio y vídeo
            </Txt>
          </View>
        </View>

        {/* Estado pill */}
        <View style={{
          paddingVertical: 3.5,
          paddingHorizontal: 8,
          borderRadius: 8,
          backgroundColor: esSubido
            ? `${tema.color.exito}18`
            : esRequiereRepetir
              ? `${tema.color.aviso}18`
              : esListoParaSubir
                ? `${tema.color.acento}18`
                : `${tema.color.textoSecundario}14`,
          borderWidth: 1,
          borderColor: esSubido
            ? `${tema.color.exito}44`
            : esRequiereRepetir
              ? `${tema.color.aviso}44`
              : esListoParaSubir
                ? `${tema.color.acento}55`
                : `${tema.color.textoSecundario}28`
        }}>
          <Text style={{
            color: esSubido
              ? tema.color.exito
              : esRequiereRepetir
                ? tema.color.aviso
                : esListoParaSubir
                  ? tema.color.acento
                  : tema.color.textoSecundario,
            fontSize: 10.5,
            fontWeight: '700'
          }}>
            {estado === 'SUBIENDO'
              ? 'Subiendo…'
              : esSubido
                ? 'Subido'
                : esListoParaSubir
                  ? 'Listo para subir'
                  : esRequiereRepetir
                    ? 'Grabar otra vez'
                    : 'Sin vídeo'}
          </Text>
        </View>
      </View>

      {/* Instrucción */}
      <Txt nivel="pie" tono="secundario" estilo={{ fontSize: 11.5, lineHeight: 15 }}>
        {instruccion}
      </Txt>

      {/* Estado textual detallado (requerido para tests y feedback) */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 9,
        borderRadius: 8,
        backgroundColor: tema.color.superficieHundida,
        borderWidth: 1,
        borderColor: tema.color.borde
      }}>
        <Text style={{ color: tema.color.textoPrimario, fontSize: 11.5, fontWeight: '600' }} testID="estado-video">
          {estado === 'SUBIENDO'
            ? 'Subiendo el vídeo…'
            : estado === 'LISTO'
              ? `Grabado${typeof duracion === 'number' ? `, ${Math.round(duracion)} segundos` : ''}. Falta subirlo.`
              : estado === 'SUBIDO'
                ? 'Subido. Sólo administración puede verlo.'
                : estado === 'REPETIR'
                  ? 'Hay que grabarlo otra vez.'
                  : 'Todavía no has grabado el vídeo.'}
        </Text>
      </View>

      {/* Motivo de corrección si aplica (con desvanecimiento suave al regrabar) */}
      <ContenedorAvisoAnimado visible={Boolean(esRequiereRepetir && motivo)}>
        <View style={{
          backgroundColor: `${tema.color.aviso}14`,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: `${tema.color.aviso}44`,
          paddingVertical: 7,
          paddingHorizontal: 10,
          gap: 2
        }}>
          <Text style={{ color: tema.color.aviso, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase' }}>
            Motivo de Administración:
          </Text>
          <Text style={{ color: tema.color.textoPrimario, fontSize: 12, lineHeight: 16, fontWeight: '500' }}>
            {motivo}
          </Text>
        </View>
      </ContenedorAvisoAnimado>

      {/* ACCIONES DE VÍDEO */}
      {!bloqueada ? (
        esListoParaSubir ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Pressable
              testID="subir-video"
              accessibilityRole="button"
              accessibilityLabel="Subir vídeo grabado"
              disabled={ocupado}
              onPress={onSubirVideo}
              style={({ pressed }) => [
                {
                  flex: 1.4,
                  minHeight: 36,
                  borderRadius: tema.radio.boton,
                  backgroundColor: pressed ? tema.color.acentoPresionado : tema.color.acento,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  opacity: ocupado ? 0.5 : 1
                }
              ]}
            >
              <Text style={{ color: tema.color.sobreAcento, fontSize: 12.5, fontWeight: '700' }}>
                Subir vídeo
              </Text>
              <FlechaDerecha tamano={13} color={tema.color.sobreAcento} />
            </Pressable>

            <Pressable
              testID="repetir-video"
              accessibilityRole="button"
              accessibilityLabel="Repetir grabación de vídeo"
              disabled={ocupado}
              onPress={onRepetirVideo}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: 36,
                  borderRadius: tema.radio.boton,
                  backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficie,
                  borderWidth: 1,
                  borderColor: tema.color.borde,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 10,
                  opacity: ocupado ? 0.5 : 1
                }
              ]}
            >
              <Text style={{ color: tema.color.textoSecundario, fontSize: 12, fontWeight: '600' }}>
                Repetir
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Pressable
              testID="grabar-video"
              accessibilityRole="button"
              accessibilityLabel={esSubido ? 'Grabar otro vídeo' : 'Grabar vídeo'}
              disabled={ocupado}
              onPress={onGrabarVideo}
              onPressIn={() => setPulsandoGrabar(true)}
              onPressOut={() => setPulsandoGrabar(false)}
              style={({ pressed }) => [
                {
                  flex: 1.3,
                  minHeight: 36,
                  borderRadius: tema.radio.boton,
                  backgroundColor: esRequiereRepetir
                    ? (pressed ? tema.color.acentoPresionado : tema.color.acento)
                    : esSubido
                      ? (pressed ? tema.color.superficieHundida : tema.color.superficie)
                      : (pressed ? tema.color.acentoPresionado : tema.color.acento),
                  borderWidth: esSubido && !esRequiereRepetir ? 1 : 0,
                  borderColor: tema.color.borde,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  opacity: ocupado ? 0.5 : 1
                }
              ]}
            >
              <IconoVideoCamara
                color={esSubido && !esRequiereRepetir ? tema.color.textoPrimario : tema.color.sobreAcento}
                tamano={16}
                reaccionando={pulsandoGrabar}
              />
              <Text style={{
                color: esSubido && !esRequiereRepetir ? tema.color.textoPrimario : tema.color.sobreAcento,
                fontSize: 12,
                fontWeight: '700'
              }}>
                {esSubido ? 'Grabar otro' : 'Grabar vídeo'}
              </Text>
            </Pressable>

            <Pressable
              testID="elegir-video"
              accessibilityRole="button"
              accessibilityLabel="Elegir vídeo de la galería"
              disabled={ocupado}
              onPress={onElegirVideo}
              onPressIn={() => setPulsandoElegirVideo(true)}
              onPressOut={() => setPulsandoElegirVideo(false)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: 36,
                  borderRadius: tema.radio.boton,
                  backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficie,
                  borderWidth: 1,
                  borderColor: tema.color.borde,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  opacity: ocupado ? 0.5 : 1
                }
              ]}
            >
              <IconoAnimado
                nombre="imagen"
                color={tema.color.textoSecundario}
                tamano={14}
                reaccionando={pulsandoElegirVideo}
                variante="elevar"
              />
              <Text style={{ color: tema.color.textoSecundario, fontSize: 11.5, fontWeight: '600' }}>
                Galería
              </Text>
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
}
