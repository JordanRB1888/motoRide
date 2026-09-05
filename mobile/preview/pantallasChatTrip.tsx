/**
 * Pantallas de demostración del Laboratorio Visual para Chat y Viaje Activo.
 * CHAT-TRIP-VISUAL-PASS — +58Express
 *
 * Catálogo completo de escenarios (A hasta R):
 * A. PreviewChatPasajeraLight: Chat Pasajero en Modo Claro
 * B. PreviewChatPasajeraDark: Chat Pasajero en Modo Oscuro
 * C. PreviewChatConductorLight: Chat Conductor en Modo Claro
 * D. PreviewChatConductorDark: Chat Conductor en Modo Oscuro
 * E. PreviewChatTexto: Chat de texto con agrupación y delivery ticks
 * F. PreviewChatImagenes: Chat con imágenes CHAT-2 y visor fullscreen
 * G. PreviewChatUploading: Chat con subida activa de imagen (porcentaje + spinner)
 * H. PreviewChatFailedRetry: Chat con envío fallido y acción de reintento
 * I. PreviewChatOffline: Chat en modo fuera de línea con cola de mensajes
 * J. PreviewChatEmpty: Chat vacío amigable con cifrado de seguridad
 * K. PreviewChatError: Chat con error de sincronización y reintento
 * L. PreviewPassengerDriverAssigned: Viaje activo pasajera en DRIVER_ASSIGNED
 * M. PreviewPassengerArrived: Viaje activo pasajera en ARRIVED
 * N. PreviewPassengerInProgress: Viaje activo pasajera en IN_PROGRESS
 * O. PreviewDriverDriverAssigned: Viaje activo conductor con botón LLEGUÉ
 * P. PreviewDriverArrived: Viaje activo conductor con botón INICIAR VIAJE
 * Q. PreviewDriverInProgress: Viaje activo conductor con botón FINALIZAR VIAJE
 * R. PreviewHistorialDetalleConImagen: Detalle de viaje con adjuntos multimedia
 *
 * 100% AISLADO DE LA LÓGICA DE PRODUCCIÓN Y DE CHAT-2 EN MOTORIDE-CURRENT.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProveedorDeTema, useTema } from '../theme/ThemeContext';
import { ChatVisual, type MensajeVisual, type EstadoGeneralChat } from '../ui/ChatVisual';
import {
  ViajeActivoPasajeraSheet,
  ViajeActivoConductorSheet,
  type EstadoViajeCiclo
} from '../ui/TripVisual';
import { AdjuntoDetalleViaje } from '../ui/AdjuntoDetalleViaje';
import { LienzoDeMapa, type HitoEnMapa, type VehiculoEnMapa } from '../ui/Mapa';
import { HojaInferior, Separador } from '../ui/HojaInferior';

// ---------------------------------------------------------------------------
// Datos de Demostración para Chat y Viaje
// ---------------------------------------------------------------------------

const CONDUCTOR_FIXTURE = {
  nombre: 'Luis Gómez',
  rol: 'Conductor verificado',
  iniciales: 'LG',
  vehiculo: 'Bera SBR 150 · AB123CD',
  placa: 'AB123CD',
  calificacion: '4.9',
  enLinea: true
} as const;

const PASAJERA_FIXTURE = {
  nombre: 'Ana Pérez',
  rol: 'Pasajera verificada',
  iniciales: 'AP',
  enLinea: true
} as const;

const MENSAJES_TEXTO_PASAJERA: readonly MensajeVisual[] = [
  {
    id: 'm1',
    remitente: 'CONTRAPARTE',
    texto: '¡Hola Ana! Ya voy saliendo hacia tu punto de recogida.',
    hora: '12:10 PM'
  },
  {
    id: 'm2',
    remitente: 'PROPIO',
    texto: 'Perfecto Luis, estoy frente a la panadería con camisa blanca.',
    hora: '12:11 PM',
    estadoEnvio: 'ENTREGADO'
  },
  {
    id: 'm3',
    remitente: 'PROPIO',
    texto: 'Hay algo de sombra aquí en la acera.',
    hora: '12:11 PM',
    estadoEnvio: 'ENTREGADO'
  },
  {
    id: 'm4',
    remitente: 'CONTRAPARTE',
    texto: 'Excelente, voy en la moto azul con casco amarillo. Llego en 3 minutos.',
    hora: '12:12 PM'
  }
];

const MENSAJES_TEXTO_CONDUCTOR: readonly MensajeVisual[] = [
  {
    id: 'mc1',
    remitente: 'CONTRAPARTE',
    texto: 'Buenas tardes, ¿vienes en camino?',
    hora: '02:30 PM'
  },
  {
    id: 'mc2',
    remitente: 'PROPIO',
    texto: 'Buenas tardes Ana. Sí, voy pasando la redoma.',
    hora: '02:31 PM',
    estadoEnvio: 'ENTREGADO'
  },
  {
    id: 'mc3',
    remitente: 'PROPIO',
    texto: 'Llego en unos 2 minutos aproximadamente.',
    hora: '02:31 PM',
    estadoEnvio: 'ENTREGADO'
  },
  {
    id: 'mc4',
    remitente: 'CONTRAPARTE',
    texto: 'Te espero en la puerta principal del edificio.',
    hora: '02:32 PM'
  }
];

const MENSAJES_CON_IMAGENES: readonly MensajeVisual[] = [
  {
    id: 'img1',
    remitente: 'CONTRAPARTE',
    texto: 'Hola, ¿dónde exactamente te encuentras?',
    hora: '11:05 AM'
  },
  {
    id: 'img2',
    remitente: 'PROPIO',
    texto: 'Estoy junto a este portón negro:',
    imagenUri: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop',
    hora: '11:06 AM',
    estadoEnvio: 'ENTREGADO'
  },
  {
    id: 'img3',
    remitente: 'CONTRAPARTE',
    texto: '¡Listo! Ya te vi en el mapa, voy doblando la esquina.',
    hora: '11:07 AM'
  },
  {
    id: 'img4',
    remitente: 'CONTRAPARTE',
    texto: 'Foto de referencia recibida del conductor:',
    imagenUri: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop',
    hora: '11:08 AM'
  }
];

const MENSAJES_UPLOADING: readonly MensajeVisual[] = [
  {
    id: 'up1',
    remitente: 'CONTRAPARTE',
    texto: '¿Me puedes enviar una foto de la fachada?',
    hora: '10:40 AM'
  },
  {
    id: 'up2',
    remitente: 'PROPIO',
    texto: 'Subiendo referencia de la fachada...',
    imagenUri: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop',
    hora: '10:41 AM',
    estadoEnvio: 'ENVIANDO',
    progresoSubida: 68
  }
];

const MENSAJES_FAILED_RETRY: readonly MensajeVisual[] = [
  {
    id: 'fail1',
    remitente: 'CONTRAPARTE',
    texto: '¿Pudiste enviar la foto de la entrada?',
    hora: '09:15 AM'
  },
  {
    id: 'fail2',
    remitente: 'PROPIO',
    texto: 'Foto de comprobante de punto de encuentro',
    imagenUri: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600&auto=format&fit=crop',
    hora: '09:16 AM',
    estadoEnvio: 'FALLIDO',
    motivoFallo: 'Error de conexión'
  }
];

const HITOS_MAPA_PREVIEW: readonly HitoEnMapa[] = [
  { clave: 'origen', en: { x: 30, y: 45 }, tipo: 'origen' },
  { clave: 'destino', en: { x: 70, y: 18 }, tipo: 'destino' }
];

const VEHICULOS_MAPA_PREVIEW: readonly VehiculoEnMapa[] = [
  { clave: 'conductor', tipo: 'MOTO', en: { x: 44, y: 32 }, rumbo: 42, destacado: true }
];

// ---------------------------------------------------------------------------
// A. PreviewChatPasajeraLight (Modo Claro)
// ---------------------------------------------------------------------------

export function PreviewChatPasajeraLight() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_TEXTO_PASAJERA);

  return (
    <ProveedorDeTema inicial="C2" esquemaForzado="claro">
      <ChatVisual
        rolUsuario="PASAJERA"
        contraparte={CONDUCTOR_FIXTURE}
        contextoViaje={{
          estado: 'EN_CAMINO',
          etiqueta: 'Conductor en camino',
          aclaracion: 'Llegada en 3 min'
        }}
        mensajes={mensajes}
        onVolver={() => undefined}
        onLlamar={() => undefined}
        onEnviarTexto={texto => {
          setMensajes(prev => [...prev, {
            id: `m_${Date.now()}`,
            remitente: 'PROPIO',
            texto,
            hora: '12:15 PM',
            estadoEnvio: 'ENTREGADO'
          }]);
        }}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// B. PreviewChatPasajeraDark (Modo Oscuro)
// ---------------------------------------------------------------------------

export function PreviewChatPasajeraDark() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_TEXTO_PASAJERA);

  return (
    <ProveedorDeTema inicial="C2" esquemaForzado="oscuro">
      <ChatVisual
        rolUsuario="PASAJERA"
        contraparte={CONDUCTOR_FIXTURE}
        contextoViaje={{
          estado: 'EN_CAMINO',
          etiqueta: 'Conductor en camino',
          aclaracion: 'Llegada en 3 min'
        }}
        mensajes={mensajes}
        onVolver={() => undefined}
        onLlamar={() => undefined}
        onEnviarTexto={texto => {
          setMensajes(prev => [...prev, {
            id: `m_${Date.now()}`,
            remitente: 'PROPIO',
            texto,
            hora: '12:15 PM',
            estadoEnvio: 'ENTREGADO'
          }]);
        }}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// C. PreviewChatConductorLight (Modo Claro)
// ---------------------------------------------------------------------------

export function PreviewChatConductorLight() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_TEXTO_CONDUCTOR);

  return (
    <ProveedorDeTema inicial="C2" esquemaForzado="claro">
      <ChatVisual
        rolUsuario="CONDUCTOR"
        contraparte={PASAJERA_FIXTURE}
        contextoViaje={{
          estado: 'LLEGUE',
          etiqueta: 'Esperando en el punto',
          aclaracion: 'Encuentro acordado'
        }}
        mensajes={mensajes}
        onVolver={() => undefined}
        onLlamar={() => undefined}
        onEnviarTexto={texto => {
          setMensajes(prev => [...prev, {
            id: `m_${Date.now()}`,
            remitente: 'PROPIO',
            texto,
            hora: '02:35 PM',
            estadoEnvio: 'ENTREGADO'
          }]);
        }}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// D. PreviewChatConductorDark (Modo Oscuro)
// ---------------------------------------------------------------------------

export function PreviewChatConductorDark() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_TEXTO_CONDUCTOR);

  return (
    <ProveedorDeTema inicial="C2" esquemaForzado="oscuro">
      <ChatVisual
        rolUsuario="CONDUCTOR"
        contraparte={PASAJERA_FIXTURE}
        contextoViaje={{
          estado: 'LLEGUE',
          etiqueta: 'Esperando en el punto',
          aclaracion: 'Encuentro acordado'
        }}
        mensajes={mensajes}
        onVolver={() => undefined}
        onLlamar={() => undefined}
        onEnviarTexto={texto => {
          setMensajes(prev => [...prev, {
            id: `m_${Date.now()}`,
            remitente: 'PROPIO',
            texto,
            hora: '02:35 PM',
            estadoEnvio: 'ENTREGADO'
          }]);
        }}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// E. PreviewChatTexto
// ---------------------------------------------------------------------------

export function PreviewChatTexto() {
  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Conversación de texto',
        aclaracion: 'Agrupación y timestamps'
      }}
      mensajes={MENSAJES_TEXTO_PASAJERA}
      onVolver={() => undefined}
      onLlamar={() => undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// F. PreviewChatImagenes
// ---------------------------------------------------------------------------

export function PreviewChatImagenes() {
  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Fotografías adjuntas',
        aclaracion: 'Miniaturas y visor fullscreen'
      }}
      mensajes={MENSAJES_CON_IMAGENES}
      onVolver={() => undefined}
      onLlamar={() => undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// G. PreviewChatUploading
// ---------------------------------------------------------------------------

export function PreviewChatUploading() {
  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Subiendo imagen',
        aclaracion: 'Progreso y spinner de subida'
      }}
      mensajes={MENSAJES_UPLOADING}
      onVolver={() => undefined}
      onLlamar={() => undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// H. PreviewChatFailedRetry
// ---------------------------------------------------------------------------

export function PreviewChatFailedRetry() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_FAILED_RETRY);

  const handleReintentar = (id: string) => {
    setMensajes(prev => prev.map(m => m.id === id ? { ...m, estadoEnvio: 'ENTREGADO' } : m));
  };

  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Envío fallido',
        aclaracion: 'Botón táctil de reintento'
      }}
      mensajes={mensajes}
      onVolver={() => undefined}
      onLlamar={() => undefined}
      onReintentarEnvio={handleReintentar}
    />
  );
}

// ---------------------------------------------------------------------------
// I. PreviewChatOffline
// ---------------------------------------------------------------------------

export function PreviewChatOffline() {
  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Modo sin conexión',
        aclaracion: 'Mensajes en espera de red'
      }}
      estadoChat="OFFLINE"
      mensajes={MENSAJES_TEXTO_PASAJERA}
      onVolver={() => undefined}
      onLlamar={() => undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// J. PreviewChatEmpty
// ---------------------------------------------------------------------------

export function PreviewChatEmpty() {
  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Chat vacío',
        aclaracion: 'Inicio amigable'
      }}
      estadoChat="VACIO"
      mensajes={[]}
      onVolver={() => undefined}
      onLlamar={() => undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// K. PreviewChatError
// ---------------------------------------------------------------------------

export function PreviewChatError() {
  const [recargando, setRecargando] = useState(false);

  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Error de sincronización',
        aclaracion: 'Reintento de conexión'
      }}
      estadoChat={recargando ? 'CARGANDO' : 'ERROR'}
      errorTexto="No fue posible conectar con el canal de mensajería del viaje"
      mensajes={[]}
      onVolver={() => undefined}
      onLlamar={() => undefined}
      onReintentarCarga={() => {
        setRecargando(true);
        setTimeout(() => setRecargando(false), 800);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// L. PreviewPassengerDriverAssigned
// ---------------------------------------------------------------------------

export function PreviewPassengerDriverAssigned() {
  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoPasajeraSheet
            estado="DRIVER_ASSIGNED"
            conductor={CONDUCTOR_FIXTURE}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            tiempoLlegadaTexto="Llega en 3 min"
            distanciaTexto="A 850 metros"
            mensajesSinLeer={1}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
            onViajeSeguro={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// M. PreviewPassengerArrived
// ---------------------------------------------------------------------------

export function PreviewPassengerArrived() {
  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoPasajeraSheet
            estado="ARRIVED"
            conductor={CONDUCTOR_FIXTURE}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            mensajesSinLeer={0}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
            onViajeSeguro={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// N. PreviewPassengerInProgress
// ---------------------------------------------------------------------------

export function PreviewPassengerInProgress() {
  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoPasajeraSheet
            estado="IN_PROGRESS"
            conductor={CONDUCTOR_FIXTURE}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            mensajesSinLeer={0}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
            onViajeSeguro={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// O. PreviewDriverDriverAssigned
// ---------------------------------------------------------------------------

export function PreviewDriverDriverAssigned() {
  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoConductorSheet
            estado="DRIVER_ASSIGNED"
            pasajero={{
              nombre: PASAJERA_FIXTURE.nombre,
              iniciales: PASAJERA_FIXTURE.iniciales
            }}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            metodoPago="Efectivo $3.50"
            tarifaBs="Bs. 210,00"
            mensajesSinLeer={1}
            onAccionPrincipal={() => undefined}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// P. PreviewDriverArrived
// ---------------------------------------------------------------------------

export function PreviewDriverArrived() {
  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoConductorSheet
            estado="ARRIVED"
            pasajero={{
              nombre: PASAJERA_FIXTURE.nombre,
              iniciales: PASAJERA_FIXTURE.iniciales
            }}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            metodoPago="Efectivo $3.50"
            tarifaBs="Bs. 210,00"
            mensajesSinLeer={0}
            onAccionPrincipal={() => undefined}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Q. PreviewDriverInProgress
// ---------------------------------------------------------------------------

export function PreviewDriverInProgress() {
  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoConductorSheet
            estado="IN_PROGRESS"
            pasajero={{
              nombre: PASAJERA_FIXTURE.nombre,
              iniciales: PASAJERA_FIXTURE.iniciales
            }}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            metodoPago="Efectivo $3.50"
            tarifaBs="Bs. 210,00"
            mensajesSinLeer={0}
            onAccionPrincipal={() => undefined}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// R. PreviewHistorialDetalleConImagen
// ---------------------------------------------------------------------------

export function PreviewHistorialDetalleConImagen() {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const [estadoAdjunto, setEstadoAdjunto] = useState<'cargado' | 'cargando' | 'error' | 'placeholder'>('cargado');

  return (
    <View style={[estilos.contenedorTodo, { backgroundColor: tema.color.fondo }]}>
      {/* Barra superior de control para probar estados del adjunto */}
      <View style={[
        estilos.barraSelectorEstados,
        {
          top: insets.top + 8,
          backgroundColor: tema.color.superficieElevada,
          borderColor: tema.color.borde,
          marginHorizontal: 16
        }
      ]}>
        <Text style={[estilos.tituloSelectorEstados, { color: tema.color.textoTenue }]}>
          ESTADO DEL ADJUNTO EN HISTORIAL:
        </Text>
        <View style={estilos.filaBotonesSelector}>
          {(['cargado', 'cargando', 'error', 'placeholder'] as const).map(est => {
            const activo = est === estadoAdjunto;
            return (
              <Pressable
                key={est}
                onPress={() => setEstadoAdjunto(est)}
                style={[
                  estilos.botonPildoraEstado,
                  {
                    backgroundColor: activo ? tema.color.acento : tema.color.superficieHundida,
                    borderColor: activo ? tema.color.acento : 'transparent'
                  }
                ]}
              >
                <Text style={[
                  estilos.textoPildoraEstado,
                  {
                    color: activo ? tema.color.sobreAcento : tema.color.textoPrimario,
                    fontWeight: activo ? '700' : '500'
                  }
                ]}>
                  {est}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: insets.top + 64 }}
        contentContainerStyle={{ padding: 16, gap: 14 }}
      >
        {/* Tarjeta Resumen del Viaje */}
        <View style={{
          backgroundColor: tema.color.superficieElevada,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: tema.color.borde,
          gap: 10
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: tema.color.textoPrimario }}>
              Viaje #TRIP-1082
            </Text>
            <View style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: 'rgba(30, 160, 100, 0.16)'
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: tema.color.exito }}>
                COMPLETADO
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 13, color: tema.color.textoSecundario }}>
            Hoy · 11:15 AM · Luis Gómez (Bera SBR 150)
          </Text>

          <Separador />

          {/* Sección de Conversación y Adjunto */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: tema.color.textoPrimario, marginTop: 4 }}>
            Conversación y comprobantes registrados
          </Text>

          <View style={{
            backgroundColor: tema.color.superficieHundida,
            borderRadius: 12,
            padding: 12,
            gap: 10
          }}>
            <Text style={{ fontSize: 13, color: tema.color.textoPrimario, lineHeight: 18 }}>
              «Hola Luis, te comparto la fotografía del portón negro donde estoy esperando para facilitar el encuentro:»
            </Text>

            {/* Componente Presentacional del Adjunto */}
            <AdjuntoDetalleViaje
              rotulo="Referencia de fachada · Portón de encuentro"
              fuente={{
                uri: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop'
              }}
              estadoForzado={estadoAdjunto}
              onReintentar={() => setEstadoAdjunto('cargado')}
            />

            <Text style={{ fontSize: 11, color: tema.color.textoTenue, alignSelf: 'flex-end' }}>
              11:06 AM · Entregado
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Switcher Interactivo de Pasajera (Para el Laboratorio)
// ---------------------------------------------------------------------------

export function PreviewViajeActivoPasajera() {
  const [estadoActual, setEstadoActual] = useState<EstadoViajeCiclo>('DRIVER_ASSIGNED');
  const insets = useSafeAreaInsets();
  const tema = useTema();

  const estados: readonly { clave: EstadoViajeCiclo; etiqueta: string }[] = [
    { clave: 'DRIVER_ASSIGNED', etiqueta: 'En camino' },
    { clave: 'ARRIVED', etiqueta: 'Llegó' },
    { clave: 'IN_PROGRESS', etiqueta: 'En curso' },
    { clave: 'COMPLETED', etiqueta: 'Finalizado' }
  ];

  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <View style={[
          estilos.barraSelectorEstados,
          {
            top: insets.top + 10,
            backgroundColor: tema.color.superficieElevada,
            borderColor: tema.color.borde
          }
        ]}>
          <Text style={[estilos.tituloSelectorEstados, { color: tema.color.textoTenue }]}>
            ESTADO PASAJERA:
          </Text>
          <View style={estilos.filaBotonesSelector}>
            {estados.map(est => {
              const activo = est.clave === estadoActual;
              return (
                <Pressable
                  key={est.clave}
                  onPress={() => setEstadoActual(est.clave)}
                  style={[
                    estilos.botonPildoraEstado,
                    {
                      backgroundColor: activo ? tema.color.acento : tema.color.superficieHundida,
                      borderColor: activo ? tema.color.acento : 'transparent'
                    }
                  ]}
                >
                  <Text style={[
                    estilos.textoPildoraEstado,
                    {
                      color: activo ? tema.color.sobreAcento : tema.color.textoPrimario,
                      fontWeight: activo ? '700' : '500'
                    }
                  ]}>
                    {est.etiqueta}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoPasajeraSheet
            estado={estadoActual}
            conductor={CONDUCTOR_FIXTURE}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            tiempoLlegadaTexto={estadoActual === 'DRIVER_ASSIGNED' ? 'Llega en 3 min' : null}
            distanciaTexto={estadoActual === 'DRIVER_ASSIGNED' ? 'A 850 metros' : null}
            mensajesSinLeer={1}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
            onViajeSeguro={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Switcher Interactivo de Conductor (Para el Laboratorio)
// ---------------------------------------------------------------------------

export function PreviewViajeActivoConductor() {
  const [estadoActual, setEstadoActual] = useState<EstadoViajeCiclo>('DRIVER_ASSIGNED');
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  const tema = useTema();

  const estados: readonly { clave: EstadoViajeCiclo; etiqueta: string }[] = [
    { clave: 'DRIVER_ASSIGNED', etiqueta: '1. Asignado' },
    { clave: 'ARRIVED', etiqueta: '2. Llegué' },
    { clave: 'IN_PROGRESS', etiqueta: '3. En viaje' },
    { clave: 'COMPLETED', etiqueta: '4. Fin' }
  ];

  const avanzarCiclo = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      if (estadoActual === 'DRIVER_ASSIGNED') {
        setEstadoActual('ARRIVED');
      } else if (estadoActual === 'ARRIVED') {
        setEstadoActual('IN_PROGRESS');
      } else if (estadoActual === 'IN_PROGRESS') {
        setEstadoActual('COMPLETED');
      } else {
        setEstadoActual('DRIVER_ASSIGNED');
      }
    }, 450);
  };

  return (
    <View style={estilos.contenedorTodo}>
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        <View style={[
          estilos.barraSelectorEstados,
          {
            top: insets.top + 10,
            backgroundColor: tema.color.superficieElevada,
            borderColor: tema.color.borde
          }
        ]}>
          <Text style={[estilos.tituloSelectorEstados, { color: tema.color.textoTenue }]}>
            CICLO CONDUCTOR:
          </Text>
          <View style={estilos.filaBotonesSelector}>
            {estados.map(est => {
              const activo = est.clave === estadoActual;
              return (
                <Pressable
                  key={est.clave}
                  onPress={() => setEstadoActual(est.clave)}
                  style={[
                    estilos.botonPildoraEstado,
                    {
                      backgroundColor: activo ? tema.color.acento : tema.color.superficieHundida,
                      borderColor: activo ? tema.color.acento : 'transparent'
                    }
                  ]}
                >
                  <Text style={[
                    estilos.textoPildoraEstado,
                    {
                      color: activo ? tema.color.sobreAcento : tema.color.textoPrimario,
                      fontWeight: activo ? '700' : '500'
                    }
                  ]}>
                    {est.etiqueta}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoConductorSheet
            estado={estadoActual}
            pasajero={{
              nombre: PASAJERA_FIXTURE.nombre,
              iniciales: PASAJERA_FIXTURE.iniciales
            }}
            origen="Av. 4 Bella Vista, Calle 72"
            destino="C.C. Sambil Maracaibo"
            metodoPago="Efectivo $3.50"
            tarifaBs="Bs. 210,00"
            mensajesSinLeer={2}
            submitting={submitting}
            onAccionPrincipal={avanzarCiclo}
            onAbrirChat={() => undefined}
            onLlamar={() => undefined}
          />
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Switcher Interactivo de Estados del Chat (Para el Laboratorio)
// ---------------------------------------------------------------------------

export function PreviewChatEstados() {
  const [estadoActual, setEstadoActual] = useState<EstadoGeneralChat>('CARGANDO');
  const insets = useSafeAreaInsets();
  const tema = useTema();

  const estadosDisponibles: readonly { clave: EstadoGeneralChat; etiqueta: string }[] = [
    { clave: 'CARGANDO', etiqueta: 'Cargando' },
    { clave: 'VACIO', etiqueta: 'Vacío' },
    { clave: 'ERROR', etiqueta: 'Error' },
    { clave: 'OFFLINE', etiqueta: 'Offline' }
  ];

  return (
    <View style={estilos.contenedorTodo}>
      <View style={[
        estilos.barraSelectorEstados,
        {
          top: insets.top + 8,
          backgroundColor: tema.color.superficieElevada,
          borderColor: tema.color.borde,
          marginHorizontal: 16
        }
      ]}>
        <Text style={[estilos.tituloSelectorEstados, { color: tema.color.textoTenue }]}>
          ESTADO DEL CHAT:
        </Text>
        <View style={estilos.filaBotonesSelector}>
          {estadosDisponibles.map(est => {
            const activo = est.clave === estadoActual;
            return (
              <Pressable
                key={est.clave}
                onPress={() => setEstadoActual(est.clave)}
                style={[
                  estilos.botonPildoraEstado,
                  {
                    backgroundColor: activo ? tema.color.acento : tema.color.superficieHundida,
                    borderColor: activo ? tema.color.acento : 'transparent'
                  }
                ]}
              >
                <Text style={[
                  estilos.textoPildoraEstado,
                  {
                    color: activo ? tema.color.sobreAcento : tema.color.textoPrimario,
                    fontWeight: activo ? '700' : '500'
                  }
                ]}>
                  {est.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1, marginTop: insets.top + 64 }}>
        <ChatVisual
          rolUsuario="PASAJERA"
          contraparte={CONDUCTOR_FIXTURE}
          contextoViaje={{
            estado: 'EN_CAMINO',
            etiqueta: 'Conductor en camino',
            aclaracion: 'Prueba de estados'
          }}
          estadoChat={estadoActual}
          errorTexto="Fallo al contactar el servicio de mensajería cifrada"
          mensajes={estadoActual === 'OFFLINE' ? MENSAJES_TEXTO_PASAJERA : []}
          onVolver={() => undefined}
          onLlamar={() => undefined}
          onReintentarCarga={() => setEstadoActual('CARGANDO')}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos del Conjunto de Previews
// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  contenedorTodo: {
    flex: 1
  },
  barraSelectorEstados: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8
  },
  tituloSelectorEstados: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  filaBotonesSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6
  },
  botonPildoraEstado: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  textoPildoraEstado: {
    fontSize: 11
  }
});
