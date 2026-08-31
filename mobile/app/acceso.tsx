/**
 * Iniciar sesión.
 *
 * Contra el backend REAL. Aquí no se valida ninguna credencial: se manda y se
 * espera. La única lógica local es no enviar campos vacíos, que es cortesía, no
 * seguridad.
 *
 * LA CONTRASEÑA
 *
 * `secureTextEntry`, sin autocorrección y sin capitalización. Se limpia del
 * estado en cuanto el acceso tiene éxito: dejarla en memoria más tiempo del
 * necesario no aporta nada.
 *
 * Y no se registra. Ni en `console.log`, ni en un mensaje de error, ni en el
 * detalle que se enseña.
 */

import { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { TextInput } from 'react-native';

import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { Pantalla } from '../components/Pantalla';
import { colores, espaciado, tipografia } from '../theme/tokens';
import { useSesion } from '../context/AuthContext';
import { esRolMovil, type RolMovil } from '../services/session';
import { experienciaDeLaIdentidad } from '../domain/authState';
import type { MotivoDeLogin } from '../services/auth';

/**
 * Qué se le dice a la persona en cada fallo.
 *
 * Nunca un volcado de JSON, un código interno ni una traza. «Correo o
 * contraseña incorrectos» no distingue cuál de los dos falló, y eso es
 * deliberado: decirlo permitiría averiguar qué cuentas existen.
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
      // si no coincide con el rol REAL de la cuenta. No es una petición de
      // privilegios.
      rol: experienciaElegida
    });

    if (!resultado.ok) {
      setError(MENSAJES[resultado.motivo]);
      return;
    }

    // Ya no hace falta tenerla en memoria.
    setContrasena('');

    // A dónde se va lo decide la identidad REAL que devolvió el backend, no la
    // experiencia que se eligió en el selector.
    const destino = experienciaDeLaIdentidad(resultado.usuario);
    router.replace(destino === 'driver' ? '/conductor' : '/pasajero');
  };

  return (
    <Pantalla desplazable testID="acceso">
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo} accessibilityRole="header">
          {experienciaElegida === 'driver' ? 'Acceso de conductor' : 'Acceso de pasajera'}
        </Text>
        <Text style={estilos.subtitulo}>Entra con la cuenta que ya tienes.</Text>
      </View>

      <View style={estilos.formulario}>
        <Campo
          etiqueta="Correo o teléfono"
          value={identificador}
          onChangeText={setIdentificador}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          editable={!enviando}
          // Al pulsar «siguiente» salta a la contraseña, sin tener que apuntar.
          onSubmitEditing={() => campoContrasena.current?.focus()}
          testID="campo-identificador"
        />

        <Campo
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

const estilos = StyleSheet.create({
  cabecera: { paddingTop: espaciado.xxl, gap: espaciado.sm },
  titulo: {
    color: colores.textoPrimario,
    fontSize: tipografia.titulo.tamano,
    lineHeight: tipografia.titulo.alto,
    fontWeight: '700'
  },
  subtitulo: {
    color: colores.textoSecundario,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto
  },
  formulario: { flex: 1, justifyContent: 'center', gap: espaciado.lg, paddingVertical: espaciado.xl }
});
