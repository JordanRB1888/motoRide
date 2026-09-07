/**
 * Superficies visuales premium de Viaje Activo para Pasajero y Conductor.
 * ACTIVE-TRIP-VISUAL-PASS — +58Express
 *
 * MODO DÍA Y MODO NOCHE PARITARIOS
 *
 * Respeta tokens de ThemeContext (useTema y useEsquema).
 * La acción principal del conductor es siempre clara y destacada.
 * En el pasajero, el mapa es el protagonista y la hoja no inventa datos que
 * el backend no proporcione (ETA o rating sólo si existen).
 */

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema, useEsquema } from '../theme/ThemeContext';
import { Icono } from './Icono';
import { Separador } from './HojaInferior';

// ---------------------------------------------------------------------------
// Tipos del Viaje Activo
// ---------------------------------------------------------------------------

export type EstadoViajeCiclo = 'DRIVER_ASSIGNED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ConductorViajeVisual {
  readonly nombre: string;
  readonly iniciales: string;
  readonly fotoUri?: string;
  readonly vehiculo: string; // Ej: "Bera SBR 150"
  readonly placa: string; // Ej: "AB123CD"
  readonly calificacion?: string | null; // Ej: "4.9" o null
  readonly telefono?: string;
}

export interface PasajeroViajeVisual {
  readonly nombre: string;
  readonly iniciales: string;
  readonly fotoUri?: string;
  readonly telefono?: string;
  readonly viajesCompletados?: number;
}

export interface PropiedadesViajePasajera {
  readonly estado: EstadoViajeCiclo;
  readonly conductor: ConductorViajeVisual;
  readonly origen: string;
  readonly destino: string;
  readonly distanciaTexto?: string | null;
  readonly tiempoLlegadaTexto?: string | null;
  readonly mensajesSinLeer?: number;
  readonly onAbrirChat?: () => void;
  readonly onLlamar?: () => void;
  readonly onViajeSeguro?: () => void;
  readonly onCancelar?: () => void;
}

export interface PropiedadesViajeConductor {
  readonly estado: EstadoViajeCiclo;
  readonly pasajero: PasajeroViajeVisual;
  readonly origen: string;
  readonly destino: string;
  readonly metodoPago?: string; // Ej: "Efectivo $3.50"
  readonly tarifaBs?: string;
  readonly mensajesSinLeer?: number;
  readonly submitting?: boolean;
  readonly errorAccion?: string | null;
  readonly onAccionPrincipal?: (estadoActual: EstadoViajeCiclo) => void;
  readonly onAbrirChat?: () => void;
  readonly onLlamar?: () => void;
  readonly onCancelar?: () => void;
}

// ---------------------------------------------------------------------------
// 1. VIAJE ACTIVO: SUPERFICIE PASAJERA
// ---------------------------------------------------------------------------

export function ViajeActivoPasajeraSheet({
  estado,
  conductor,
  origen,
  destino,
  distanciaTexto,
  tiempoLlegadaTexto,
  mensajesSinLeer = 0,
  onAbrirChat,
  onLlamar,
  onViajeSeguro,
  onCancelar
}: PropiedadesViajePasajera) {
  const tema = useTema();
  const esquema = useEsquema();
  const esOscuro = esquema === 'oscuro';
  const insets = useSafeAreaInsets();
  const colorAcento = tema.color.acento;

  // Configuración contextual según el estado del ciclo
  const configEstado = (() => {
    switch (estado) {
      case 'DRIVER_ASSIGNED':
        return {
          titulo: 'Conductor en camino',
          subtitulo: tiempoLlegadaTexto || distanciaTexto || 'Tu conductor va hacia el punto de recogida',
          colorBadge: colorAcento,
          fondoBadge: esOscuro ? 'rgba(245, 195, 0, 0.14)' : 'rgba(245, 195, 0, 0.22)',
          textoBadge: tema.color.acentoTexto,
          etiquetaBadge: 'EN CAMINO'
        };
      case 'ARRIVED':
        return {
          titulo: '¡Tu conductor llegó!',
          subtitulo: 'Te está esperando en el punto de encuentro',
          colorBadge: tema.color.exito,
          fondoBadge: esOscuro ? 'rgba(30, 160, 100, 0.16)' : 'rgba(15, 115, 80, 0.15)',
          textoBadge: tema.color.exito,
          etiquetaBadge: 'LLEGÓ AL PUNTO'
        };
      case 'IN_PROGRESS':
        return {
          titulo: 'En viaje hacia tu destino',
          subtitulo: 'Disfruta el trayecto con +58Express',
          colorBadge: colorAcento,
          fondoBadge: esOscuro ? 'rgba(245, 195, 0, 0.14)' : 'rgba(245, 195, 0, 0.22)',
          textoBadge: tema.color.acentoTexto,
          etiquetaBadge: 'EN CURSO'
        };
      case 'COMPLETED':
        return {
          titulo: 'Viaje finalizado',
          subtitulo: 'Has llegado con éxito a tu destino',
          colorBadge: tema.color.exito,
          fondoBadge: esOscuro ? 'rgba(30, 160, 100, 0.16)' : 'rgba(15, 115, 80, 0.15)',
          textoBadge: tema.color.exito,
          etiquetaBadge: 'COMPLETADO'
        };
    }
  })();

  return (
    <View style={[
      estilos.tarjetaViaje,
      {
        backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
        paddingBottom: Math.max(insets.bottom, 12) + 4
      }
    ]}>
      {/* 1. ESTADO Y LLEGADA */}
      <View style={estilos.encabezadoEstadoFila}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <View style={[
              estilos.badgeEstadoPildora,
              { backgroundColor: configEstado.fondoBadge, borderColor: configEstado.colorBadge }
            ]}>
              <View style={[estilos.puntoEstadoMini, { backgroundColor: configEstado.colorBadge }]} />
              <Text style={[estilos.badgeEstadoTexto, { color: configEstado.textoBadge }]}>
                {configEstado.etiquetaBadge}
              </Text>
            </View>
          </View>

          <Text style={[estilos.tituloEstadoViaje, { color: tema.color.textoPrimario }]}>
            {configEstado.titulo}
          </Text>
          <Text style={[estilos.subtituloEstadoViaje, { color: tema.color.textoSecundario }]}>
            {configEstado.subtitulo}
          </Text>
        </View>
      </View>

      <Separador margen={8} />

      {/* 2. CONDUCTOR CARD (JERARQUÍA ELEVADA: NOMBRE / VEHÍCULO / PLACA) */}
      <View style={estilos.filaConductor}>
        <View style={[
          estilos.conductorAvatarMarco,
          {
            backgroundColor: esOscuro ? '#25272B' : '#E5E8EC',
            borderColor: colorAcento
          }
        ]}>
          {conductor.fotoUri ? (
            <Image source={{ uri: conductor.fotoUri }} style={estilos.conductorAvatarFoto} />
          ) : (
            <Text style={[estilos.conductorAvatarIniciales, { color: tema.color.textoPrimario }]}>
              {conductor.iniciales || 'CD'}
            </Text>
          )}
        </View>

        <View style={estilos.conductorDatosColumna}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[estilos.conductorNombreTexto, { color: tema.color.textoPrimario }]} numberOfLines={1}>
              {conductor.nombre}
            </Text>
            {conductor.calificacion && (
              <View style={[
                estilos.calificacionMiniBadge,
                { backgroundColor: esOscuro ? 'rgba(245,195,0,0.16)' : 'rgba(245,195,0,0.25)' }
              ]}>
                <Text style={[estilos.calificacionMiniTexto, { color: tema.color.acentoTexto }]}>
                  ★ {conductor.calificacion}
                </Text>
              </View>
            )}
          </View>

          <View style={estilos.vehiculoPlacaFila}>
            <Text style={[estilos.vehiculoModeloTexto, { color: tema.color.textoSecundario }]}>
              {conductor.vehiculo}
            </Text>
            <View style={[
              estilos.placaContenedor,
              {
                backgroundColor: esOscuro ? '#17191C' : '#E8EBED',
                borderColor: esOscuro ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'
              }
            ]}>
              <Text style={[estilos.placaTexto, { color: tema.color.textoPrimario }]}>
                {conductor.placa}
              </Text>
            </View>
          </View>
        </View>

        {/* ACCIONES RÁPIDAS: MENSAJE (CON BADGE) Y LLAMADA */}
        <View style={estilos.accionesRapidasFila}>
          <Pressable
            onPress={onAbrirChat}
            accessibilityRole="button"
            accessibilityLabel="Abrir chat con el conductor"
            style={({ pressed }) => [
              estilos.botonAccionIcono,
              {
                backgroundColor: pressed
                  ? tema.color.superficieHundida
                  : (esOscuro ? '#202225' : '#E7EAEF'),
                borderColor: mensajesSinLeer > 0
                  ? colorAcento
                  : (esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
              }
            ]}
          >
            <Icono nombre="mensaje" color={tema.color.textoPrimario} tamano={18} />
            {mensajesSinLeer > 0 && (
              <View style={[estilos.badgeMensajesNoLeidos, { backgroundColor: colorAcento }]}>
                <Text style={[estilos.textoBadgeMensajes, { color: tema.color.sobreAcento }]}>
                  {mensajesSinLeer}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={onLlamar}
            accessibilityRole="button"
            accessibilityLabel="Llamar al conductor"
            style={({ pressed }) => [
              estilos.botonAccionIcono,
              {
                backgroundColor: pressed
                  ? tema.color.superficieHundida
                  : (esOscuro ? '#202225' : '#E7EAEF'),
                borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
              }
            ]}
          >
            <Icono nombre="telefono" color={tema.color.textoPrimario} tamano={18} />
          </Pressable>
        </View>
      </View>

      <Separador margen={8} />

      {/* 3. PUNTOS DE RECORRIDO */}
      <View style={estilos.puntosRecorridoBloque}>
        <View style={estilos.puntoFila}>
          <View style={[estilos.puntoHitoCirculo, { backgroundColor: tema.color.textoPrimario }]} />
          <Text style={[estilos.puntoDireccionTexto, { color: tema.color.textoPrimario }]} numberOfLines={1}>
            {origen}
          </Text>
        </View>

        <View style={estilos.lineaConectoraRuta} />

        <View style={estilos.puntoFila}>
          <View style={[estilos.puntoHitoCirculo, { backgroundColor: colorAcento }]} />
          <Text style={[estilos.puntoDireccionTexto, { color: tema.color.textoPrimario }]} numberOfLines={1}>
            {destino}
          </Text>
        </View>
      </View>

      {/* 4. SALIDA DE EMERGENCIA / VIAJE SEGURO */}
      {onViajeSeguro && (
        <Pressable
          onPress={onViajeSeguro}
          accessibilityRole="button"
          accessibilityLabel="Abrir centro de viaje seguro"
          style={({ pressed }) => [
            estilos.barraSeguridadEmergencia,
            {
              backgroundColor: pressed
                ? (esOscuro ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')
                : 'transparent'
            }
          ]}
        >
          <Icono nombre="escudo" color={colorAcento} tamano={16} />
          <Text style={[estilos.textoSeguridadEmergencia, { color: tema.color.textoSecundario }]}>
            Centro de Viaje Seguro y Asistencia 24/7
          </Text>
        </Pressable>
      )}

      {onCancelar && estado !== 'COMPLETED' && (
        <Pressable
          onPress={onCancelar}
          accessibilityRole="button"
          accessibilityLabel="Cancelar viaje"
          style={({ pressed }) => [{
            marginTop: 6,
            alignItems: 'center',
            paddingVertical: 6,
            opacity: pressed ? 0.6 : 1
          }]}
        >
          <Text style={{ fontSize: 12, color: tema.color.textoTenue, fontWeight: '500' }}>
            Cancelar viaje
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. VIAJE ACTIVO: SUPERFICIE CONDUCTOR
// ---------------------------------------------------------------------------

export function ViajeActivoConductorSheet({
  estado,
  pasajero,
  origen,
  destino,
  metodoPago = 'Efectivo $3.50',
  tarifaBs,
  mensajesSinLeer = 0,
  submitting = false,
  errorAccion,
  onAccionPrincipal,
  onAbrirChat,
  onLlamar,
  onCancelar
}: PropiedadesViajeConductor) {
  const tema = useTema();
  const esquema = useEsquema();
  const esOscuro = esquema === 'oscuro';
  const insets = useSafeAreaInsets();
  const colorAcento = tema.color.acento;
  const colorSobreAcento = tema.color.sobreAcento;

  // Botón Principal según ciclo de vida del conductor
  const configAccion = (() => {
    switch (estado) {
      case 'DRIVER_ASSIGNED':
        return {
          titulo: 'LLEGUÉ AL PUNTO DE ENCUENTRO',
          subtitulo: 'Notifica al pasajero que ya estás esperando',
          etiquetaEstado: 'EN CAMINO A RECOGER',
          colorEstado: colorAcento
        };
      case 'ARRIVED':
        return {
          titulo: 'INICIAR VIAJE',
          subtitulo: 'Confirma que el pasajero ya abordó el vehículo',
          etiquetaEstado: 'ESPERANDO AL PASAJERO',
          colorEstado: tema.color.exito
        };
      case 'IN_PROGRESS':
        return {
          titulo: 'FINALIZAR VIAJE',
          subtitulo: 'Completar trayecto y cobrar',
          etiquetaEstado: 'VIAJE EN CURSO',
          colorEstado: colorAcento
        };
      case 'COMPLETED':
        return {
          titulo: 'VIAJE FINALIZADO',
          subtitulo: 'Listo para recibir nuevas solicitudes',
          etiquetaEstado: 'COMPLETADO',
          colorEstado: tema.color.exito
        };
    }
  })();

  return (
    <View style={[
      estilos.tarjetaViaje,
      {
        backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
        paddingBottom: Math.max(insets.bottom, 12) + 6
      }
    ]}>
      {/* 1. ESTADO DE OPERACIÓN DEL CONDUCTOR */}
      <View style={estilos.encabezadoEstadoFila}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <View style={[estilos.puntoEstadoMini, { backgroundColor: configAccion.colorEstado }]} />
            <Text style={[estilos.badgeEstadoTexto, { color: tema.color.textoSecundario }]}>
              {configAccion.etiquetaEstado}
            </Text>
          </View>
          <Text style={[estilos.tituloEstadoViaje, { color: tema.color.textoPrimario }]}>
            {configAccion.subtitulo}
          </Text>
        </View>

        {/* Tarifa destacada */}
        <View style={[
          estilos.tarifaBadgeContenedor,
          {
            backgroundColor: esOscuro ? '#1C1F23' : '#EDF0F3',
            borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
          }
        ]}>
          <Text style={[estilos.tarifaMontoTexto, { color: tema.color.acentoTexto }]}>
            {metodoPago}
          </Text>
          {tarifaBs && (
            <Text style={[estilos.tarifaBsTexto, { color: tema.color.textoTenue }]}>
              {tarifaBs}
            </Text>
          )}
        </View>
      </View>

      <Separador margen={8} />

      {/* 2. DATOS DEL PASAJERO */}
      <View style={estilos.filaConductor}>
        <View style={[
          estilos.conductorAvatarMarco,
          {
            backgroundColor: esOscuro ? '#25272B' : '#E5E8EC',
            borderColor: colorAcento
          }
        ]}>
          {pasajero.fotoUri ? (
            <Image source={{ uri: pasajero.fotoUri }} style={estilos.conductorAvatarFoto} />
          ) : (
            <Text style={[estilos.conductorAvatarIniciales, { color: tema.color.textoPrimario }]}>
              {pasajero.iniciales || 'P'}
            </Text>
          )}
        </View>

        <View style={estilos.conductorDatosColumna}>
          <Text style={[estilos.conductorNombreTexto, { color: tema.color.textoPrimario }]} numberOfLines={1}>
            {pasajero.nombre}
          </Text>
          <Text style={[estilos.vehiculoModeloTexto, { color: tema.color.textoSecundario }]}>
            Pasajero verificado · +58Express
          </Text>
        </View>

        {/* ACCIONES SECUNDARIAS: MENSAJE Y LLAMADA */}
        <View style={estilos.accionesRapidasFila}>
          <Pressable
            onPress={onAbrirChat}
            accessibilityRole="button"
            accessibilityLabel="Abrir chat con el pasajero"
            style={({ pressed }) => [
              estilos.botonAccionIcono,
              {
                backgroundColor: pressed
                  ? tema.color.superficieHundida
                  : (esOscuro ? '#202225' : '#E7EAEF'),
                borderColor: mensajesSinLeer > 0
                  ? colorAcento
                  : (esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
              }
            ]}
          >
            <Icono nombre="mensaje" color={tema.color.textoPrimario} tamano={18} />
            {mensajesSinLeer > 0 && (
              <View style={[estilos.badgeMensajesNoLeidos, { backgroundColor: colorAcento }]}>
                <Text style={[estilos.textoBadgeMensajes, { color: colorSobreAcento }]}>
                  {mensajesSinLeer}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={onLlamar}
            accessibilityRole="button"
            accessibilityLabel="Llamar al pasajero"
            style={({ pressed }) => [
              estilos.botonAccionIcono,
              {
                backgroundColor: pressed
                  ? tema.color.superficieHundida
                  : (esOscuro ? '#202225' : '#E7EAEF'),
                borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
              }
            ]}
          >
            <Icono nombre="telefono" color={tema.color.textoPrimario} tamano={18} />
          </Pressable>
        </View>
      </View>

      <Separador margen={8} />

      {/* 3. DIRECCIONES */}
      <View style={estilos.puntosRecorridoBloque}>
        <View style={estilos.puntoFila}>
          <View style={[estilos.puntoHitoCirculo, { backgroundColor: tema.color.textoPrimario }]} />
          <Text style={[estilos.puntoDireccionTexto, { color: tema.color.textoPrimario }]} numberOfLines={1}>
            {origen}
          </Text>
        </View>

        <View style={estilos.lineaConectoraRuta} />

        <View style={estilos.puntoFila}>
          <View style={[estilos.puntoHitoCirculo, { backgroundColor: colorAcento }]} />
          <Text style={[estilos.puntoDireccionTexto, { color: tema.color.textoPrimario }]} numberOfLines={1}>
            {destino}
          </Text>
        </View>
      </View>

      {/* ERROR BANNER SI ACCIÓN FALLA */}
      {errorAccion && (
        <View style={[
          estilos.bannerErrorAccion,
          { backgroundColor: esOscuro ? 'rgba(211,47,47,0.15)' : '#FDE8E8' }
        ]}>
          <Text style={[estilos.textoErrorAccion, { color: tema.color.peligro }]}>
            {errorAccion}
          </Text>
        </View>
      )}

      {/* 4. ACCIÓN PRINCIPAL (PRIMARY LIFECYCLE CTA) */}
      <Pressable
        onPress={() => onAccionPrincipal?.(estado)}
        disabled={submitting || estado === 'COMPLETED'}
        accessibilityRole="button"
        accessibilityLabel={configAccion.titulo}
        style={({ pressed }) => [
          estilos.botonLifecyclePrincipal,
          {
            backgroundColor: estado === 'COMPLETED'
              ? (esOscuro ? '#25282D' : '#D0D4DC')
              : (pressed ? tema.color.acentoPresionado : colorAcento),
            opacity: submitting ? 0.6 : 1
          }
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colorSobreAcento} />
        ) : (
          <View style={estilos.filaBotonLifecycle}>
            <Text style={[estilos.textoBotonLifecycle, { color: colorSobreAcento }]}>
              {configAccion.titulo}
            </Text>
            <View style={[estilos.flechaBotonLifecycle, { borderColor: colorSobreAcento }]} />
          </View>
        )}
      </Pressable>

      {onCancelar && estado !== 'COMPLETED' && (
        <Pressable
          onPress={onCancelar}
          accessibilityRole="button"
          accessibilityLabel="Cancelar o rechazar servicio"
          style={({ pressed }) => [{
            marginTop: 8,
            alignItems: 'center',
            paddingVertical: 6,
            opacity: pressed ? 0.6 : 1
          }]}
        >
          <Text style={{ fontSize: 12, color: tema.color.textoTenue, fontWeight: '500' }}>
            Cancelar servicio
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos de las Superficies de Viaje
// ---------------------------------------------------------------------------

const estilos = StyleSheet.create({
  tarjetaViaje: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8
  },
  encabezadoEstadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  badgeEstadoPildora: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  puntoEstadoMini: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  badgeEstadoTexto: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  tituloEstadoViaje: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  subtituloEstadoViaje: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1
  },
  tarifaBadgeContenedor: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-end'
  },
  tarifaMontoTexto: {
    fontSize: 14,
    fontWeight: '800'
  },
  tarifaBsTexto: {
    fontSize: 11,
    fontWeight: '500'
  },
  filaConductor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4
  },
  conductorAvatarMarco: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  conductorAvatarFoto: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  conductorAvatarIniciales: {
    fontSize: 18,
    fontWeight: '700'
  },
  conductorDatosColumna: {
    flex: 1
  },
  conductorNombreTexto: {
    fontSize: 16,
    fontWeight: '700'
  },
  calificacionMiniBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6
  },
  calificacionMiniTexto: {
    fontSize: 11,
    fontWeight: '700'
  },
  vehiculoPlacaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3
  },
  vehiculoModeloTexto: {
    fontSize: 13,
    fontWeight: '500'
  },
  placaContenedor: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1
  },
  placaTexto: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  accionesRapidasFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  botonAccionIcono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  badgeMensajesNoLeidos: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  textoBadgeMensajes: {
    fontSize: 10,
    fontWeight: '800'
  },
  puntosRecorridoBloque: {
    gap: 8,
    marginVertical: 4
  },
  puntoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  puntoHitoCirculo: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  puntoDireccionTexto: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1
  },
  lineaConectoraRuta: {
    width: 2,
    height: 10,
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
    marginLeft: 3
  },
  barraSeguridadEmergencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 8
  },
  textoSeguridadEmergencia: {
    fontSize: 12,
    fontWeight: '500'
  },
  bannerErrorAccion: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8
  },
  textoErrorAccion: {
    fontSize: 12,
    fontWeight: '600'
  },
  botonLifecyclePrincipal: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3
  },
  filaBotonLifecycle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  textoBotonLifecycle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  flechaBotonLifecycle: {
    width: 7,
    height: 7,
    borderTopWidth: 2,
    borderRightWidth: 2,
    transform: [{ rotate: '45deg' }]
  }
});
