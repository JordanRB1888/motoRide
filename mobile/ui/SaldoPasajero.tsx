/**
 * Superficie visual de Saldo Passenger de +58Express.
 *
 * ESTADOS VISUALES DISPONIBLES:
 *   - EMPTY: Estado vacío intencional, premium y terminado (por defecto).
 *     Sin billetera ficticia, sin dinero inventado y sin botones falsos (retirar/depositar).
 *   - LOADING: Esqueletos visuales y spinner de carga con pulso sutil.
 *   - CONTENT: Estructura visual de saldo y movimientos (marcada exclusivamente como PREVIEW/DEV).
 *   - ERROR: Manejo visual de error con acción de reintento.
 *   - OFFLINE: Notificación contextual de falta de conectividad.
 *   - REFRESHING: Indicador de actualización activa.
 */

import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  View
} from 'react-native';
import { useTema } from '../theme/ThemeContext';
import { useAireDeArriba } from './seguro';
import { useMovimientoReducido } from './movimiento';
import { Txt } from './componentes';
import { Icono, type NombreDeIcono } from './Icono';

export type EstadoVisualSaldo =
  | 'LOADING'
  | 'CONTENT'
  | 'EMPTY'
  | 'ERROR'
  | 'OFFLINE'
  | 'REFRESHING';

export interface PropiedadesSaldoPasajero {
  readonly estado?: EstadoVisualSaldo;
  readonly onReintentar?: () => void;
  readonly onCambiarEstado?: (estado: EstadoVisualSaldo) => void;
  readonly modoLaboratorio?: boolean;
}

/** Cabecera amarilla oficial a sangre con respeto de safe area superior */
function CabeceraSaldo({ children }: { readonly children: ReactNode }) {
  const tema = useTema();
  const arriba = useAireDeArriba();

  return (
    <View
      style={{
        backgroundColor: tema.color.acento,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingTop: 22 + arriba,
        paddingBottom: 26,
        overflow: 'hidden'
      }}
    >
      <View
        style={{
          position: 'absolute',
          right: -70,
          top: -70,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: 'rgba(255,255,255,0.16)'
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: -30,
          bottom: -90,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: 'rgba(255,255,255,0.10)'
        }}
      />
      <View style={{ gap: 13 }}>{children}</View>
    </View>
  );
}

/** Banda de sección contenedora */
function Banda({
  titulo,
  detalle,
  icono,
  children
}: {
  readonly titulo: string;
  readonly detalle?: string;
  readonly icono: NombreDeIcono;
  readonly children: ReactNode;
}) {
  const tema = useTema();

  return (
    <View
      style={{
        backgroundColor: tema.color.superficieElevada,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: tema.color.borde,
        paddingVertical: tema.ritmo.dentroDeTarjeta,
        paddingHorizontal: tema.ritmo.margenPantalla,
        gap: tema.ritmo.entreElementos
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${tema.color.acento}26`
          }}
        >
          <Icono nombre={icono} color={tema.color.acentoTexto} tamano={19} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt nivel="encabezado">{titulo}</Txt>
          {detalle ? <Txt nivel="pie" tono="tenue">{detalle}</Txt> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** Barra de pestañas selectoras para inspeccionar visualmente los estados en desarrollo */
export function SelectorDeLaboratorioSaldo({
  estadoActual,
  onSeleccionar
}: {
  readonly estadoActual: EstadoVisualSaldo;
  readonly onSeleccionar: (estado: EstadoVisualSaldo) => void;
}) {
  const tema = useTema();
  const estados: readonly EstadoVisualSaldo[] = [
    'EMPTY',
    'LOADING',
    'CONTENT',
    'ERROR',
    'OFFLINE',
    'REFRESHING'
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingVertical: 10,
        backgroundColor: tema.color.superficieHundida,
        borderBottomWidth: 1,
        borderBottomColor: tema.color.borde
      }}
    >
      {estados.map(est => {
        const activo = est === estadoActual;
        return (
          <Pressable
            key={est}
            onPress={() => onSeleccionar(est)}
            accessibilityRole="button"
            accessibilityLabel={`Estado ${est}`}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 14,
              backgroundColor: activo ? tema.color.acento : tema.color.superficie,
              borderWidth: 1,
              borderColor: activo ? tema.color.acento : tema.color.borde
            }}
          >
            <Txt
              nivel="etiqueta"
              tono={activo ? 'sobreAcento' : 'secundario'}
              estilo={{ fontSize: 11, fontWeight: activo ? '700' : '500' }}
            >
              {est}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bloque esqueleto pulsante para estado LOADING */
function BloqueEsqueleto({
  alto = 20,
  ancho = '100%',
  radio = 8
}: {
  readonly alto?: number;
  readonly ancho?: number | `${number}%`;
  readonly radio?: number;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (quieto) return;
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.9,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [anim, quieto]);

  return (
    <Animated.View
      style={{
        width: ancho as never,
        height: alto,
        borderRadius: radio,
        backgroundColor: tema.color.superficieHundida,
        opacity: quieto ? 0.6 : anim
      }}
    />
  );
}

export function SaldoPasajero({
  estado: estadoProp,
  onReintentar,
  onCambiarEstado,
  modoLaboratorio = false
}: PropiedadesSaldoPasajero) {
  const tema = useTema();
  const [estadoLocal, setEstadoLocal] = useState<EstadoVisualSaldo>(estadoProp ?? 'EMPTY');

  useEffect(() => {
    if (estadoProp) {
      setEstadoLocal(estadoProp);
    }
  }, [estadoProp]);

  const seleccionarEstado = (nuevo: EstadoVisualSaldo) => {
    setEstadoLocal(nuevo);
    onCambiarEstado?.(nuevo);
  };

  const estado = estadoLocal;

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      {modoLaboratorio ? (
        <SelectorDeLaboratorioSaldo
          estadoActual={estado}
          onSeleccionar={seleccionarEstado}
        />
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Cabecera dinámica según el estado */}
        <CabeceraSaldo>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt nivel="etiqueta" tono="sobreAcento" estilo={{ opacity: 0.85, fontWeight: '700' }}>
              SALDO DIGITAL
            </Txt>
            <View style={{ flex: 1 }} />
            <Icono nombre="escudo" color={tema.color.sobreAcento} tamano={15} />
            <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.85 }}>
              Transacción protegida
            </Txt>
          </View>

          {estado === 'LOADING' ? (
            <View style={{ gap: 8, paddingVertical: 6 }}>
              <BloqueEsqueleto alto={32} ancho="65%" radio={8} />
              <BloqueEsqueleto alto={16} ancho="40%" radio={6} />
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              <Txt nivel="titulo" tono="sobreAcento" accessibilityRole="header">
                Tu saldo +58Express
              </Txt>
              <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.82 }}>
                Gestión digital de saldo para tus viajes y servicios
              </Txt>
            </View>
          )}

          {estado === 'REFRESHING' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 4,
                backgroundColor: 'rgba(0,0,0,0.08)',
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 20,
                alignSelf: 'flex-start'
              }}
            >
              <ActivityIndicator size="small" color={tema.color.sobreAcento} />
              <Txt nivel="pie" tono="sobreAcento" estilo={{ fontWeight: '600' }}>
                Actualizando información...
              </Txt>
            </View>
          ) : null}
        </CabeceraSaldo>

        {/* 1. ESTADO: EMPTY (ESTADO OFICIAL DE SALDO PASSENGER) */}
        {estado === 'EMPTY' && (
          <View style={{ paddingBottom: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
            {/* Card Principal de Estado Vacío */}
            <View
              style={{
                marginHorizontal: tema.ritmo.margenPantalla,
                marginTop: 20,
                padding: 24,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: tema.color.superficie,
                borderWidth: 1,
                borderColor: tema.color.borde,
                alignItems: 'center',
                gap: 16,
                ...tema.superficie.sombra
              }}
            >
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${tema.color.acento}24`,
                  borderWidth: 2,
                  borderColor: tema.color.acento
                }}
              >
                <Icono nombre="billetera" color={tema.color.acentoTexto} tamano={34} />
              </View>

              <View style={{ alignItems: 'center', gap: 8 }}>
                <Txt nivel="titulo" centrado>
                  Gestión de saldo en preparación
                </Txt>
                <Txt nivel="cuerpo" tono="secundario" centrado estilo={{ lineHeight: 22 }}>
                  Aquí podrás gestionar tu saldo, registrar recargas y consultar tus movimientos
                  de +58Express de manera transparente y segura.
                </Txt>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: `${tema.color.acento}1a`,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: `${tema.color.acento}55`
                }}
              >
                <Icono nombre="reloj" color={tema.color.acentoTexto} tamano={15} />
                <Txt nivel="etiqueta" tono="acento" estilo={{ fontWeight: '700' }}>
                  Disponible próximamente
                </Txt>
              </View>
            </View>

            {/* Información de método de pago actual */}
            <Banda titulo="¿Cómo pagas tus viajes hoy?" icono="moto">
              <Txt nivel="cuerpo" tono="secundario" estilo={{ lineHeight: 22 }}>
                Tus traslados actuales se abonan directamente al conductor en efectivo
                o a través de los canales acordados en cada viaje. No necesitas recargar saldo
                previo para viajar.
              </Txt>
            </Banda>

            {/* Garantía de Seguridad */}
            <Banda titulo="Seguridad y respaldo oficial" icono="escudo">
              <Txt nivel="cuerpo" tono="secundario" estilo={{ lineHeight: 22 }}>
                Cuando el servicio de billetera esté activo, cada operación contará con validación
                en tiempo real y respaldo institucional con la tasa oficial del BCV.
              </Txt>
            </Banda>
          </View>
        )}

        {/* 2. ESTADO: LOADING */}
        {estado === 'LOADING' && (
          <View style={{ padding: tema.ritmo.margenPantalla, gap: 16 }}>
            <View
              style={{
                padding: 20,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: tema.color.superficie,
                borderWidth: 1,
                borderColor: tema.color.borde,
                gap: 14
              }}
            >
              <BloqueEsqueleto alto={24} ancho="50%" />
              <BloqueEsqueleto alto={16} ancho="85%" />
              <BloqueEsqueleto alto={42} ancho="100%" radio={10} />
            </View>

            <View
              style={{
                padding: 20,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: tema.color.superficie,
                borderWidth: 1,
                borderColor: tema.color.borde,
                gap: 12
              }}
            >
              <BloqueEsqueleto alto={20} ancho="40%" />
              <BloqueEsqueleto alto={14} ancho="75%" />
              <BloqueEsqueleto alto={14} ancho="65%" />
              <BloqueEsqueleto alto={14} ancho="70%" />
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 18, gap: 10 }}>
              <ActivityIndicator size="small" color={tema.color.acento} />
              <Txt nivel="pie" tono="tenue">
                Sincronizando estado del saldo...
              </Txt>
            </View>
          </View>
        )}

        {/* 3. ESTADO: CONTENT (ESTRUCTURA VISUAL — SOLO PREVIEW/DEV, SIN FAKE DATA PERMANENTE) */}
        {estado === 'CONTENT' && (
          <View style={{ paddingBottom: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
            {/* Indicador DEV */}
            <View
              style={{
                marginHorizontal: tema.ritmo.margenPantalla,
                marginTop: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: `${tema.color.acento}20`,
                borderWidth: 1,
                borderColor: tema.color.acento
              }}
            >
              <Icono nombre="ajustes" color={tema.color.acentoTexto} tamano={15} />
              <Txt nivel="etiqueta" tono="acento" estilo={{ fontWeight: '700' }}>
                ESTRUCTURA VISUAL · PREVIEW/DEV
              </Txt>
            </View>

            {/* Estructura de Saldo */}
            <View
              style={{
                marginHorizontal: tema.ritmo.margenPantalla,
                padding: 20,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: tema.color.superficie,
                borderWidth: 1,
                borderColor: tema.color.borde,
                gap: 12,
                ...tema.superficie.sombra
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt nivel="etiqueta" tono="secundario">DISPONIBLE EN CUENTA</Txt>
                <Txt nivel="etiqueta" tono="tenue">ESTRUCTURA</Txt>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt nivel="display" estilo={{ fontSize: 36, fontWeight: '800' }}>
                  — · —
                </Txt>
                <Txt nivel="cuerpo" tono="secundario">USD</Txt>
              </View>

              <Txt nivel="pie" tono="tenue">
                Sin saldo activo en desarrollo · Tasa de cambio BCV referencial
              </Txt>
            </View>

            {/* Estructura de Historial de Movimientos */}
            <Banda
              titulo="Historial de movimientos"
              detalle="Estructura de transacciones (DEV)"
              icono="reloj"
            >
              <View style={{ gap: 12, paddingTop: 4 }}>
                {[1, 2].map(idx => (
                  <View
                    key={idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 10,
                      borderBottomWidth: idx === 1 ? 1 : 0,
                      borderBottomColor: tema.color.borde
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: tema.color.superficieHundida
                      }}
                    >
                      <Icono nombre="billetera" color={tema.color.textoTenue} tamano={16} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt nivel="etiqueta">Registro de prueba #{idx}</Txt>
                      <Txt nivel="pie" tono="tenue">Muestra estructural de renglón</Txt>
                    </View>
                    <Txt nivel="etiqueta" tono="tenue">— · —</Txt>
                  </View>
                ))}
              </View>
            </Banda>

            {/* Métodos de Pago Disponibles en el Futuro */}
            <Banda titulo="Métodos compatibles al activar" icono="escudo">
              <Txt nivel="cuerpo" tono="secundario" estilo={{ lineHeight: 22 }}>
                La integración permitirá recargas automáticas mediante Pago Móvil interbancario,
                transferencias nacionales y pagos con confirmación inmediata.
              </Txt>
            </Banda>
          </View>
        )}

        {/* 4. ESTADO: ERROR */}
        {estado === 'ERROR' && (
          <View
            style={{
              marginHorizontal: tema.ritmo.margenPantalla,
              marginTop: 24,
              padding: 24,
              borderRadius: tema.radio.tarjeta,
              backgroundColor: tema.color.superficie,
              borderWidth: 1,
              borderColor: tema.color.borde,
              alignItems: 'center',
              gap: 16,
              ...tema.superficie.sombra
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${tema.color.peligro}1c`,
                borderWidth: 1.5,
                borderColor: tema.color.peligro
              }}
            >
              <Icono nombre="rayo" color={tema.color.peligro} tamano={28} />
            </View>

            <View style={{ alignItems: 'center', gap: 6 }}>
              <Txt nivel="titulo" centrado>
                No se pudo sincronizar el saldo
              </Txt>
              <Txt nivel="cuerpo" tono="secundario" centrado estilo={{ lineHeight: 22 }}>
                Ocurrió un problema de comunicación al consultar el estado de tu cuenta.
                Tus datos e historial se encuentran protegidos.
              </Txt>
            </View>

            <Pressable
              onPress={onReintentar ?? (() => setEstadoLocal('LOADING'))}
              accessibilityRole="button"
              accessibilityLabel="Reintentar sincronización"
              style={{
                marginTop: 8,
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: tema.radio.boton,
                backgroundColor: tema.color.acento,
                borderWidth: 1,
                borderColor: tema.color.acentoPresionado
              }}
            >
              <Txt nivel="etiqueta" tono="sobreAcento" estilo={{ fontWeight: '700' }}>
                Reintentar
              </Txt>
            </Pressable>
          </View>
        )}

        {/* 5. ESTADO: OFFLINE */}
        {estado === 'OFFLINE' && (
          <View
            style={{
              marginHorizontal: tema.ritmo.margenPantalla,
              marginTop: 24,
              padding: 24,
              borderRadius: tema.radio.tarjeta,
              backgroundColor: tema.color.superficie,
              borderWidth: 1,
              borderColor: tema.color.borde,
              alignItems: 'center',
              gap: 16,
              ...tema.superficie.sombra
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${tema.color.aviso}20`,
                borderWidth: 1.5,
                borderColor: tema.color.aviso
              }}
            >
              <Icono nombre="campana" color={tema.color.aviso} tamano={28} />
            </View>

            <View style={{ alignItems: 'center', gap: 6 }}>
              <Txt nivel="titulo" centrado>
                Sin conexión a internet
              </Txt>
              <Txt nivel="cuerpo" tono="secundario" centrado estilo={{ lineHeight: 22 }}>
                Comprueba tu conexión de datos móviles o red Wi-Fi para consultar
                el estado actualizado de tus servicios de saldo.
              </Txt>
            </View>

            <Pressable
              onPress={onReintentar ?? (() => setEstadoLocal('LOADING'))}
              accessibilityRole="button"
              accessibilityLabel="Comprobar conexión"
              style={{
                marginTop: 8,
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: tema.radio.boton,
                backgroundColor: tema.color.superficieElevada,
                borderWidth: 1.5,
                borderColor: tema.color.borde
              }}
            >
              <Txt nivel="etiqueta" tono="primario" estilo={{ fontWeight: '600' }}>
                Comprobar conexión
              </Txt>
            </Pressable>
          </View>
        )}

        {/* 6. ESTADO: REFRESHING (Renderiza la base EMPTY con animación de recarga) */}
        {estado === 'REFRESHING' && (
          <View style={{ paddingBottom: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
            <View
              style={{
                marginHorizontal: tema.ritmo.margenPantalla,
                marginTop: 20,
                padding: 24,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: tema.color.superficie,
                borderWidth: 1,
                borderColor: tema.color.borde,
                alignItems: 'center',
                gap: 16,
                ...tema.superficie.sombra
              }}
            >
              <ActivityIndicator size="large" color={tema.color.acento} />
              <Txt nivel="encabezado" centrado>
                Sincronizando estado digital...
              </Txt>
              <Txt nivel="pie" tono="secundario" centrado>
                Verificando disponibilidad de la billetera con el servidor.
              </Txt>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
