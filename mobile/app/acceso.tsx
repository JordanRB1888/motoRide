/**
 * Iniciar sesión. Pantalla REAL.
 *
 * VISUAL-PREVIEW-1 le dio la apariencia de la dirección recomendada. La LÓGICA
 * de Wave 1 no cambió ni una línea: el mismo `entrar()` del contexto, el mismo
 * backend como autoridad, el mismo almacén seguro y los mismos mensajes de
 * error.
 *
 * Aquí no se valida ninguna credencial: se manda y se espera. La única lógica
 * local es no enviar campos vacíos, que es cortesía, no seguridad.
 *
 * LA CONTRASEÑA
 *
 * `secureTextEntry`, sin autocorrección ni capitalización. Se limpia del estado
 * en cuanto el acceso tiene éxito. Y no se registra en ningún sitio.
 */

import { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';

import { Pantalla } from '../components/Pantalla';
import { Boton, Txt } from '../ui/componentes';
import { LogoHorizontal } from '../ui/Marca';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { esRolMovil, type RolMovil } from '../services/session';
import { experienciaDeLaIdentidad } from '../domain/authState';
import type { MotivoDeLogin } from '../services/auth';

/**
 * Qué se le dice a la persona en cada fallo.
 *
 * Nunca un volcado de JSON, un código interno ni una traza. «Correo o
 * contraseña incorrectos» no distingue cuál de los dos falló, y es deliberado:
 * decirlo permitiría averiguar qué cuentas existen.
 */
const MENSAJES: Readonly<Record<MotivoDeLogin, string>> = Object.freeze({
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  CUENTA_DESHABILITADA: 'Esta cuenta está deshabilitada. Escríbenos para revisarlo.',
  CONDUCTOR_NO_APROBADO: 'Tu solicitud de conductor todavía no está aprobada.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  SIN_CONEXION: 'No hay conexión con el servidor. Comprueba tu internet.',
  SIN_CONFIGURACION: 'La aplicación no tiene servidor configurado.',
  RESPUESTA_INESPERADA: 'El servidor respondió algo inesperado. Inténtalo de nuevo.',
  ERROR_DEL_SERVIDOR: 'No pudimos completar el acceso. Inténtalo de nuevo.'
});

export default function Acceso() {
  const tema = useTema();
  const { rol } = useLocalSearchParams<{ rol?: string }>();
  const experienciaElegida: RolMovil = esRolMovil(rol) ? rol : 'passenger';

  const { entrar, sesion } = useSesion();
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const campoContrasena = useRef<TextInput>(null);

  const enviando = sesion.estado === 'AUTENTICANDO';
  const puedeEnviar = identificador.trim() !== '' && contrasena !== '' && !enviando;

  const enviar = async () => {
    if (!puedeEnviar) return;
    setError(null);

    const resultado = await entrar({
      identificador,
      contrasena,
      // La experiencia elegida viaja como comprobación: el backend responde 401
      // si no coincide con el rol REAL de la cuenta.
      rol: experienciaElegida
    });

    if (!resultado.ok) {
      setError(MENSAJES[resultado.motivo]);
      return;
    }

    setContrasena('');

    // A dónde se va lo decide la identidad REAL del backend, no lo elegido.
    const destino = experienciaDeLaIdentidad(resultado.usuario);
    router.replace(destino === 'driver' ? '/conductor' : '/pasajero');
  };

  return (
    <Pantalla desplazable testID="acceso">
      {/* La marca primero. Antes esta pantalla abría con un título de texto
          sobre fondo vacío: correcta y de nadie. Lo que hay que reconocer al
          abrir la aplicación es el logotipo, no un encabezado. */}
      <View style={{ paddingTop: tema.ritmo.entreBloques, alignItems: 'center' }}>
        <LogoHorizontal ancho={232} />
      </View>

      <View style={{ paddingTop: tema.ritmo.entreBloques, gap: 6 }}>
        <Txt nivel="titulo" accessibilityRole="header">
          {experienciaElegida === 'driver' ? 'Acceso de conductor' : 'Acceso de pasajera'}
        </Txt>
        <Txt nivel="cuerpo" tono="secundario">Entra con la cuenta que ya tienes.</Txt>
      </View>

      {/* Los campos van sobre el fondo, sin tarjeta que los envuelva. Cada
          campo ya tiene su propia superficie; meterlos además dentro de otra
          era un recuadro dentro de un recuadro. */}
      <View style={[estilos.centro, { gap: tema.ritmo.entreElementos }]}>
        <View style={{ gap: tema.ritmo.entreElementos }}>
          <CampoDeTexto
            etiqueta="Correo o teléfono"
            value={identificador}
            onChangeText={setIdentificador}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            editable={!enviando}
            onSubmitEditing={() => campoContrasena.current?.focus()}
            testID="campo-identificador"
          />

          <CampoDeTexto
            ref={campoContrasena}
            etiqueta="Contraseña"
            value={contrasena}
            onChangeText={setContrasena}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="go"
            editable={!enviando}
            error={error}
            onSubmitEditing={() => { void enviar(); }}
            testID="campo-contrasena"
          />
        </View>

        <Boton
          titulo="Entrar"
          onPress={() => { void enviar(); }}
          cargando={enviando}
          deshabilitado={!puedeEnviar}
          testID="boton-entrar"
        />

        <Boton
          titulo="Cambiar de modo"
          variante="secundario"
          onPress={() => { router.replace('/rol'); }}
          deshabilitado={enviando}
        />
      </View>
    </Pantalla>
  );
}

/** Campo con la apariencia de la dirección activa y la accesibilidad de siempre. */
import { forwardRef } from 'react';
import type { TextInputProps } from 'react-native';

const CampoDeTexto = forwardRef<TextInput, TextInputProps & {
  readonly etiqueta: string;
  readonly error?: string | null;
}>(function CampoDeTexto({ etiqueta, error, ...resto }, ref) {
  const tema = useTema();
  const [enfocado, setEnfocado] = useState(false);
  const hayError = typeof error === 'string' && error !== '';

  return (
    <View style={{ gap: 6 }}>
      <Txt nivel="etiqueta" tono="secundario">{etiqueta}</Txt>

      <TextInput
        ref={ref}
        {...resto}
        // La etiqueta y el error viajan juntos: un borde rojo no le dice nada a
        // quien usa un lector de pantalla.
        accessibilityLabel={hayError ? `${etiqueta}. Error: ${error}` : etiqueta}
        accessibilityState={{ disabled: resto.editable === false }}
        placeholderTextColor={tema.color.textoTenue}
        onFocus={evento => { setEnfocado(true); resto.onFocus?.(evento); }}
        onBlur={evento => { setEnfocado(false); resto.onBlur?.(evento); }}
        style={{
          minHeight: 48,
          borderRadius: tema.radio.campo,
          paddingHorizontal: tema.ritmo.entreElementos,
          paddingVertical: 12,
          fontSize: tema.texto.cuerpo.tamano,
          color: tema.color.textoPrimario,
          backgroundColor: tema.color.superficieElevada,
          borderWidth: 1,
          borderColor: hayError
            ? tema.color.peligro
            : enfocado ? tema.color.acento : tema.color.borde
        }}
      />

      {hayError && (
        <Txt nivel="pie" tono="primario" estilo={{ color: tema.color.peligro } as never}
          accessibilityRole="text">
          {error}
        </Txt>
      )}
    </View>
  );
});

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', paddingVertical: 24 }
});
