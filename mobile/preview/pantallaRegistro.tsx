/**
 * Vista previa interactiva de la pantalla de REGISTRO (Alta de Usuario).
 *
 * Permite alternar en tiempo de diseño entre:
 *   · Pasajero: «Crea tu cuenta» → «Crear cuenta»
 *   · Conductor: «Paso 1 de 2: Cuenta» → «Crear cuenta y postularme»
 */

import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { C2Registro, type IntencionDeRegistro } from '../ui/Registro';

export function PantallaPreviewRegistro() {
  const tema = useTema();
  const [intencion, setIntencion] = useState<IntencionDeRegistro>('passenger');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      {/* Barra de alternancia de vista previa */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: tema.color.superficieHundida,
          borderBottomWidth: 1,
          borderBottomColor: tema.color.borde
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: tema.color.textoSecundario }}>
          PREVIEW REGISTRO
        </Text>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            onPress={() => setIntencion('passenger')}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: intencion === 'passenger' ? tema.color.acento : tema.color.superficie,
              borderWidth: 1,
              borderColor: intencion === 'passenger' ? tema.color.acento : tema.color.borde
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: intencion === 'passenger' ? tema.color.sobreAcento : tema.color.textoPrimario
              }}
            >
              Pasajero
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setIntencion('driver')}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: intencion === 'driver' ? tema.color.acento : tema.color.superficie,
              borderWidth: 1,
              borderColor: intencion === 'driver' ? tema.color.acento : tema.color.borde
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: intencion === 'driver' ? tema.color.sobreAcento : tema.color.textoPrimario
              }}
            >
              Conductor
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Pantalla visual de registro */}
      <C2Registro
        intencion={intencion}
        onCrearCuenta={datos => {
          Alert.alert(
            intencion === 'driver' ? 'Cuenta creada · Siguiente: Postulación' : 'Cuenta creada',
            `Bienvenido/a ${datos.nombre}. Tu cuenta con ${datos.correo} ha sido registrada.`,
            [{ text: 'Entendido' }]
          );
        }}
        onIrALogin={() => {
          Alert.alert('Navegación a Login', 'Volver a acceso.tsx (Iniciar sesión)');
        }}
        onAbrirDocumentoLegal={tipo => {
          Alert.alert('Documento legal', `Abriendo ${tipo === 'terminos' ? 'Términos' : 'Privacidad'}`);
        }}
      />
    </View>
  );
}
