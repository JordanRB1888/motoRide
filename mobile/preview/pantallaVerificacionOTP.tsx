/**
 * Laboratorio y Vista Previa Interactiva para Verificación OTP y Recuperar Contraseña.
 *
 * Permite conmutar en vivo entre los 7 estados visuales requeridos:
 *   1. Elegir canal (WhatsApp preferido / SMS / Email)
 *   2. Introducir código de 6 dígitos
 *   3. Reenviar código / contador visual
 *   4. Código incorrecto
 *   5. Código expirado
 *   6. Verificación exitosa
 *   7. Recuperar contraseña (Paso 1, Paso 2, Paso 3)
 */

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '../theme/ThemeContext';
import { espaciado } from '../theme/tokens';
import { useMovimientoReducido } from '../ui/movimiento';
import { HeroDeMarca, LemaConFilos, PlacaDeMarca } from '../ui/HeroDeMarca';
import { LogoEncendido } from '../ui/Marca';
import { LEMA } from '../domain/entrada';
import {
  C2VerificacionOTP,
  CanalOTP,
  SelectorCanalOTP,
  SuperficieRecuperarContrasena
} from '../ui/VerificacionOTP';

export type EscenarioOTPPreview =
  | 'canal'
  | 'codigo'
  | 'reenvio'
  | 'error'
  | 'expirado'
  | 'exito'
  | 'recuperar';

export function PantallaPreviewVerificacionOTP() {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

  const [escenario, setEscenario] = useState<EscenarioOTPPreview>('canal');
  const [canalElegido, setCanalElegido] = useState<CanalOTP>('whatsapp');
  const [codigoPrueba, setCodigoPrueba] = useState('582');
  const [pasoRecuperar, setPasoRecuperar] = useState<1 | 2 | 3>(1);

  const ESCENARIOS: readonly { id: EscenarioOTPPreview; etiqueta: string }[] = [
    { id: 'canal', etiqueta: '1. Canal' },
    { id: 'codigo', etiqueta: '2. 6 Dígitos' },
    { id: 'reenvio', etiqueta: '3. Reenvío' },
    { id: 'error', etiqueta: '4. Error' },
    { id: 'expirado', etiqueta: '5. Expirado' },
    { id: 'exito', etiqueta: '6. Éxito' },
    { id: 'recuperar', etiqueta: '7. Recuperar' }
  ];

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }} testID="preview-verificacion-otp">
      <StatusBar style="dark" />

      {/* Barra de control superior para el laboratorio */}
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingBottom: 8,
          paddingHorizontal: 12,
          backgroundColor: tema.color.superficieHundida,
          borderBottomWidth: 1,
          borderBottomColor: tema.color.borde,
          gap: 6
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '800', color: tema.color.textoSecundario, letterSpacing: 0.5 }}>
          LABORATORIO OTP · ESTADO VISUAL
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {ESCENARIOS.map(esc => {
            const activo = escenario === esc.id;
            return (
              <Pressable
                key={esc.id}
                onPress={() => {
                  setEscenario(esc.id);
                  if (esc.id === 'error') setCodigoPrueba('984312');
                  if (esc.id === 'codigo') setCodigoPrueba('582');
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: activo ? tema.color.acento : tema.color.superficie,
                  borderWidth: 1,
                  borderColor: activo ? tema.color.acento : tema.color.borde
                }}
                testID={`boton-escenario-${esc.id}`}
              >
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: '700',
                    color: activo ? tema.color.sobreAcento : tema.color.textoPrimario
                  }}
                >
                  {esc.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sub-selector para pasos de recuperación */}
        {escenario === 'recuperar' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: tema.color.textoTenue }}>
              Paso de recuperación:
            </Text>
            {([1, 2, 3] as const).map(p => (
              <Pressable
                key={p}
                onPress={() => setPasoRecuperar(p)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: pasoRecuperar === p ? tema.color.acentoTexto : tema.color.superficie,
                  borderWidth: 1,
                  borderColor: tema.color.borde
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: pasoRecuperar === p ? '#FFFFFF' : tema.color.textoSecundario
                  }}
                >
                  Paso {p}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Renderizado de la superficie según el escenario */}
      {escenario === 'canal' ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
          >
            <HeroDeMarca variante="acceso" insetSuperior={0} sangrado={espaciado.xl} quieto={quieto}>
              <PlacaDeMarca ancho={352}>
                <LogoEncendido ancho={284} llegada="frenazo" />
              </PlacaDeMarca>
              <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
                <LemaConFilos texto={LEMA} />
              </View>
            </HeroDeMarca>

            <View
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
              <SelectorCanalOTP
                canalSeleccionado={canalElegido}
                onSeleccionarCanal={setCanalElegido}
                onContinuar={() => setEscenario('codigo')}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : escenario === 'recuperar' ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
          >
            <HeroDeMarca variante="acceso" insetSuperior={0} sangrado={espaciado.xl} quieto={quieto}>
              <PlacaDeMarca ancho={352}>
                <LogoEncendido ancho={284} llegada="frenazo" />
              </PlacaDeMarca>
              <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
                <LemaConFilos texto={LEMA} />
              </View>
            </HeroDeMarca>

            <View
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
              <SuperficieRecuperarContrasena
                paso={pasoRecuperar}
                onSolicitarCodigo={() => setPasoRecuperar(2)}
                onVerificarCodigo={() => setPasoRecuperar(3)}
                onActualizarContrasena={() => {
                  Alert.alert('Éxito', 'Contraseña actualizada correctamente en preview.');
                  setEscenario('exito');
                }}
                onVolverALogin={() => Alert.alert('Volver', 'Navegación simulada hacia login.')}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        /* C2VerificacionOTP completo para los estados: codigo, reenvio, error, expirado, exito */
        <C2VerificacionOTP
          canal={canalElegido}
          codigo={codigoPrueba}
          onChangeCodigo={setCodigoPrueba}
          estado={
            escenario === 'error'
              ? 'error'
              : escenario === 'expirado'
              ? 'expirado'
              : escenario === 'exito'
              ? 'exito'
              : 'normal'
          }
          segundosRestantes={escenario === 'reenvio' ? 0 : 42}
          onVerificar={cod => {
            Alert.alert('Verificar', `Código ingresado: ${cod}`);
            setEscenario('exito');
          }}
          onReenviar={() => {
            Alert.alert('Reenviar', `Reenviando código por ${canalElegido}...`);
            setEscenario('codigo');
          }}
          onCambiarCanal={() => setEscenario('canal')}
          onContinuarExito={() => {
            Alert.alert('Finalizado', 'Verificación completada.');
            setEscenario('canal');
          }}
        />
      )}
    </View>
  );
}
