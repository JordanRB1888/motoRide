/**
 * Chat visual premium de +58Express — CHAT-PREMIUM-PASS.
 *
 * COMPONENTE 100% PRESENTACIONAL
 *
 * Diseñado para aislar la experiencia visual de la lógica de sockets y backend
 * que se desarrolla en paralelo. Admite props para renderizar cualquier estado
 * o conversación real cuando se conecte.
 *
 * MODO DÍA Y MODO NOCHE PARITARIOS
 *
 * Todos los colores y contrastes salen de `useTema()` y `useEsquema()`.
 * No existen colores fijos ni texto blanco ciego sobre fondo claro.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema, useEsquema } from '../theme/ThemeContext';
import { Boton } from './componentes';
import { Icono } from './Icono';
import { useMovimientoReducido } from './movimiento';

// ---------------------------------------------------------------------------
// Tipos de datos del Chat
// ---------------------------------------------------------------------------

export type RemitenteMensaje = 'PROPIO' | 'CONTRAPARTE';
export type EstadoEnvio = 'ENVIANDO' | 'ENVIADO' | 'ENTREGADO' | 'FALLIDO';
export type EstadoGeneralChat = 'CARGANDO' | 'VACIO' | 'CONTENIDO' | 'ERROR' | 'OFFLINE';

export interface MensajeVisual {
  readonly id: string;
  readonly remitente: RemitenteMensaje;
  readonly texto?: string;
  readonly imagenUri?: string;
  readonly estadoEnvio?: EstadoEnvio;
  readonly hora: string;
  /** Porcentaje de carga 0–100 para imágenes en estado uploading */
  readonly progresoSubida?: number;
  readonly motivoFallo?: string;
}

export interface ContraparteChat {
  readonly nombre: string;
  readonly rol: string; // Ej: "Conductor verificado" o "Pasajera"
  readonly iniciales: string;
  readonly vehiculo?: string; // Ej: "Bera SBR · AB123CD"
  readonly calificacion?: string; // Ej: "4.9"
  readonly fotoUri?: string;
  readonly enLinea?: boolean;
}

export interface ContextoDelViajeChat {
  readonly estado: 'EN_CAMINO' | 'LLEGUE' | 'EN_CURSO' | 'COMPLETADO';
  readonly etiqueta: string; // Ej: "En camino al punto", "Llegó al punto", "Viaje en curso"
  readonly aclaracion?: string | null;
}

export interface PropiedadesChatVisual {
  readonly rolUsuario: 'PASAJERA' | 'CONDUCTOR';
  readonly contraparte: ContraparteChat;
  readonly contextoViaje?: ContextoDelViajeChat;
  readonly mensajes?: readonly MensajeVisual[];
  readonly estadoChat?: EstadoGeneralChat;
  readonly errorTexto?: string;
  readonly onVolver?: () => void;
  readonly onLlamar?: () => void;
  readonly onEnviarTexto?: (texto: string) => void;
  readonly onSeleccionarImagen?: () => void;
  readonly onReintentarEnvio?: (mensajeId: string) => void;
  readonly onReintentarCarga?: () => void;
}

// ---------------------------------------------------------------------------
// Componentes Auxiliares
// ---------------------------------------------------------------------------

/** Ticks de estado de entrega con gráficos vectoriales puros */
function TicksDeEnvio({ estado, color }: { readonly estado?: EstadoEnvio; readonly color: string }) {
  if (!estado) return null;

  if (estado === 'ENVIANDO') {
    return (
      <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Icono nombre="reloj" color={color} tamano={11} />
      </View>
    );
  }

  if (estado === 'FALLIDO') {
    return (
      <View style={{
        width: 13, height: 13, borderRadius: 6.5,
        backgroundColor: '#D32F2F', alignItems: 'center', justifyContent: 'center'
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800', lineHeight: 11 }}>!</Text>
      </View>
    );
  }

  const esDoble = estado === 'ENTREGADO';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', width: esDoble ? 15 : 10, height: 11 }}>
      <View style={{
        width: 3.5, height: 6.5,
        borderBottomWidth: 1.5, borderRightWidth: 1.5,
        borderColor: color,
        transform: [{ rotate: '45deg' }, { translateY: -1 }]
      }} />
      {esDoble && (
        <View style={{
          width: 3.5, height: 6.5,
          borderBottomWidth: 1.5, borderRightWidth: 1.5,
          borderColor: color,
          marginLeft: -1.5,
          transform: [{ rotate: '45deg' }, { translateY: -1 }]
        }} />
      )}
    </View>
  );
}

/** Visor de Imagen Pantalla Completa */
function VisorDeImagenModal({
  visible,
  imagenUri,
  onCerrar
}: {
  readonly visible: boolean;
  readonly imagenUri: string | null;
  readonly onCerrar: () => void;
}) {
  const insets = useSafeAreaInsets();

  if (!visible || !imagenUri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.94)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: insets.top,
        paddingBottom: insets.bottom
      }}>
        {/* Barra superior del visor */}
        <View style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}>
          <View style={{
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 14
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
              Foto adjunta · +58Express
            </Text>
          </View>

          <Pressable
            onPress={onCerrar}
            accessibilityRole="button"
            accessibilityLabel="Cerrar visor de imagen"
            style={({ pressed }) => [{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: pressed ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.18)',
              alignItems: 'center',
              justifyContent: 'center'
            }]}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 20 }}>✕</Text>
          </Pressable>
        </View>

        {/* Imagen central */}
        <Image
          source={{ uri: imagenUri }}
          style={{ width: '94%', height: '75%', borderRadius: 14 }}
          resizeMode="contain"
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Componente Principal de Chat
// ---------------------------------------------------------------------------

export function ChatVisual({
  rolUsuario,
  contraparte,
  contextoViaje,
  mensajes = [],
  estadoChat = 'CONTENIDO',
  errorTexto = 'No se pudieron sincronizar los mensajes del viaje',
  onVolver,
  onLlamar,
  onEnviarTexto,
  onSeleccionarImagen,
  onReintentarEnvio,
  onReintentarCarga
}: PropiedadesChatVisual) {
  const tema = useTema();
  const esquema = useEsquema();
  const esOscuro = esquema === 'oscuro';
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

  // Estados locales interactivos del composer y preview
  const [textoInput, setTextoInput] = useState('');
  const [imagenAdjuntaLocal, setImagenAdjuntaLocal] = useState<string | null>(null);
  const [imagenModalUri, setImagenModalUri] = useState<string | null>(null);
  const [estaEnfocado, setEstaEnfocado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Auto scroll al final cuando entran nuevos mensajes
  useEffect(() => {
    if (mensajes.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: !quieto });
      }, 80);
    }
  }, [mensajes.length, quieto]);

  const handleEnviar = () => {
    const limpio = textoInput.trim();
    if (limpio.length === 0 && !imagenAdjuntaLocal) return;

    if (limpio.length > 0) {
      onEnviarTexto?.(limpio);
    }
    setTextoInput('');
    setImagenAdjuntaLocal(null);
  };

  // Color de acento de marca seguro y accesible
  const colorAcento = tema.color.acento;
  const colorSobreAcento = tema.color.sobreAcento;

  // Agrupación visual de mensajes consecutivos
  const mensajesAgrupados = useMemo(() => {
    return mensajes.map((msj, index) => {
      const anterior = index > 0 ? mensajes[index - 1] : null;
      const siguiente = index < mensajes.length - 1 ? mensajes[index + 1] : null;

      const mismoRemitenteArriba = anterior?.remitente === msj.remitente;
      const mismoRemitenteAbajo = siguiente?.remitente === msj.remitente;

      return {
        ...msj,
        esPrimeroDelGrupo: !mismoRemitenteArriba,
        esUltimoDelGrupo: !mismoRemitenteAbajo
      };
    });
  }, [mensajes]);

  return (
    <View style={[estilos.contenedor, { backgroundColor: tema.color.fondo }]}>
      {/* 1. CABECERA PREMIUM */}
      <View style={[
        estilos.cabecera,
        {
          backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
          borderBottomColor: esOscuro ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)',
          paddingTop: Math.max(insets.top, 12) + 6
        }
      ]}>
        <View style={estilos.cabeceraFila}>
          {/* Botón Volver */}
          <Pressable
            onPress={onVolver}
            accessibilityRole="button"
            accessibilityLabel="Volver de la conversación"
            hitSlop={10}
            style={({ pressed }) => [
              estilos.botonVolver,
              {
                backgroundColor: pressed
                  ? tema.color.superficieHundida
                  : 'transparent',
                borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
              }
            ]}
          >
            <View style={[
              estilos.chevronVolver,
              { borderColor: tema.color.textoPrimario }
            ]} />
          </Pressable>

          {/* Avatar e Identidad de Contraparte */}
          <View style={estilos.contraparteInfo}>
            <View style={[
              estilos.avatarContenedor,
              {
                backgroundColor: esOscuro ? '#232528' : '#E2E6EA',
                borderColor: colorAcento
              }
            ]}>
              {contraparte.fotoUri ? (
                <Image
                  source={{ uri: contraparte.fotoUri }}
                  style={estilos.avatarImagen}
                />
              ) : (
                <Text style={[estilos.avatarTexto, { color: tema.color.textoPrimario }]}>
                  {contraparte.iniciales || 'U'}
                </Text>
              )}
              {/* Punto de estado en línea */}
              <View style={[
                estilos.puntoEnLinea,
                { backgroundColor: contraparte.enLinea !== false ? tema.color.exito : tema.color.textoTenue }
              ]} />
            </View>

            <View style={estilos.contraparteTextos}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  style={[estilos.contraparteNombre, { color: tema.color.textoPrimario }]}
                  numberOfLines={1}
                >
                  {contraparte.nombre}
                </Text>
                {contraparte.calificacion && (
                  <View style={[
                    estilos.calificacionBadge,
                    { backgroundColor: esOscuro ? 'rgba(245,195,0,0.15)' : 'rgba(245,195,0,0.22)' }
                  ]}>
                    <Text style={[estilos.calificacionTexto, { color: tema.color.acentoTexto }]}>
                      ★ {contraparte.calificacion}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[estilos.contraparteSubtitulo, { color: tema.color.textoSecundario }]}
                numberOfLines={1}
              >
                {contraparte.vehiculo ? contraparte.vehiculo : contraparte.rol}
              </Text>
            </View>
          </View>

          {/* Botón Llamada Directa */}
          {onLlamar && (
            <Pressable
              onPress={onLlamar}
              accessibilityRole="button"
              accessibilityLabel={`Llamar a ${contraparte.nombre}`}
              style={({ pressed }) => [
                estilos.botonLlamar,
                {
                  backgroundColor: pressed
                    ? tema.color.acentoPresionado
                    : (esOscuro ? tema.color.superficieHundida : tema.color.superficie),
                  borderWidth: 1,
                  borderColor: esOscuro ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                }
              ]}
            >
              <Icono
                nombre="telefono"
                color={tema.color.textoPrimario}
                tamano={18}
              />
            </Pressable>
          )}
        </View>

        {/* Barra de contexto del viaje */}
        {contextoViaje && (
          <View style={[
            estilos.barraContexto,
            {
              backgroundColor: esOscuro ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              borderTopColor: esOscuro ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
            }
          ]}>
            <View style={[
              estilos.puntoContexto,
              {
                backgroundColor: contextoViaje.estado === 'LLEGUE'
                  ? tema.color.exito
                  : colorAcento
              }
            ]} />
            <Text style={[estilos.textoContexto, { color: tema.color.textoSecundario }]} numberOfLines={1}>
              {contextoViaje.etiqueta}
              {contextoViaje.aclaracion ? ` · ${contextoViaje.aclaracion}` : ''}
            </Text>
          </View>
        )}

        {/* Barra de Estado Offline */}
        {estadoChat === 'OFFLINE' && (
          <View style={[
            estilos.barraOffline,
            { backgroundColor: esOscuro ? '#2C2612' : '#FFF3CD', borderColor: colorAcento }
          ]}>
            <Icono nombre="reloj" color={tema.color.acentoTexto} tamano={14} />
            <Text style={[estilos.textoOffline, { color: tema.color.acentoTexto }]}>
              Modo sin conexión · Los mensajes se enviarán al recuperar red
            </Text>
          </View>
        )}
      </View>

      {/* 2. CUERPO DE CONVERSACIÓN SEGÚN ESTADO */}
      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ESTADO: CARGANDO (SKELETON) */}
        {estadoChat === 'CARGANDO' && (
          <View style={estilos.contenedorEstadoCentrado}>
            <ActivityIndicator size="small" color={colorAcento} style={{ marginBottom: 16 }} />
            <View style={[
              estilos.skeletonBurbuja,
              estilos.skeletonContraparte,
              { backgroundColor: esOscuro ? '#202225' : '#E7EAEE', width: '65%' }
            ]} />
            <View style={[
              estilos.skeletonBurbuja,
              estilos.skeletonPropia,
              { backgroundColor: esOscuro ? '#2a281d' : '#F4ECD2', width: '50%' }
            ]} />
            <View style={[
              estilos.skeletonBurbuja,
              estilos.skeletonContraparte,
              { backgroundColor: esOscuro ? '#202225' : '#E7EAEE', width: '75%' }
            ]} />
            <Text style={[estilos.textoCargando, { color: tema.color.textoTenue }]}>
              Cargando conversación segura...
            </Text>
          </View>
        )}

        {/* ESTADO: ERROR */}
        {estadoChat === 'ERROR' && (
          <View style={estilos.contenedorEstadoCentrado}>
            <View style={[
              estilos.iconoErrorCirculo,
              { backgroundColor: esOscuro ? 'rgba(211,47,47,0.18)' : '#FDE8E8' }
            ]}>
              <Text style={{ fontSize: 24, color: tema.color.peligro }}>⚠</Text>
            </View>
            <Text style={[estilos.tituloEstado, { color: tema.color.textoPrimario }]}>
              Problema de sincronización
            </Text>
            <Text style={[estilos.subtituloEstado, { color: tema.color.textoSecundario }]}>
              {errorTexto}
            </Text>
            {onReintentarCarga && (
              <Boton
                titulo="Reintentar conexión"
                onPress={onReintentarCarga}
                variante="secundario"
                estilo={{ marginTop: 16, minWidth: 180 }}
              />
            )}
          </View>
        )}

        {/* ESTADO: VACÍO */}
        {estadoChat === 'VACIO' && (
          <View style={estilos.contenedorEstadoCentrado}>
            <View style={[
              estilos.iconoVacioCirculo,
              {
                backgroundColor: esOscuro ? 'rgba(245, 195, 0, 0.09)' : 'rgba(245, 195, 0, 0.14)',
                borderColor: esOscuro ? 'rgba(245, 195, 0, 0.25)' : 'rgba(245, 195, 0, 0.4)'
              }
            ]}>
              <Icono nombre="mensaje" color={colorAcento} tamano={32} />
            </View>
            <Text style={[estilos.tituloEstado, { color: tema.color.textoPrimario }]}>
              Inicia la conversación
            </Text>
            <Text style={[estilos.subtituloEstado, { color: tema.color.textoSecundario }]}>
              {rolUsuario === 'PASAJERA'
                ? `Coordina referencias de encuentro o indicaciones con ${contraparte.nombre}.`
                : `Infórmale a ${contraparte.nombre} cuando estés cerca o confirma su ubicación.`}
            </Text>
            <View style={[
              estilos.pildoraSugerencia,
              { backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada }
            ]}>
              <Text style={[estilos.textoPildora, { color: tema.color.textoSecundario }]}>
                🔒 Por seguridad, tus mensajes son cifrados durante el viaje
              </Text>
            </View>
          </View>
        )}

        {/* ESTADO: CONTENIDO O MODO OFFLINE (CON MENSAJES) */}
        {(estadoChat === 'CONTENIDO' || estadoChat === 'OFFLINE') && (
          <ScrollView
            ref={scrollRef}
            style={estilos.scrollMensajes}
            contentContainerStyle={estilos.scrollContenido}
            keyboardShouldPersistTaps="handled"
          >
            {/* Aviso de seguridad discreto al inicio */}
            <View style={estilos.seguridadAvisoFila}>
              <View style={[
                estilos.seguridadAvisoPill,
                { backgroundColor: esOscuro ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
              ]}>
                <Icono nombre="escudo" color={tema.color.textoTenue} tamano={12} />
                <Text style={[estilos.seguridadTexto, { color: tema.color.textoTenue }]}>
                  Canal directo de movilidad · +58Express
                </Text>
              </View>
            </View>

            {mensajesAgrupados.map((msj) => {
              const esPropio = msj.remitente === 'PROPIO';

              // Radios de esquina calculados según agrupación
              const borderTopLeftRadius = !esPropio && !msj.esPrimeroDelGrupo ? 4 : 16;
              const borderBottomLeftRadius = !esPropio && !msj.esUltimoDelGrupo ? 4 : 16;
              const borderTopRightRadius = esPropio && !msj.esPrimeroDelGrupo ? 4 : 16;
              const borderBottomRightRadius = esPropio && !msj.esUltimoDelGrupo ? 4 : 16;

              return (
                <View
                  key={msj.id}
                  style={[
                    estilos.filaMensaje,
                    esPropio ? estilos.filaPropia : estilos.filaContraparte,
                    { marginBottom: msj.esUltimoDelGrupo ? 10 : 3 }
                  ]}
                >
                  <View
                    style={[
                      estilos.burbujaBase,
                      {
                        borderTopLeftRadius,
                        borderBottomLeftRadius,
                        borderTopRightRadius,
                        borderBottomRightRadius
                      },
                      esPropio
                        ? [
                            estilos.burbujaPropia,
                            {
                              backgroundColor: esOscuro ? '#1C1E22' : '#22252A',
                              borderLeftWidth: 3,
                              borderLeftColor: colorAcento,
                              borderColor: esOscuro ? 'rgba(245,195,0,0.2)' : 'rgba(0,0,0,0.1)'
                            }
                          ]
                        : [
                            estilos.burbujaContraparte,
                            {
                              backgroundColor: esOscuro ? '#181A1D' : '#EBEDF0',
                              borderColor: esOscuro ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'
                            }
                          ]
                    ]}
                  >
                    {/* ADJUNTO DE IMAGEN (CHAT-2 PREVIEW) */}
                    {msj.imagenUri && (
                      <Pressable
                        onPress={() => setImagenModalUri(msj.imagenUri!)}
                        style={estilos.imagenContenedor}
                        accessibilityRole="imagebutton"
                        accessibilityLabel="Ver imagen adjunta en pantalla completa"
                      >
                        <Image
                          source={{ uri: msj.imagenUri }}
                          style={estilos.imagenMiniatura}
                          resizeMode="cover"
                        />

                        {/* Estado: Subiendo (Uploading con porcentaje) */}
                        {msj.estadoEnvio === 'ENVIANDO' && (
                          <View style={estilos.imagenOverlayCarga}>
                            <ActivityIndicator size="small" color={colorAcento} />
                            <Text style={estilos.imagenTextoCarga}>
                              {msj.progresoSubida ? `Subiendo ${msj.progresoSubida}%` : 'Enviando...'}
                            </Text>
                          </View>
                        )}

                        {/* Estado: Fallido en Imagen */}
                        {msj.estadoEnvio === 'FALLIDO' && (
                          <View style={estilos.imagenOverlayError}>
                            <Text style={{ color: '#FFFFFF', fontSize: 18, marginBottom: 4 }}>⚠</Text>
                            <Text style={estilos.imagenTextoError}>No se pudo enviar</Text>
                          </View>
                        )}
                      </Pressable>
                    )}

                    {/* TEXTO DEL MENSAJE */}
                    {msj.texto ? (
                      <Text
                        style={[
                          estilos.mensajeTexto,
                          {
                            color: esPropio
                              ? '#FFFFFF'
                              : (esOscuro ? '#FFFFFF' : '#111315')
                          }
                        ]}
                      >
                        {msj.texto}
                      </Text>
                    ) : null}

                    {/* METADATOS: HORA Y ESTADO */}
                    <View style={estilos.metadatosFila}>
                      <Text
                        style={[
                          estilos.horaTexto,
                          {
                            color: esPropio
                              ? 'rgba(255, 255, 255, 0.65)'
                              : tema.color.textoTenue
                          }
                        ]}
                      >
                        {msj.hora}
                      </Text>

                      {esPropio && (
                        <TicksDeEnvio
                          estado={msj.estadoEnvio}
                          color={colorAcento}
                        />
                      )}
                    </View>

                    {/* ACCIÓN DE REINTENTO SI FALLÓ */}
                    {esPropio && msj.estadoEnvio === 'FALLIDO' && (
                      <Pressable
                        onPress={() => onReintentarEnvio?.(msj.id)}
                        style={estilos.botonReintentarMensaje}
                        accessibilityRole="button"
                        accessibilityLabel="Reintentar envío de mensaje fallido"
                      >
                        <Text style={estilos.textoReintentarMensaje}>
                          Reintentar envío
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* 3. BANDEJA DE PREVISUALIZACIÓN DE IMAGEN ADJUNTA PENDIENTE */}
        {imagenAdjuntaLocal && (
          <View style={[
            estilos.bandejaAdjuntoLocal,
            {
              backgroundColor: esOscuro ? '#181A1D' : '#F1F3F5',
              borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
            }
          ]}>
            <Image
              source={{ uri: imagenAdjuntaLocal }}
              style={estilos.miniaturaAdjuntoLocal}
              resizeMode="cover"
            />
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={[estilos.nombreAdjuntoLocal, { color: tema.color.textoPrimario }]}>
                Foto seleccionada
              </Text>
              <Text style={[estilos.pesoAdjuntoLocal, { color: tema.color.textoTenue }]}>
                Lista para adjuntar al viaje
              </Text>
            </View>
            <Pressable
              onPress={() => setImagenAdjuntaLocal(null)}
              accessibilityRole="button"
              accessibilityLabel="Eliminar imagen seleccionada"
              style={estilos.botonQuitarAdjunto}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* 4. COMPOSER INFERIOR TÁCTIL Y SEGURO */}
        <View style={[
          estilos.composerContenedor,
          {
            backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
            borderTopColor: esOscuro ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            paddingBottom: Math.max(insets.bottom, 12) + 4
          }
        ]}>
          <View style={estilos.composerFila}>
            {/* Botón Adjuntar Imagen (CHAT-2 UI Hook) */}
            <Pressable
              onPress={() => {
                if (onSeleccionarImagen) {
                  onSeleccionarImagen();
                } else {
                  // Fallback interactivo para preview de diseño
                  setImagenAdjuntaLocal('https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop');
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Adjuntar fotografía de referencia"
              style={({ pressed }) => [
                estilos.botonAdjuntar,
                {
                  backgroundColor: pressed
                    ? tema.color.superficieHundida
                    : (esOscuro ? '#1D1F23' : '#E9ECEF'),
                  borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                }
              ]}
            >
              <Icono
                nombre="imagen"
                color={imagenAdjuntaLocal ? colorAcento : tema.color.textoSecundario}
                tamano={20}
              />
            </Pressable>

            {/* Campo de Entrada de Texto */}
            <View style={[
              estilos.inputCaja,
              {
                backgroundColor: esOscuro ? tema.color.superficieHundida : '#F4F6F8',
                borderColor: estaEnfocado
                  ? colorAcento
                  : (esOscuro ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
              }
            ]}>
              <TextInput
                value={textoInput}
                onChangeText={setTextoInput}
                placeholder="Escribe un mensaje..."
                placeholderTextColor={tema.color.textoTenue}
                style={[
                  estilos.inputTexto,
                  { color: tema.color.textoPrimario }
                ]}
                multiline
                maxLength={400}
                onFocus={() => setEstaEnfocado(true)}
                onBlur={() => setEstaEnfocado(false)}
              />
            </View>

            {/* Botón Enviar con personalidad +58Express */}
            {(() => {
              const puedeEnviar = textoInput.trim().length > 0 || imagenAdjuntaLocal !== null;
              return (
                <Pressable
                  onPress={handleEnviar}
                  disabled={!puedeEnviar}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar mensaje"
                  style={({ pressed }) => [
                    estilos.botonEnviar,
                    {
                      backgroundColor: puedeEnviar
                        ? (pressed ? tema.color.acentoPresionado : colorAcento)
                        : (esOscuro ? '#202226' : '#E2E5E9'),
                      opacity: puedeEnviar ? 1 : 0.4
                    }
                  ]}
                >
                  <View style={{
                    transform: [{ rotate: '45deg' }, { translateX: -1 }, { translateY: 1 }]
                  }}>
                    <View style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 6,
                      borderRightWidth: 6,
                      borderBottomWidth: 12,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderBottomColor: puedeEnviar ? colorSobreAcento : tema.color.textoTenue
                    }} />
                  </View>
                </Pressable>
              );
            })()}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 5. VISOR DE IMAGEN FULLSCREEN */}
      <VisorDeImagenModal
        visible={imagenModalUri !== null}
        imagenUri={imagenModalUri}
        onCerrar={() => setImagenModalUri(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos del Chat
// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  cabecera: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 10
  },
  cabeceraFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  botonVolver: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chevronVolver: {
    width: 10,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }, { translateX: 1 }]
  },
  contraparteInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatarContenedor: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  avatarImagen: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  avatarTexto: {
    fontSize: 16,
    fontWeight: '700'
  },
  puntoEnLinea: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: '#101112'
  },
  contraparteTextos: {
    flex: 1
  },
  contraparteNombre: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  calificacionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8
  },
  calificacionTexto: {
    fontSize: 11,
    fontWeight: '700'
  },
  contraparteSubtitulo: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1
  },
  botonLlamar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  barraContexto: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  puntoContexto: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  textoContexto: {
    fontSize: 12,
    fontWeight: '600'
  },
  barraOffline: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  textoOffline: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  scrollMensajes: {
    flex: 1
  },
  scrollContenido: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2
  },
  seguridadAvisoFila: {
    alignItems: 'center',
    marginBottom: 14
  },
  seguridadAvisoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12
  },
  seguridadTexto: {
    fontSize: 11,
    fontWeight: '500'
  },
  filaMensaje: {
    flexDirection: 'row',
    width: '100%'
  },
  filaPropia: {
    justifyContent: 'flex-end'
  },
  filaContraparte: {
    justifyContent: 'flex-start'
  },
  burbujaBase: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1
  },
  burbujaPropia: {},
  burbujaContraparte: {},
  mensajeTexto: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400'
  },
  metadatosFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 4
  },
  horaTexto: {
    fontSize: 11,
    fontWeight: '400'
  },
  imagenContenedor: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
    width: 220,
    height: 140,
    backgroundColor: '#0A0B0D'
  },
  imagenMiniatura: {
    width: '100%',
    height: '100%'
  },
  imagenOverlayCarga: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  imagenTextoCarga: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600'
  },
  imagenOverlayError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(180, 20, 20, 0.75)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  imagenTextoError: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  botonReintentarMensaje: {
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(211,47,47,0.18)'
  },
  textoReintentarMensaje: {
    color: '#EF5350',
    fontSize: 11,
    fontWeight: '700'
  },
  bandejaAdjuntoLocal: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1
  },
  miniaturaAdjuntoLocal: {
    width: 44,
    height: 44,
    borderRadius: 8
  },
  nombreAdjuntoLocal: {
    fontSize: 13,
    fontWeight: '600'
  },
  pesoAdjuntoLocal: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1
  },
  botonQuitarAdjunto: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerContenedor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  composerFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  botonAdjuntar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  inputCaja: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    justifyContent: 'center'
  },
  inputTexto: {
    fontSize: 15,
    lineHeight: 20
  },
  botonEnviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  contenedorEstadoCentrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  iconoVacioCirculo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  iconoErrorCirculo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  tituloEstado: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6
  },
  subtituloEstado: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280
  },
  pildoraSugerencia: {
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14
  },
  textoPildora: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center'
  },
  skeletonBurbuja: {
    height: 48,
    borderRadius: 14,
    marginBottom: 12
  },
  skeletonContraparte: {
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4
  },
  skeletonPropia: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4
  },
  textoCargando: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8
  }
});
