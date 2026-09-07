/**
 * La conversación del viaje, para los dos.
 *
 * UNA PANTALLA, DOS PAPELES
 *
 * La pasajera y el conductor ven lo mismo con los papeles cambiados: arriba
 * quién está al otro lado, debajo el viaje del que hablan, y el hilo. Lo que
 * cambia es quién es «yo», y eso lo decide la sesión, no un parámetro.
 *
 * SIN VIAJE NO HAY CHAT
 *
 * El viaje sale de `useViajeActivo`. Si no hay uno, esta pantalla no tiene de
 * qué hablar y se va: no enseña un chat que no puede mandar nada a nadie.
 *
 * LOS CINCO ESTADOS SON DISTINTOS, y se pintan distintos: cargando, contenido,
 * vacío, error y sin conexión. Vacío no es error —no haber hablado es lo normal
 * al abrir— y sin conexión no es un fallo del servidor. Con contenido en
 * pantalla, la red y los fallos de recarga se cuentan como aviso, sin tirar lo
 * que ya se leía.
 *
 * LAS IMÁGENES SON PRIVADAS DEL VIAJE
 *
 * Se eligen del carrete o de la cámara, se validan aquí y las vuelve a validar
 * el servidor, que las guarda en su almacén privado. Al pintarlas se piden con
 * la sesión a `/api/chat-media/:id/content`: sólo la pasajera y el conductor de
 * ESE viaje las ven. La clave del almacén nunca sale del servidor, y aquí no se
 * guarda ninguna URL pública ni permanente.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, TextInput, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '../components/Pantalla';
import { useSesion } from '../context/AuthContext';
import { LARGO_MAXIMO, type MensajeEnPantalla } from '../domain/chatDelViaje';
import { horaDe } from '../domain/viajes';
import { useChatDelViaje } from '../realtime/ChatDelViaje';
import { useViajeActivo } from '../realtime/ViajeActivo';
import { fuenteDeAdjunto } from '../services/viajes';
import {
  elegirImagenDeChat, motivoDelPickerEnPantalla, recuperarImagenDeChatPendiente,
  type ModoDeCaptura, type ResultadoDelPicker
} from '../media/captura';
import { useTema } from '../theme/ThemeContext';
import { Avatar, Boton, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';

const TITULAR_DEL_VIAJE: Readonly<Record<string, string>> = Object.freeze({
  DRIVER_ASSIGNED: 'En camino',
  ARRIVED: 'En el punto de recogida',
  IN_PROGRESS: 'Viaje en curso'
});

/** La imagen privada, con su cabecera de sesión, o `undefined` si aún no se resolvió. */
type Fuente = { readonly uri: string; readonly headers?: Record<string, string> };

export default function PantallaDeChat() {
  const tema = useTema();
  const { sesion } = useSesion();
  const inferior = useSafeAreaInsets().bottom;

  // Los hooks van ANTES de cualquier salida: un hook por debajo de un `return`
  // condicional tumba la pantalla en el arranque en frío.
  const miId = sesion.estado === 'AUTENTICADO' ? sesion.usuario.id : '';
  const miNombre = sesion.estado === 'AUTENTICADO' ? sesion.usuario.firstName : '';
  const chat = useChatDelViaje({ miId, miNombre });
  // La fase del viaje activo: para distinguir «todavía no se sabe» de «no hay».
  const { estado: estadoDelViaje } = useViajeActivo();
  const [borrador, setBorrador] = useState('');
  const [avisoImagen, setAvisoImagen] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<Fuente | null>(null);
  const lista = useRef<FlatList<MensajeEnPantalla>>(null);

  // Las imágenes durables se resuelven a su fuente autenticada UNA vez y se
  // guardan por su id público. Es un mapa de cadenas: ni blobs ni URLs de
  // objeto que liberar —esto es React Native, y `<Image>` gestiona su propia
  // caché nativa—. Vive lo que vive la pantalla; al salir, desaparece.
  const adjuntos = useRef<Record<string, Fuente>>({});
  const [, refrescarAdjuntos] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let cambio = false;
      for (const mensaje of chat.mensajes) {
        if (mensaje.adjuntoId === '' || adjuntos.current[mensaje.adjuntoId] !== undefined) continue;
        const fuente = await fuenteDeAdjunto(mensaje.adjuntoId);
        if (!vivo) return;
        if (fuente !== null) { adjuntos.current[mensaje.adjuntoId] = fuente; cambio = true; }
      }
      if (vivo && cambio) refrescarAdjuntos();
    })();
    return () => { vivo = false; };
  }, [chat.mensajes]);

  // RESCATE TRAS UNA RECREACIÓN DE ANDROID.
  //
  // Si el sistema destruyó la aplicación mientras el selector o la cámara
  // estaban abiertos, al volver se aterriza en el viaje, no aquí. Cuando se
  // reabre el chat se pregunta si quedó una imagen esperando y, si la hay, se
  // manda. Se hace una sola vez por montaje y sólo con un viaje cargado.
  const yaSeRescato = useRef(false);
  useEffect(() => {
    if (yaSeRescato.current || chat.viaje === null) return;
    yaSeRescato.current = true;
    let vivo = true;
    (async () => {
      const pendiente = await recuperarImagenDeChatPendiente();
      if (!vivo || pendiente === null) return;
      if (pendiente.ok) { setAvisoImagen(null); chat.enviarImagen(pendiente.imagen); }
      else if (pendiente.motivo !== 'CANCELADO') setAvisoImagen(motivoDelPickerEnPantalla(pendiente.motivo));
    })();
    return () => { vivo = false; };
  }, [chat]);

  // Lo último abajo, y a la vista cuando llega algo nuevo.
  useEffect(() => {
    if (chat.mensajes.length === 0) return;
    const t = setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [chat.mensajes.length]);

  const enviar = useCallback(() => {
    if (borrador.trim() === '') return;
    chat.enviar(borrador);
    setBorrador('');
  }, [borrador, chat]);

  const conLaImagen = useCallback(async (modo: ModoDeCaptura) => {
    const resultado: ResultadoDelPicker = await elegirImagenDeChat(modo);
    if (resultado.ok) { setAvisoImagen(null); chat.enviarImagen(resultado.imagen); return; }
    if (resultado.motivo !== 'CANCELADO') setAvisoImagen(motivoDelPickerEnPantalla(resultado.motivo));
  }, [chat]);

  const adjuntar = useCallback(() => {
    Alert.alert('Adjuntar imagen', 'Elige de dónde', [
      { text: 'Galería', onPress: () => { void conLaImagen('CHOOSE_PHOTO'); } },
      { text: 'Cámara', onPress: () => { void conLaImagen('TAKE_PHOTO'); } },
      { text: 'Cancelar', style: 'cancel' }
    ]);
  }, [conLaImagen]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return (
      <Pantalla>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={tema.color.acento} size="large" />
        </View>
      </Pantalla>
    );
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  // Sin viaje no hay conversación. Pero «todavía no se sabe» no es «no hay»:
  // en el arranque en frío desde un aviso esta pantalla se monta mientras el
  // viaje activo aún se resincroniza, y volver al inicio en ese instante
  // deshacía lo que el aviso acababa de abrir. Se espera hasta que la fase
  // sea definitiva; sólo entonces, si no hay viaje, se vuelve a donde se estaba.
  if (chat.viaje === null) {
    if (estadoDelViaje.fase !== 'SIN_VIAJE' && estadoDelViaje.fase !== 'ERROR') {
      return (
        <Pantalla>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={tema.color.acento} size="large" />
          </View>
        </Pantalla>
      );
    }
    return <Redirect href={sesion.usuario.role === 'driver' ? '/conductor' : '/pasajero'} />;
  }

  const soyConductor = sesion.usuario.role === 'driver';
  const contraparte = soyConductor
    ? (chat.viaje.pasajero || 'Pasajera')
    : (chat.viaje.conductor?.nombre || 'Conductor');
  const iniciales = contraparte.split(' ').map(p => p.charAt(0).toUpperCase()).filter(Boolean).slice(0, 2).join('');

  return (
    <Pantalla bordes={['top']} testID="pantalla-de-chat">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* ENCABEZADO: quién está al otro lado y de qué viaje se habla. */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: tema.color.borde,
          backgroundColor: tema.color.superficie
        }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={12}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt nivel="titulo">‹</Txt>
          </Pressable>
          <Avatar iniciales={iniciales} tamano={40} />
          <View style={{ flex: 1, gap: 1 }}>
            <Txt nivel="encabezado" numberOfLines={1}>{contraparte}</Txt>
            <Txt nivel="pie" tono="tenue" numberOfLines={1}>
              {TITULAR_DEL_VIAJE[chat.viaje.estado] ?? 'Viaje'} · {chat.viaje.origen} → {chat.viaje.destino}
            </Txt>
          </View>
        </View>

        {/* AVISO SIN TIRAR EL CONTENIDO: sin red o sin poder recargar, se dice
            arriba y la conversación sigue leyéndose. */}
        {chat.aviso !== null ? (
          <View testID="aviso-de-chat" style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: tema.color.superficieHundida }}>
            <Txt nivel="pie" tono="tenue">{chat.aviso}</Txt>
          </View>
        ) : null}

        {/* EL HILO, o lo que toque en su lugar. */}
        <View style={{ flex: 1 }}>
          {chat.estado === 'CARGANDO' ? (
            <Centro testID="chat-cargando"><ActivityIndicator color={tema.color.acento} /></Centro>
          ) : chat.estado === 'SIN_CONEXION' ? (
            <Centro testID="chat-sin-conexion">
              <Txt nivel="cuerpo" tono="secundario">Sin conexión.</Txt>
              <Txt nivel="pie" tono="tenue">La conversación aparecerá en cuanto vuelva la señal.</Txt>
            </Centro>
          ) : chat.estado === 'ERROR' ? (
            <Centro testID="chat-error">
              <Txt nivel="cuerpo" tono="secundario">No se pudo cargar la conversación.</Txt>
              <Boton titulo="Reintentar" variante="secundario" onPress={chat.reintentar} />
            </Centro>
          ) : chat.estado === 'VACIO' ? (
            <Centro testID="chat-vacio">
              <Txt nivel="cuerpo" tono="secundario">Todavía no hay mensajes.</Txt>
              <Txt nivel="pie" tono="tenue">
                {soyConductor ? 'Avisa cuando estés cerca.' : 'Dile dónde te encuentras.'}
              </Txt>
            </Centro>
          ) : (
            <FlatList
              ref={lista}
              testID="hilo-de-chat"
              data={chat.mensajes}
              keyExtractor={m => m.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item }) => (
                <Burbuja
                  mensaje={item}
                  fuente={item.adjuntoId === '' ? undefined : adjuntos.current[item.adjuntoId]}
                  onAmpliar={setAmpliada}
                  onReintentar={chat.reintentarImagen}
                />
              )}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        {/* ESCRIBIR. Sólo con la carrera viva y con red: si no, se dice por qué. */}
        {avisoImagen !== null ? (
          <View testID="aviso-de-imagen" style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Txt nivel="pie" tono="peligro">{avisoImagen}</Txt>
          </View>
        ) : null}
        {chat.fallo !== null ? (
          <View testID="fallo-de-chat" style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Txt nivel="pie" tono="peligro">{chat.fallo}</Txt>
          </View>
        ) : null}

        {chat.sePuedeEscribir ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-end', gap: 8,
            paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(inferior, 8) + 4,
            borderTopWidth: 1, borderTopColor: tema.color.borde,
            backgroundColor: tema.color.superficie
          }}>
            <Pressable
              testID="adjuntar-imagen"
              onPress={adjuntar}
              accessibilityRole="button"
              accessibilityLabel="Adjuntar imagen"
              hitSlop={8}
              style={({ pressed }) => ({
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tema.color.superficieHundida,
                borderWidth: 1, borderColor: tema.color.borde,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <Icono nombre="imagen" color={tema.color.textoPrimario} tamano={20} />
            </Pressable>
            <TextInput
              testID="campo-de-chat"
              value={borrador}
              onChangeText={setBorrador}
              placeholder="Escribe un mensaje"
              placeholderTextColor={tema.color.textoTenue}
              maxLength={LARGO_MAXIMO}
              multiline
              accessibilityLabel="Mensaje"
              style={{
                flex: 1, minHeight: 44, maxHeight: 120,
                paddingHorizontal: 14, paddingVertical: 10,
                borderRadius: tema.radio.campo, borderWidth: 1, borderColor: tema.color.borde,
                backgroundColor: tema.color.superficieHundida, color: tema.color.textoPrimario,
                fontSize: 16
              }}
            />
            <Pressable
              testID="boton-enviar-chat"
              onPress={enviar}
              disabled={borrador.trim() === ''}
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              accessibilityState={{ disabled: borrador.trim() === '' }}
              style={({ pressed }) => ({
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: borrador.trim() === '' ? tema.color.superficieHundida : tema.color.acento,
                opacity: pressed ? 0.85 : 1
              })}
            >
              <Icono
                nombre="flecha-arriba"
                color={borrador.trim() === '' ? tema.color.textoTenue : tema.color.sobreAcento}
                tamano={20}
              />
            </Pressable>
          </View>
        ) : (
          <View testID="chat-cerrado" style={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Math.max(inferior, 8) + 8, borderTopWidth: 1, borderTopColor: tema.color.borde }}>
            <Txt nivel="pie" tono="tenue">
              {chat.hayConexion ? 'Esta conversación ya no admite mensajes.' : 'Sin conexión. Podrás escribir cuando vuelva la señal.'}
            </Txt>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* VISTA AMPLIADA. Una imagen a pantalla completa, con su cierre. */}
      <VistaAmpliada fuente={ampliada} onCerrar={() => setAmpliada(null)} />
    </Pantalla>
  );
}

function Centro({ children, testID }: { readonly children: React.ReactNode; readonly testID: string }) {
  return (
    <View testID={testID} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
      {children}
    </View>
  );
}

/**
 * Una burbuja. El mismo lenguaje que la conversación archivada del historial:
 * lo mío a la derecha con el acento, lo del otro a la izquierda sobre
 * superficie, y la esquina que apunta a quien habla.
 *
 * Lo único que aquí sí cambia es el pendiente: propio, salió, y el servidor
 * todavía no lo devolvió. Se atenúa y se dice. No es «enviado». Una imagen
 * pendiente enseña su vista previa local mientras sube; si el servidor la
 * rechaza, se queda a la vista, marcada, con el reintento a un toque.
 */
function Burbuja({ mensaje, fuente, onAmpliar, onReintentar }: {
  readonly mensaje: MensajeEnPantalla;
  readonly fuente: Fuente | undefined;
  readonly onAmpliar: (fuente: Fuente) => void;
  readonly onReintentar: (claveDeIntento: string) => void;
}) {
  const tema = useTema();
  const mia = mensaje.mio;
  const tieneImagen = mensaje.adjuntoLocal !== null || mensaje.adjuntoId !== '';
  const enviandose = mensaje.pendiente && !mensaje.fallida;

  return (
    <View
      testID={mensaje.pendiente ? 'mensaje-pendiente' : (mia ? 'mensaje-mio' : 'mensaje-ajeno')}
      style={{ alignSelf: mia ? 'flex-end' : 'flex-start', maxWidth: '86%', gap: 4, opacity: enviandose ? 0.75 : 1 }}
    >
      {tieneImagen ? (
        <ImagenDeBurbuja mensaje={mensaje} fuente={fuente} onAmpliar={onAmpliar} />
      ) : null}

      {mensaje.texto !== '' ? (
        <View style={{
          paddingVertical: 9, paddingHorizontal: 12,
          borderRadius: tema.radio.campo,
          borderBottomRightRadius: mia ? 4 : tema.radio.campo,
          borderBottomLeftRadius: mia ? tema.radio.campo : 4,
          backgroundColor: mia ? `${tema.color.acento}26` : tema.color.superficieHundida,
          borderWidth: 1,
          borderColor: mia ? `${tema.color.acento}44` : tema.color.borde
        }}>
          <Txt nivel="cuerpo">{mensaje.texto}</Txt>
        </View>
      ) : null}

      {mensaje.fallida ? (
        <Pressable
          testID="reintentar-imagen"
          onPress={() => mensaje.claveDeIntento !== null && onReintentar(mensaje.claveDeIntento)}
          accessibilityRole="button"
          accessibilityLabel="Reintentar el envío"
          hitSlop={8}
          style={{ alignSelf: mia ? 'flex-end' : 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Icono nombre="flecha-arriba" color={tema.color.peligro} tamano={13} />
          <Txt nivel="pie" tono="peligro">No se envió · Reintentar</Txt>
        </Pressable>
      ) : (
        <Txt nivel="pie" tono="tenue" estilo={{ alignSelf: mia ? 'flex-end' : 'flex-start' }}>
          {mensaje.pendiente ? 'Enviando…' : `${horaDe(mensaje.cuando)} · ${mia ? 'Tú' : mensaje.autor}`}
        </Txt>
      )}
    </View>
  );
}

/**
 * La imagen dentro de una burbuja.
 *
 * Mientras sube se enseña la vista previa local —el `file://` que dio el
 * carrete—; en cuanto vuelve durable, se pide con la sesión al almacén privado.
 * Un durable que todavía no se resolvió enseña un hueco cargando en vez de
 * saltar. La pendiente no se puede ampliar: no hay nada durable que mirar.
 */
function ImagenDeBurbuja({ mensaje, fuente, onAmpliar }: {
  readonly mensaje: MensajeEnPantalla;
  readonly fuente: Fuente | undefined;
  readonly onAmpliar: (fuente: Fuente) => void;
}) {
  const tema = useTema();
  const [fallo, setFallo] = useState(false);
  const source: Fuente | undefined = mensaje.adjuntoLocal !== null
    ? { uri: mensaje.adjuntoLocal }
    : fuente;

  const marco = {
    width: 220, height: 160, borderRadius: tema.radio.campo, overflow: 'hidden' as const,
    backgroundColor: tema.color.superficieHundida,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: tema.color.borde
  };

  if (source === undefined) {
    return (
      <View testID="imagen-cargando" style={marco}>
        <ActivityIndicator color={tema.color.acento} />
      </View>
    );
  }
  if (fallo) {
    return (
      <View testID="imagen-rota" style={marco}>
        <Icono nombre="imagen" color={tema.color.textoTenue} tamano={22} />
        <Txt nivel="pie" tono="tenue">No se pudo cargar</Txt>
      </View>
    );
  }

  return (
    <Pressable
      testID="imagen-de-chat"
      onPress={() => { if (mensaje.adjuntoLocal === null) onAmpliar(source); }}
      disabled={mensaje.adjuntoLocal !== null}
      accessibilityRole="imagebutton"
      accessibilityLabel="Imagen del chat"
      style={marco}
    >
      <Image
        source={source}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        onError={() => setFallo(true)}
        style={{ width: '100%', height: '100%' }}
      />
      {mensaje.pendiente && !mensaje.fallida ? (
        <View testID="imagen-subiendo" style={{
          ...marco, position: 'absolute', top: 0, left: 0, borderWidth: 0,
          backgroundColor: '#00000055'
        }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * La imagen a pantalla completa. Fondo oscuro, la imagen entera —sin recortar—,
 * y un único cierre. Respeta el área segura de arriba para no quedar bajo la
 * muesca. Mientras carga hay un indicador; si falla, se dice y se puede cerrar.
 */
function VistaAmpliada({ fuente, onCerrar }: {
  readonly fuente: Fuente | null;
  readonly onCerrar: () => void;
}) {
  const arriba = useSafeAreaInsets().top;
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  useEffect(() => { setCargando(true); setFallo(false); }, [fuente?.uri]);

  return (
    <Modal
      visible={fuente !== null}
      transparent
      animationType="fade"
      onRequestClose={onCerrar}
      statusBarTranslucent
    >
      <View testID={fuente !== null ? 'imagen-ampliada' : undefined} style={{ flex: 1, backgroundColor: '#000000EE' }}>
        <Pressable
          testID="cerrar-imagen"
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={12}
          style={{
            position: 'absolute', top: arriba + 8, right: 16, zIndex: 2,
            width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF22',
            alignItems: 'center', justifyContent: 'center'
          }}
        >
          <Txt nivel="titulo" estilo={{ color: '#FFFFFF' }}>✕</Txt>
        </Pressable>

        <Pressable onPress={onCerrar} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {fuente !== null ? (
            <Image
              source={fuente}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel="Imagen del chat"
              onLoadEnd={() => setCargando(false)}
              onError={() => { setCargando(false); setFallo(true); }}
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}
          {cargando && !fallo ? <ActivityIndicator color="#FFFFFF" size="large" style={{ position: 'absolute' }} /> : null}
          {fallo ? <Txt nivel="cuerpo" estilo={{ color: '#FFFFFF', position: 'absolute' }}>No se pudo cargar la imagen.</Txt> : null}
        </Pressable>
      </View>
    </Modal>
  );
}
