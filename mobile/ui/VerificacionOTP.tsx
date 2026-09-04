/**
 * Superficies visuales para verificación de identidad y contacto (OTP)
 * y recuperación de contraseña en +58Express.
 *
 * Mantiene estrictamente el lenguaje estético de la marca:
 *   · Hero de marca con curvatura y placa oficial
 *   · WhatsApp como canal preferido/recomendado (sin tocar proveedores)
 *   · Entrada de código de 6 dígitos con foco y auto-avance
 *   · Contador regresivo y estados de error / expirado / éxito
 *   · Flujo visual para recuperación de contraseña
 *
 * SÓLO UI: no toca backend, lógica de red ni autenticación funcional.
 */

import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '../theme/ThemeContext';
import { espaciado } from '../theme/tokens';
import { useMovimientoReducido } from './movimiento';
import { HeroDeMarca, LemaConFilos, PlacaDeMarca } from './HeroDeMarca';
import { LogoEncendido } from './Marca';
import { LEMA } from '../domain/entrada';
import { Boton } from './componentes';
import {
  FlechaDerecha,
  IconoDeCandado,
  IconoDeCorreo,
  IconoDeOjoAnimado,
  IconoDeTelefono
} from './IconosDeCampo';
import { Icono } from './Icono';

// ---------------------------------------------------------------------------
// Tipos de Canales de Verificación
// ---------------------------------------------------------------------------

export type CanalOTP = 'whatsapp' | 'sms' | 'email';

export interface DestinoCanalOTP {
  readonly tipo: CanalOTP;
  readonly titulo: string;
  readonly descripcion: string;
  readonly destinoEnmascarado: string;
  readonly recomendado?: boolean;
}

export const CANALES_OTP_DEFAULT: readonly DestinoCanalOTP[] = [
  {
    tipo: 'whatsapp',
    titulo: 'WhatsApp',
    descripcion: 'Recibe el código al instante por chat',
    destinoEnmascarado: '+58 414 ••• ••32',
    recomendado: true
  },
  {
    tipo: 'sms',
    titulo: 'Mensaje de texto (SMS)',
    descripcion: 'Envío tradicional a tu línea telefónica',
    destinoEnmascarado: '+58 414 ••• ••32'
  },
  {
    tipo: 'email',
    titulo: 'Correo electrónico',
    descripcion: 'Enlace o código a tu bandeja de entrada',
    destinoEnmascarado: 'j•••n@correo.com'
  }
];

// ---------------------------------------------------------------------------
// Ícono Nativo de WhatsApp
// ---------------------------------------------------------------------------

export function IconoWhatsApp({ tamano = 22, color = '#25D366' }: { readonly tamano?: number; readonly color?: string }) {
  const radio = tamano / 2;
  return (
    <View
      style={{
        width: tamano,
        height: tamano,
        borderRadius: radio,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={{
          width: tamano * 0.65,
          height: tamano * 0.65,
          borderRadius: (tamano * 0.65) / 2,
          borderWidth: 1.6,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <View
          style={{
            width: tamano * 0.35,
            height: tamano * 0.22,
            borderTopLeftRadius: 3,
            borderBottomRightRadius: 3,
            borderTopWidth: 2,
            borderLeftWidth: 2,
            borderColor: '#FFFFFF',
            transform: [{ rotate: '-25deg' }]
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: tamano * 0.12,
          left: tamano * 0.12,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderRightWidth: tamano * 0.18,
          borderTopWidth: tamano * 0.18,
          borderRightColor: 'transparent',
          borderTopColor: color,
          transform: [{ rotate: '15deg' }]
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. Selector de Canal de Verificación (WhatsApp Preferido)
// ---------------------------------------------------------------------------

export function SelectorCanalOTP({
  canales = CANALES_OTP_DEFAULT,
  canalSeleccionado,
  onSeleccionarCanal,
  onContinuar,
  cargando = false,
  testID = 'selector-canal-otp'
}: {
  readonly canales?: readonly DestinoCanalOTP[];
  readonly canalSeleccionado: CanalOTP;
  readonly onSeleccionarCanal: (canal: CanalOTP) => void;
  readonly onContinuar: () => void;
  readonly cargando?: boolean;
  readonly testID?: string;
}) {
  const tema = useTema();

  return (
    <View style={{ gap: 20 }} testID={testID}>
      <View style={{ gap: 6 }}>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 26,
            fontWeight: '800',
            letterSpacing: -0.5,
            color: tema.color.textoPrimario,
            lineHeight: 32
          }}
        >
          Elige dónde recibir tu código
        </Text>
        <Text style={{ fontSize: 14.5, color: tema.color.textoSecundario, lineHeight: 21 }}>
          Selecciona tu método de preferencia para validar tu identidad de forma segura.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {canales.map(item => {
          const seleccionado = canalSeleccionado === item.tipo;
          return (
            <Pressable
              key={item.tipo}
              onPress={() => onSeleccionarCanal(item.tipo)}
              accessibilityRole="radio"
              accessibilityState={{ selected: seleccionado }}
              accessibilityLabel={`${item.titulo}, ${item.destinoEnmascarado}`}
              style={({ pressed }) => [
                {
                  borderRadius: 18,
                  borderWidth: seleccionado ? 2 : 1,
                  borderColor: seleccionado ? tema.color.acento : tema.color.borde,
                  backgroundColor: seleccionado
                    ? `${tema.color.acento}10`
                    : tema.color.superficie,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  opacity: pressed ? 0.8 : 1
                },
                seleccionado ? { ...tema.superficie.sombra } : null
              ]}
              testID={`canal-opcion-${item.tipo}`}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: item.tipo === 'whatsapp'
                    ? '#25D36618'
                    : item.tipo === 'sms'
                    ? `${tema.color.acento}20`
                    : `${tema.color.textoPrimario}10`,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {item.tipo === 'whatsapp' ? (
                  <IconoWhatsApp tamano={24} />
                ) : item.tipo === 'sms' ? (
                  <IconoDeTelefono tamano={22} color={tema.color.acentoTexto} />
                ) : (
                  <IconoDeCorreo tamano={22} color={tema.color.textoPrimario} />
                )}
              </View>

              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: tema.color.textoPrimario
                    }}
                  >
                    {item.titulo}
                  </Text>

                  {item.recomendado ? (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: '#25D36622',
                        borderWidth: 1,
                        borderColor: '#25D36666'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: '800',
                          color: '#16A34A',
                          textTransform: 'uppercase',
                          letterSpacing: 0.4
                        }}
                      >
                        Recomendado
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={{ fontSize: 13, color: tema.color.textoSecundario, lineHeight: 17 }}>
                  {item.descripcion}
                </Text>

                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '600',
                    color: seleccionado ? tema.color.acentoTexto : tema.color.textoPrimario,
                    marginTop: 2
                  }}
                >
                  {item.destinoEnmascarado}
                </Text>
              </View>

              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: seleccionado ? tema.color.acento : tema.color.textoTenue,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: seleccionado ? tema.color.acento : 'transparent'
                }}
              >
                {seleccionado ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: tema.color.sobreAcento
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Boton
        titulo="Enviar código de verificación"
        onPress={onContinuar}
        cargando={cargando}
        sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
        estilo={{
          minHeight: 56,
          borderRadius: 28,
          shadowColor: '#D97706',
          shadowOpacity: 0.35,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6
        } as never}
        testID="boton-enviar-codigo"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Entrada de Código de 6 Dígitos Independientes
// ---------------------------------------------------------------------------

export function EntradaCodigoOTP({
  codigo,
  onChangeCodigo,
  longitud = 6,
  estado = 'normal',
  deshabilitado = false,
  testID = 'entrada-codigo-otp'
}: {
  readonly codigo: string;
  readonly onChangeCodigo: (nuevoCodigo: string) => void;
  readonly longitud?: number;
  readonly estado?: 'normal' | 'error' | 'expirado' | 'exito';
  readonly deshabilitado?: boolean;
  readonly testID?: string;
}) {
  const tema = useTema();
  const inputRef = useRef<TextInput>(null);

  const handleChange = (texto: string) => {
    const soloNumeros = texto.replace(/\D/g, '').slice(0, longitud);
    onChangeCodigo(soloNumeros);
  };

  const digitos = Array.from({ length: longitud }, (_, i) => codigo[i] ?? '');
  const indiceActivo = Math.min(codigo.length, longitud - 1);

  return (
    <View style={{ alignItems: 'center', width: '100%', marginVertical: 8 }} testID={testID}>
      <TextInput
        ref={inputRef}
        value={codigo}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={longitud}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        editable={!deshabilitado && estado !== 'expirado' && estado !== 'exito'}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0
        }}
        testID="input-oculto-otp"
      />

      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          width: '100%',
          gap: 8
        }}
        accessibilityRole="button"
        accessibilityLabel="Ingresar código de 6 dígitos"
      >
        {digitos.map((digito, idx) => {
          const estaActivo = idx === indiceActivo && estado === 'normal';
          const estaLleno = digito !== '';

          let colorBorde = tema.color.borde;
          let fondoCelda = tema.color.superficie;

          if (estado === 'error') {
            colorBorde = tema.color.peligro;
            fondoCelda = `${tema.color.peligro}10`;
          } else if (estado === 'expirado') {
            colorBorde = tema.color.textoTenue;
            fondoCelda = tema.color.superficieHundida;
          } else if (estado === 'exito') {
            colorBorde = '#16A34A';
            fondoCelda = '#16A34A12';
          } else if (estaActivo) {
            colorBorde = tema.color.acento;
            fondoCelda = `${tema.color.acento}10`;
          } else if (estaLleno) {
            colorBorde = tema.color.textoPrimario;
          }

          return (
            <View
              key={idx}
              style={{
                flex: 1,
                aspectRatio: 0.85,
                maxWidth: 52,
                borderRadius: 14,
                borderWidth: estaActivo ? 2.2 : 1.5,
                borderColor: colorBorde,
                backgroundColor: fondoCelda,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: estaActivo ? tema.color.acento : '#000000',
                shadowOpacity: estaActivo ? 0.25 : 0.04,
                shadowRadius: estaActivo ? 8 : 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: estaActivo ? 3 : 1
              }}
              testID={`celda-otp-${idx}`}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '800',
                  color: estado === 'error'
                    ? tema.color.peligro
                    : estado === 'exito'
                    ? '#16A34A'
                    : tema.color.textoPrimario,
                  textAlign: 'center'
                }}
              >
                {digito}
              </Text>

              {estaActivo && !estaLleno ? (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    width: 14,
                    height: 2.5,
                    borderRadius: 2,
                    backgroundColor: tema.color.acento
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3. Temporizador de Reenvío y Acciones de Reenvío
// ---------------------------------------------------------------------------

export function ContadorReenvioOTP({
  segundosRestantes,
  onReenviar,
  canal = 'whatsapp',
  onCambiarCanal,
  cargando = false,
  testID = 'contador-reenvio-otp'
}: {
  readonly segundosRestantes: number;
  readonly onReenviar: () => void;
  readonly canal?: CanalOTP;
  readonly onCambiarCanal?: () => void;
  readonly cargando?: boolean;
  readonly testID?: string;
}) {
  const tema = useTema();
  const expirado = segundosRestantes <= 0;

  const canalTexto =
    canal === 'whatsapp' ? 'WhatsApp' : canal === 'sms' ? 'SMS' : 'Correo';

  const formatearTiempo = (seg: number) => {
    const min = Math.floor(seg / 60);
    const s = seg % 60;
    return `${min.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }} testID={testID}>
      {!expirado ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icono nombre="reloj" color={tema.color.textoTenue} tamano={15} />
          <Text style={{ fontSize: 13.5, color: tema.color.textoSecundario, fontWeight: '500' }}>
            Reenviar código en{' '}
            <Text style={{ fontWeight: '700', color: tema.color.acentoTexto }}>
              {formatearTiempo(segundosRestantes)}
            </Text>
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Reenviar código por ${canalTexto}`}
          onPress={onReenviar}
          disabled={cargando}
          hitSlop={8}
          style={{ paddingVertical: 4 }}
          testID="boton-reenviar-codigo"
        >
          <Text style={{ fontSize: 14, color: tema.color.textoSecundario, fontWeight: '500' }}>
            ¿No recibiste el código?{' '}
            <Text style={{ color: tema.color.acentoTexto, fontWeight: '800' }}>
              Reenviar por {canalTexto}
            </Text>
          </Text>
        </Pressable>
      )}

      {onCambiarCanal ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Probar con otro canal de verificación"
          onPress={onCambiarCanal}
          hitSlop={8}
          style={{ paddingVertical: 4 }}
          testID="enlace-cambiar-canal"
        >
          <Text style={{ fontSize: 13, color: tema.color.textoTenue, fontWeight: '600' }}>
            Probar otro método de recepción
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 4 y 5. Avisos Visuales de Error y Expiración
// ---------------------------------------------------------------------------

export function AvisoEstadoOTP({
  estado,
  mensajeError,
  intentosRestantes,
  onSolicitarNuevoCodigo,
  testID = 'aviso-estado-otp'
}: {
  readonly estado: 'error' | 'expirado';
  readonly mensajeError?: string;
  readonly intentosRestantes?: number;
  readonly onSolicitarNuevoCodigo?: () => void;
  readonly testID?: string;
}) {
  const tema = useTema();

  if (estado === 'error') {
    return (
      <View
        style={{
          borderRadius: 14,
          padding: 12,
          backgroundColor: `${tema.color.peligro}12`,
          borderWidth: 1,
          borderColor: `${tema.color.peligro}40`,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10
        }}
        accessibilityRole="alert"
        testID={testID}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: `${tema.color.peligro}25`,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ color: tema.color.peligro, fontWeight: '800', fontSize: 14 }}>!</Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: tema.color.peligro }}>
            {mensajeError ?? 'Código incorrecto'}
          </Text>
          {typeof intentosRestantes === 'number' ? (
            <Text style={{ fontSize: 12, color: tema.color.textoSecundario }}>
              Te quedan {intentosRestantes} {intentosRestantes === 1 ? 'intento' : 'intentos'}.
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 14,
        padding: 14,
        backgroundColor: `${tema.color.acento}14`,
        borderWidth: 1,
        borderColor: `${tema.color.acento}44`,
        gap: 10
      }}
      accessibilityRole="alert"
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icono nombre="reloj" color={tema.color.acentoTexto} tamano={20} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: tema.color.textoPrimario }}>
            Este código ha expirado
          </Text>
          <Text style={{ fontSize: 12, color: tema.color.textoSecundario }}>
            Por seguridad los códigos de verificación vencen a los 5 minutos.
          </Text>
        </View>
      </View>

      {onSolicitarNuevoCodigo ? (
        <Pressable
          onPress={onSolicitarNuevoCodigo}
          accessibilityRole="button"
          accessibilityLabel="Solicitar un nuevo código de verificación"
          style={{
            alignSelf: 'flex-start',
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: tema.color.acento
          }}
          testID="boton-solicitar-nuevo-codigo"
        >
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: tema.color.sobreAcento }}>
            Solicitar nuevo código
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 6. Estado de Verificación Exitosa
// ---------------------------------------------------------------------------

export function EstadoVerificacionExitosa({
  titulo = '¡Identidad verificada!',
  subtitulo = 'Tu cuenta y número de contacto han sido validados con éxito.',
  onContinuar,
  textoBoton = 'Continuar',
  testID = 'estado-verificacion-exitosa'
}: {
  readonly titulo?: string;
  readonly subtitulo?: string;
  readonly onContinuar?: () => void;
  readonly textoBoton?: string;
  readonly testID?: string;
}) {
  const tema = useTema();

  return (
    <View style={{ alignItems: 'center', gap: 20, paddingVertical: 16 }} testID={testID}>
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: '#16A34A18',
          borderWidth: 2,
          borderColor: '#16A34A',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#16A34A',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4
        }}
      >
        <View
          style={{
            width: 32,
            height: 18,
            borderLeftWidth: 3.5,
            borderBottomWidth: 3.5,
            borderColor: '#16A34A',
            transform: [{ rotate: '-45deg' }, { translateY: -2 }]
          }}
        />
      </View>

      <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 24,
            fontWeight: '800',
            color: tema.color.textoPrimario,
            textAlign: 'center',
            letterSpacing: -0.4
          }}
        >
          {titulo}
        </Text>
        <Text
          style={{
            fontSize: 14.5,
            color: tema.color.textoSecundario,
            textAlign: 'center',
            lineHeight: 21
          }}
        >
          {subtitulo}
        </Text>
      </View>

      {onContinuar ? (
        <View style={{ width: '100%', marginTop: 8 }}>
          <Boton
            titulo={textoBoton}
            onPress={onContinuar}
            sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
            estilo={{
              minHeight: 56,
              borderRadius: 28,
              shadowColor: '#D97706',
              shadowOpacity: 0.35,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6
            } as never}
            testID="boton-continuar-exito"
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 7. Flujo Visual Completo de Recuperación de Contraseña
// ---------------------------------------------------------------------------

export function SuperficieRecuperarContrasena({
  paso = 1,
  onSolicitarCodigo,
  onVerificarCodigo,
  onActualizarContrasena,
  onVolverALogin,
  cargando = false,
  testID = 'superficie-recuperar-contrasena'
}: {
  readonly paso?: 1 | 2 | 3;
  readonly onSolicitarCodigo?: (contacto: string, canal: CanalOTP) => void;
  readonly onVerificarCodigo?: (codigo: string) => void;
  readonly onActualizarContrasena?: (nuevaContrasena: string) => void;
  readonly onVolverALogin?: () => void;
  readonly cargando?: boolean;
  readonly testID?: string;
}) {
  const tema = useTema();

  const [contacto, setContacto] = useState('');
  const [canal, setCanal] = useState<CanalOTP>('whatsapp');
  const [codigoOTP, setCodigoOTP] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [verNueva, setVerNueva] = useState(false);
  const [verConfirmacion, setVerConfirmacion] = useState(false);

  const calcularFortaleza = (pwd: string): { nivel: 'debil' | 'media' | 'fuerte'; color: string; ancho: string; etiqueta: string } => {
    if (pwd.length === 0) return { nivel: 'debil', color: tema.color.borde, ancho: '0%', etiqueta: '' };
    if (pwd.length < 6) return { nivel: 'debil', color: tema.color.peligro, ancho: '30%', etiqueta: 'Débil' };
    if (pwd.length < 10 || !/\d/.test(pwd)) return { nivel: 'media', color: '#EAB308', ancho: '65%', etiqueta: 'Aceptable' };
    return { nivel: 'fuerte', color: '#16A34A', ancho: '100%', etiqueta: 'Fuerte' };
  };

  const fortaleza = calcularFortaleza(nuevaContrasena);

  return (
    <View style={{ gap: 20 }} testID={testID}>
      {paso === 1 ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 26,
                fontWeight: '800',
                letterSpacing: -0.5,
                color: tema.color.textoPrimario,
                lineHeight: 32
              }}
            >
              Recupera tu contraseña
            </Text>
            <Text style={{ fontSize: 14.5, color: tema.color.textoSecundario, lineHeight: 21 }}>
              Ingresa el correo o teléfono de tu cuenta para recibir las instrucciones.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: tema.color.textoPrimario }}>
              Correo o teléfono móvil
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 54,
                borderRadius: 16,
                backgroundColor: tema.color.superficie,
                borderWidth: 1.5,
                borderColor: contacto.trim() ? tema.color.acento : tema.color.borde,
                paddingHorizontal: 16,
                gap: 12
              }}
            >
              <IconoDeTelefono tamano={20} color={tema.color.acentoTexto} />
              <TextInput
                placeholder="Ej. 04141234567 o tu@correo.com"
                placeholderTextColor={tema.color.textoTenue}
                value={contacto}
                onChangeText={setContacto}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: '500',
                  color: tema.color.textoPrimario
                }}
                testID="campo-recuperar-contacto"
              />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: tema.color.textoPrimario }}>
              Canal de recepción preferido
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['whatsapp', 'sms', 'email'] as const).map(c => {
                const activo = canal === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCanal(c)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderRadius: 14,
                      borderWidth: activo ? 2 : 1,
                      borderColor: activo ? tema.color.acento : tema.color.borde,
                      backgroundColor: activo ? `${tema.color.acento}12` : tema.color.superficie,
                      alignItems: 'center',
                      gap: 4
                    }}
                    testID={`canal-recuperar-${c}`}
                  >
                    {c === 'whatsapp' ? (
                      <IconoWhatsApp tamano={20} />
                    ) : c === 'sms' ? (
                      <IconoDeTelefono tamano={18} color={activo ? tema.color.acentoTexto : tema.color.textoSecundario} />
                    ) : (
                      <IconoDeCorreo tamano={18} color={activo ? tema.color.acentoTexto : tema.color.textoSecundario} />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: activo ? tema.color.textoPrimario : tema.color.textoSecundario,
                        textTransform: 'capitalize'
                      }}
                    >
                      {c === 'email' ? 'Correo' : c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Boton
            titulo="Continuar"
            onPress={() => onSolicitarCodigo?.(contacto, canal)}
            deshabilitado={!contacto.trim() || cargando}
            cargando={cargando}
            sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
            estilo={{
              minHeight: 56,
              borderRadius: 28
            }}
            testID="boton-continuar-recuperacion"
          />

          {onVolverALogin ? (
            <Pressable
              onPress={onVolverALogin}
              hitSlop={8}
              style={{ alignSelf: 'center', paddingVertical: 4 }}
              testID="enlace-volver-login"
            >
              <Text style={{ fontSize: 13.5, color: tema.color.textoSecundario, fontWeight: '600' }}>
                Volver a Iniciar sesión
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : paso === 2 ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 26,
                fontWeight: '800',
                letterSpacing: -0.5,
                color: tema.color.textoPrimario,
                lineHeight: 32
              }}
            >
              Introduce el código
            </Text>
            <Text style={{ fontSize: 14.5, color: tema.color.textoSecundario, lineHeight: 21 }}>
              Enviamos un código de 6 dígitos a tu {canal === 'whatsapp' ? 'WhatsApp' : canal === 'sms' ? 'teléfono' : 'correo'}.
            </Text>
          </View>

          <EntradaCodigoOTP
            codigo={codigoOTP}
            onChangeCodigo={setCodigoOTP}
          />

          <ContadorReenvioOTP
            segundosRestantes={45}
            onReenviar={() => onSolicitarCodigo?.(contacto, canal)}
            canal={canal}
          />

          <Boton
            titulo="Verificar código"
            onPress={() => onVerificarCodigo?.(codigoOTP)}
            deshabilitado={codigoOTP.length < 6 || cargando}
            cargando={cargando}
            sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
            estilo={{ minHeight: 56, borderRadius: 28 }}
            testID="boton-verificar-otp"
          />
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 26,
                fontWeight: '800',
                letterSpacing: -0.5,
                color: tema.color.textoPrimario,
                lineHeight: 32
              }}
            >
              Nueva contraseña
            </Text>
            <Text style={{ fontSize: 14.5, color: tema.color.textoSecundario, lineHeight: 21 }}>
              Crea una contraseña segura que no hayas utilizado anteriormente.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: tema.color.textoPrimario }}>
              Contraseña nueva
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 54,
                borderRadius: 16,
                backgroundColor: tema.color.superficie,
                borderWidth: 1.5,
                borderColor: nuevaContrasena ? tema.color.acento : tema.color.borde,
                paddingHorizontal: 16,
                gap: 12
              }}
            >
              <IconoDeCandado tamano={20} color={tema.color.acentoTexto} />
              <TextInput
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={tema.color.textoTenue}
                value={nuevaContrasena}
                onChangeText={setNuevaContrasena}
                secureTextEntry={!verNueva}
                autoCapitalize="none"
                style={{ flex: 1, fontSize: 15, fontWeight: '500', color: tema.color.textoPrimario }}
                testID="campo-nueva-contrasena"
              />
              <Pressable onPress={() => setVerNueva(v => !v)} hitSlop={8} testID="ojo-nueva-contrasena">
                <IconoDeOjoAnimado color={tema.color.textoTenue} abierto={verNueva} />
              </Pressable>
            </View>

            {nuevaContrasena ? (
              <View style={{ gap: 4, marginTop: 4 }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: tema.color.borde, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: fortaleza.ancho as any, backgroundColor: fortaleza.color }} />
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: fortaleza.color, alignSelf: 'flex-end' }}>
                  {fortaleza.etiqueta}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: tema.color.textoPrimario }}>
              Confirmar contraseña nueva
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 54,
                borderRadius: 16,
                backgroundColor: tema.color.superficie,
                borderWidth: 1.5,
                borderColor: confirmarContrasena ? (confirmarContrasena === nuevaContrasena ? '#16A34A' : tema.color.peligro) : tema.color.borde,
                paddingHorizontal: 16,
                gap: 12
              }}
            >
              <IconoDeCandado tamano={20} color={tema.color.acentoTexto} />
              <TextInput
                placeholder="Repite tu contraseña nueva"
                placeholderTextColor={tema.color.textoTenue}
                value={confirmarContrasena}
                onChangeText={setConfirmarContrasena}
                secureTextEntry={!verConfirmacion}
                autoCapitalize="none"
                style={{ flex: 1, fontSize: 15, fontWeight: '500', color: tema.color.textoPrimario }}
                testID="campo-confirmar-nueva-contrasena"
              />
              <Pressable onPress={() => setVerConfirmacion(v => !v)} hitSlop={8} testID="ojo-confirmar-contrasena">
                <IconoDeOjoAnimado color={tema.color.textoTenue} abierto={verConfirmacion} />
              </Pressable>
            </View>
          </View>

          <Boton
            titulo="Actualizar contraseña"
            onPress={() => onActualizarContrasena?.(nuevaContrasena)}
            deshabilitado={!nuevaContrasena || nuevaContrasena !== confirmarContrasena || cargando}
            cargando={cargando}
            sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
            estilo={{ minHeight: 56, borderRadius: 28 }}
            testID="boton-actualizar-contrasena"
          />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pantalla C2 Completa de Verificación OTP
// ---------------------------------------------------------------------------

export function C2VerificacionOTP({
  canal = 'whatsapp',
  codigo = '',
  onChangeCodigo,
  estado = 'normal',
  segundosRestantes = 45,
  onVerificar,
  onReenviar,
  onCambiarCanal,
  onContinuarExito,
  // AUTH-FINAL-2: entradas de datos reales. Sus valores por omisión son
  // exactamente los que la pantalla ya mostraba, así que la previsualización
  // no cambia; lo que cambia es que ahora el mensaje y los intentos pueden
  // venir del servidor en vez de estar escritos a mano.
  mensajeError = 'El código ingresado no coincide.',
  intentosRestantes = 2,
  avisoGeneral = null,
  verificando = false,
  testID = 'pantalla-verificacion-otp'
}: {
  readonly canal?: CanalOTP;
  readonly codigo?: string;
  readonly onChangeCodigo?: (c: string) => void;
  readonly estado?: 'normal' | 'error' | 'expirado' | 'exito';
  readonly segundosRestantes?: number;
  readonly onVerificar?: (c: string) => void;
  readonly onReenviar?: () => void;
  readonly onCambiarCanal?: () => void;
  readonly onContinuarExito?: () => void;
  readonly mensajeError?: string;
  readonly intentosRestantes?: number;
  /**
   * Lo que no es un fallo del código: sin conexión, límite alcanzado, canal no
   * disponible. Sin él, esos estados no tendrían dónde aparecer.
   */
  readonly avisoGeneral?: string | null;
  readonly verificando?: boolean;
  readonly testID?: string;
}) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

  const [codigoInterno, setCodigoInterno] = useState(codigo);

  const handleCodigoChange = (nuevo: string) => {
    setCodigoInterno(nuevo);
    onChangeCodigo?.(nuevo);
  };

  const valorCodigo = codigo || codigoInterno;

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID={testID}>
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
        >
          <HeroDeMarca variante="acceso" insetSuperior={insets.top} sangrado={espaciado.xl} quieto={quieto}>
            <PlacaDeMarca ancho={352}>
              <LogoEncendido ancho={284} llegada="frenazo" />
            </PlacaDeMarca>
            <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
              <LemaConFilos texto={LEMA} />
            </View>
          </HeroDeMarca>

          <View
            testID="hoja-de-verificacion"
            style={{
              backgroundColor: tema.color.superficieElevada,
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              marginTop: -16,
              paddingHorizontal: 24,
              paddingTop: 32,
              paddingBottom: 28,
              gap: 20,
              ...tema.superficie.sombra
            }}
          >
            {estado === 'exito' ? (
              <EstadoVerificacionExitosa onContinuar={onContinuarExito} />
            ) : (
              <View style={{ gap: 18 }}>
                <View style={{ gap: 4 }}>
                  <Text
                    accessibilityRole="header"
                    style={{
                      fontSize: 27,
                      fontWeight: '800',
                      letterSpacing: -0.6,
                      color: tema.color.textoPrimario,
                      lineHeight: 33
                    }}
                  >
                    Verifica tu código
                  </Text>
                  <Text style={{ fontSize: 14.5, color: tema.color.textoSecundario, lineHeight: 20 }}>
                    Introduce el código de 6 dígitos que enviamos por{' '}
                    <Text style={{ fontWeight: '700', color: tema.color.textoPrimario }}>
                      {canal === 'whatsapp' ? 'WhatsApp' : canal === 'sms' ? 'SMS' : 'Correo'}
                    </Text>
                    .
                  </Text>
                </View>

                {estado === 'error' ? (
                  <AvisoEstadoOTP estado="error" mensajeError={mensajeError} intentosRestantes={intentosRestantes} />
                ) : estado === 'expirado' ? (
                  <AvisoEstadoOTP estado="expirado" onSolicitarNuevoCodigo={onReenviar} />
                ) : avisoGeneral ? (
                  <AvisoEstadoOTP estado="error" mensajeError={avisoGeneral} testID="aviso-general-otp" />
                ) : null}

                <EntradaCodigoOTP
                  codigo={valorCodigo}
                  onChangeCodigo={handleCodigoChange}
                  estado={estado}
                />

                <ContadorReenvioOTP
                  segundosRestantes={segundosRestantes}
                  onReenviar={() => onReenviar?.()}
                  canal={canal}
                  onCambiarCanal={onCambiarCanal}
                />

                <Boton
                  titulo="Verificar"
                  onPress={() => onVerificar?.(valorCodigo)}
                  cargando={verificando}
                  deshabilitado={valorCodigo.length < 6 || estado === 'expirado' || verificando}
                  sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
                  estilo={{
                    minHeight: 56,
                    borderRadius: 28,
                    shadowColor: '#D97706',
                    shadowOpacity: 0.35,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6
                  } as never}
                  testID="boton-verificar-codigo-final"
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
