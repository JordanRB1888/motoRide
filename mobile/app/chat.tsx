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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '../components/Pantalla';
import { useSesion } from '../context/AuthContext';
import { LARGO_MAXIMO, type MensajeEnPantalla } from '../domain/chatDelViaje';
import { horaDe } from '../domain/viajes';
import { useChatDelViaje } from '../realtime/ChatDelViaje';
import { useTema } from '../theme/ThemeContext';
import { Avatar, Boton, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';

const TITULAR_DEL_VIAJE: Readonly<Record<string, string>> = Object.freeze({
  DRIVER_ASSIGNED: 'En camino',
  ARRIVED: 'En el punto de recogida',
  IN_PROGRESS: 'Viaje en curso'
});

export default function PantallaDeChat() {
  const tema = useTema();
  const { sesion } = useSesion();
  const inferior = useSafeAreaInsets().bottom;

  // Los hooks van ANTES de cualquier salida: un hook por debajo de un `return`
  // condicional tumba la pantalla en el arranque en frío.
  const miId = sesion.estado === 'AUTENTICADO' ? sesion.usuario.id : '';
  const miNombre = sesion.estado === 'AUTENTICADO' ? sesion.usuario.firstName : '';
  const chat = useChatDelViaje({ miId, miNombre });
  const [borrador, setBorrador] = useState('');
  const lista = useRef<FlatList<MensajeEnPantalla>>(null);

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

  // Sin viaje no hay conversación. Se vuelve a donde se estaba.
  if (chat.viaje === null) {
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
              renderItem={({ item }) => <Burbuja mensaje={item} />}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        {/* ESCRIBIR. Sólo con la carrera viva y con red: si no, se dice por qué. */}
        {chat.fallo !== null ? (
          <View testID="fallo-de-chat" style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Txt nivel="pie" tono="peligro">{chat.fallo}</Txt>
          </View>
        ) : null}

        {chat.sePuedeEscribir ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-end', gap: 10,
            paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(inferior, 8) + 4,
            borderTopWidth: 1, borderTopColor: tema.color.borde,
            backgroundColor: tema.color.superficie
          }}>
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
 * todavía no lo devolvió. Se atenúa y se dice. No es «enviado».
 */
function Burbuja({ mensaje }: { readonly mensaje: MensajeEnPantalla }) {
  const tema = useTema();
  const mia = mensaje.mio;

  return (
    <View
      testID={mensaje.pendiente ? 'mensaje-pendiente' : (mia ? 'mensaje-mio' : 'mensaje-ajeno')}
      style={{ alignSelf: mia ? 'flex-end' : 'flex-start', maxWidth: '86%', gap: 4, opacity: mensaje.pendiente ? 0.6 : 1 }}
    >
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
      <Txt nivel="pie" tono="tenue" estilo={{ alignSelf: mia ? 'flex-end' : 'flex-start' }}>
        {mensaje.pendiente ? 'Enviando…' : `${horaDe(mensaje.cuando)} · ${mia ? 'Tú' : mensaje.autor}`}
      </Txt>
    </View>
  );
}
