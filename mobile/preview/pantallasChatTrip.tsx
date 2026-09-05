/**
 * Pantallas de demostración del Laboratorio Visual para Chat y Viaje Activo.
 * CHAT-TRIP-VISUAL-PASS — +58Express
 *
 * Catálogo de 8 escenarios requeridos:
 * A. PreviewChatPasajeraLight: Chat Pasajero en Modo Claro
 * B. PreviewChatPasajeraDark: Chat Pasajero en Modo Oscuro
 * C. PreviewChatConductorLight: Chat Conductor en Modo Claro
 * D. PreviewChatConductorDark: Chat Conductor en Modo Oscuro
 * E. PreviewViajeActivoPasajera: Viaje Activo Pasajero con selector de estados
 * F. PreviewViajeActivoConductor: Viaje Activo Conductor con ciclo de acciones
 * G. PreviewChatImagenes: Chat con previsualización de imágenes CHAT-2
 * H. PreviewChatEstados: Demostración interactiva de estados del Chat
 *
 * 100% AISLADO DE LA LÓGICA DE PRODUCCIÓN Y DE CHAT-2 EN MOTORIDE-CURRENT.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProveedorDeTema, useTema } from '../theme/ThemeContext';
import { ChatVisual, type MensajeVisual, type EstadoGeneralChat } from '../ui/ChatVisual';
import {
  ViajeActivoPasajeraSheet,
  ViajeActivoConductorSheet,
  type EstadoViajeCiclo
} from '../ui/TripVisual';
import { LienzoDeMapa, type HitoEnMapa, type VehiculoEnMapa } from '../ui/Mapa';
import { HojaInferior } from '../ui/HojaInferior';

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

const MENSAJES_BASE_PASAJERA: readonly MensajeVisual[] = [
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

const MENSAJES_BASE_CONDUCTOR: readonly MensajeVisual[] = [
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
    remitente: 'PROPIO',
    texto: 'Subiendo referencia de la fachada...',
    imagenUri: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop',
    hora: '11:08 AM',
    estadoEnvio: 'ENVIANDO',
    progresoSubida: 68
  },
  {
    id: 'img5',
    remitente: 'PROPIO',
    texto: 'Foto de comprobante de punto',
    imagenUri: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600&auto=format&fit=crop',
    hora: '11:09 AM',
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
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_BASE_PASAJERA);

  const handleEnviar = (texto: string) => {
    const nuevo: MensajeVisual = {
      id: `msj_${Date.now()}`,
      remitente: 'PROPIO',
      texto,
      hora: '12:15 PM',
      estadoEnvio: 'ENTREGADO'
    };
    setMensajes(prev => [...prev, nuevo]);
  };

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
        onEnviarTexto={handleEnviar}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// B. PreviewChatPasajeraDark (Modo Oscuro)
// ---------------------------------------------------------------------------

export function PreviewChatPasajeraDark() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_BASE_PASAJERA);

  const handleEnviar = (texto: string) => {
    const nuevo: MensajeVisual = {
      id: `msj_${Date.now()}`,
      remitente: 'PROPIO',
      texto,
      hora: '12:15 PM',
      estadoEnvio: 'ENTREGADO'
    };
    setMensajes(prev => [...prev, nuevo]);
  };

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
        onEnviarTexto={handleEnviar}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// C. PreviewChatConductorLight (Modo Claro)
// ---------------------------------------------------------------------------

export function PreviewChatConductorLight() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_BASE_CONDUCTOR);

  const handleEnviar = (texto: string) => {
    const nuevo: MensajeVisual = {
      id: `msj_${Date.now()}`,
      remitente: 'PROPIO',
      texto,
      hora: '02:35 PM',
      estadoEnvio: 'ENTREGADO'
    };
    setMensajes(prev => [...prev, nuevo]);
  };

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
        onEnviarTexto={handleEnviar}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// D. PreviewChatConductorDark (Modo Oscuro)
// ---------------------------------------------------------------------------

export function PreviewChatConductorDark() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_BASE_CONDUCTOR);

  const handleEnviar = (texto: string) => {
    const nuevo: MensajeVisual = {
      id: `msj_${Date.now()}`,
      remitente: 'PROPIO',
      texto,
      hora: '02:35 PM',
      estadoEnvio: 'ENTREGADO'
    };
    setMensajes(prev => [...prev, nuevo]);
  };

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
        onEnviarTexto={handleEnviar}
      />
    </ProveedorDeTema>
  );
}

// ---------------------------------------------------------------------------
// E. PreviewViajeActivoPasajera (Con Selector de Estados)
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
      {/* Mapa como fondo */}
      <LienzoDeMapa
        vehiculos={VEHICULOS_MAPA_PREVIEW}
        hitos={HITOS_MAPA_PREVIEW}
        conRuta
      >
        {/* Selector de Estado Flotante en la parte superior para pruebas */}
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
                      backgroundColor: activo
                        ? tema.color.acento
                        : (tema.color.superficieHundida),
                      borderColor: activo ? tema.color.acento : 'transparent'
                    }
                  ]}
                >
                  <Text style={[
                    estilos.textoPildoraEstado,
                    {
                      color: activo
                        ? tema.color.sobreAcento
                        : tema.color.textoPrimario,
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

        {/* Hoja Inferior con el Componente de Viaje */}
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <ViajeActivoPasajeraSheet
            estado={estadoActual}
            conductor={{
              nombre: CONDUCTOR_FIXTURE.nombre,
              iniciales: CONDUCTOR_FIXTURE.iniciales,
              vehiculo: CONDUCTOR_FIXTURE.vehiculo,
              placa: CONDUCTOR_FIXTURE.placa,
              calificacion: CONDUCTOR_FIXTURE.calificacion
            }}
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
// F. PreviewViajeActivoConductor (Con Ciclo de Acciones)
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
        {/* Selector de Estado Flotante en la parte superior para pruebas */}
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
                      backgroundColor: activo
                        ? tema.color.acento
                        : (tema.color.superficieHundida),
                      borderColor: activo ? tema.color.acento : 'transparent'
                    }
                  ]}
                >
                  <Text style={[
                    estilos.textoPildoraEstado,
                    {
                      color: activo
                        ? tema.color.sobreAcento
                        : tema.color.textoPrimario,
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

        {/* Hoja Inferior con el Componente de Conductor */}
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
// G. PreviewChatImagenes (CHAT-2 Media Previews)
// ---------------------------------------------------------------------------

export function PreviewChatImagenes() {
  const [mensajes, setMensajes] = useState<readonly MensajeVisual[]>(MENSAJES_CON_IMAGENES);

  const handleReintentar = (id: string) => {
    setMensajes(prev => prev.map(m => m.id === id ? { ...m, estadoEnvio: 'ENTREGADO' } : m));
  };

  const handleEnviar = (texto: string) => {
    const nuevo: MensajeVisual = {
      id: `msj_${Date.now()}`,
      remitente: 'PROPIO',
      texto,
      hora: '11:10 AM',
      estadoEnvio: 'ENTREGADO'
    };
    setMensajes(prev => [...prev, nuevo]);
  };

  return (
    <ChatVisual
      rolUsuario="PASAJERA"
      contraparte={CONDUCTOR_FIXTURE}
      contextoViaje={{
        estado: 'EN_CAMINO',
        etiqueta: 'Conductor en camino',
        aclaracion: 'Prueba de imágenes'
      }}
      mensajes={mensajes}
      onVolver={() => undefined}
      onLlamar={() => undefined}
      onEnviarTexto={handleEnviar}
      onReintentarEnvio={handleReintentar}
    />
  );
}

// ---------------------------------------------------------------------------
// H. PreviewChatEstados (LOADING, EMPTY, ERROR, OFFLINE)
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
      {/* Selector superior de estados para el laboratorio */}
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
                    backgroundColor: activo
                      ? tema.color.acento
                      : (tema.color.superficieHundida),
                    borderColor: activo ? tema.color.acento : 'transparent'
                  }
                ]}
              >
                <Text style={[
                  estilos.textoPildoraEstado,
                  {
                    color: activo
                      ? tema.color.sobreAcento
                      : tema.color.textoPrimario,
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
          mensajes={estadoActual === 'OFFLINE' ? MENSAJES_BASE_PASAJERA : []}
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
