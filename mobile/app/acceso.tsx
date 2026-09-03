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
 * en cuanto el acceso tiene éxito. Y no se registra en ningún sitio. El ojo la
 * enseña mientras se escribe —que es lo que evita el tercer intento fallido—,
 * y al entrar se vuelve a ocultar.
 *
 * LA MOTO LLEGA AQUÍ
 *
 * En la bienvenida arranca y se va por la derecha; aquí entra por la izquierda,
 * se pasa de largo y frena. Es un solo gesto partido en dos pantallas. Cuando
 * asienta, se queda al ralentí con el motor encendido.
 *
 * GOOGLE Y APPLE
 *
 * Aquí, que es donde se entra, y sólo con su logotipo. No hay autenticación
 * social real todavía, así que están deshabilitados y una línea debajo lo
 * dice. No se finge nada; tampoco con «¿Olvidaste tu contraseña?», que no abre
 * un flujo que no existe.
 */

import { forwardRef, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import type { ReactNode } from 'react';
import type { TextInputProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '../components/Pantalla';
import { Boton } from '../ui/componentes';
import { LogoEncendido } from '../ui/Marca';
import { HeroDeMarca, LemaConFilos, PlacaDeMarca } from '../ui/HeroDeMarca';
import { DiscoDeMarca, LogoDeApple, LogoDeGoogle } from '../ui/MarcasDeTerceros';
import { FlechaDerecha, IconoDeCandado, IconoDeCorreo, IconoDeOjo } from '../ui/IconosDeCampo';
import { useMovimientoReducido } from '../ui/movimiento';
import { useTema } from '../theme/ThemeContext';
import { espaciado } from '../theme/tokens';
import { useSesion } from '../context/AuthContext';
import {
  AVISO_DE_NO_DISPONIBLE,
  ENTRADA_SOCIAL,
  LEMA,
  describirIntencion,
  destinoTrasEntrar,
  esIntencionDeEntrada
} from '../domain/entrada';
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
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

  // LA INTENCIÓN SE ENSEÑA; EL ROL NO SE ELIGE AQUÍ, NI SE MANDA
  //
  // La bienvenida trae lo que la persona pulsó —Pasajero o Conductor— y aquí
  // sólo se ENSEÑA, como contexto. No viaja al backend. Antes esta pantalla
  // recibía el rol del selector y lo enviaba, y el backend rechaza el acceso
  // si no coincide con el de la cuenta: elegir mal era «Correo o contraseña
  // incorrectos» con una contraseña correcta. La elección manual actuaba como
  // autoridad, y no lo es. La autoridad es la sesión que devuelve el backend:
  // quien entra va a donde su cuenta diga, pulsara lo que pulsara.
  const { intencion: intencionElegida } = useLocalSearchParams<{ intencion?: string }>();
  const intencion = esIntencionDeEntrada(intencionElegida) ? describirIntencion(intencionElegida) : null;

  const { entrar, sesion } = useSesion();
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [aLaVista, setALaVista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campoContrasena = useRef<TextInput>(null);

  const enviando = sesion.estado === 'AUTENTICANDO';
  const puedeEnviar = identificador.trim() !== '' && contrasena !== '' && !enviando;

  const enviar = async () => {
    if (!puedeEnviar) return;
    setError(null);

    const resultado = await entrar({ identificador, contrasena });

    if (!resultado.ok) {
      setError(MENSAJES[resultado.motivo]);
      return;
    }

    setContrasena('');
    setALaVista(false);

    // El rol lo decide la identidad REAL del backend. La intención elegida en
    // la bienvenida sólo elige la puerta de quien todavía no es conductor:
    // quien vino por «Conductor» entra a su postulación.
    const destino = destinoTrasEntrar(resultado.usuario, intencion?.intencion ?? null);
    // La bienvenida y el acceso no se quedan debajo de la casa: volver atrás
    // desde el inicio no debe enseñar la entrada con la sesión ya abierta.
    if (router.canDismiss()) router.dismissAll();
    router.replace(destino);
  };

  return (
    // Sin borde superior: el amarillo llega hasta arriba del todo y el hero se
    // encarga del hueco de la barra de estado. Abajo sí, que es donde está el
    // gesto del sistema.
    <Pantalla desplazable bordes={['bottom']} testID="acceso">
      <StatusBar style="dark" />

      <HeroDeMarca variante="acceso" insetSuperior={insets.top} sangrado={espaciado.xl} quieto={quieto}>
        <PlacaDeMarca ancho={352}>
          {/* Llega de la bienvenida: por la izquierda, y frena. */}
          <LogoEncendido ancho={284} llegada="frenazo" />
        </PlacaDeMarca>
        <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
          <LemaConFilos texto={LEMA} />
        </View>
      </HeroDeMarca>

      {/* LA HOJA DEL FORMULARIO
          Recoge todo lo que hay que rellenar con diseño nítido y moderno. */}
      <View
        testID="hoja-de-acceso"
        style={{
          backgroundColor: tema.color.superficieElevada,
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          marginTop: -16,
          paddingHorizontal: 28,
          paddingTop: 32,
          paddingBottom: 28,
          gap: 22,
          shadowColor: '#000000',
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -4 },
          elevation: 6
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 28,
              fontWeight: '800',
              letterSpacing: -0.6,
              color: tema.color.textoPrimario,
              lineHeight: 34
            }}
          >
            Entra a tu cuenta
          </Text>
          {/* El contexto que trae la bienvenida. Es una pista de a qué venía,
              no una promesa: a dónde va lo dirá su cuenta. */}
          <View testID="acceso-intencion">
            <Text style={{ fontSize: 15, color: tema.color.textoSecundario, fontWeight: '400', marginTop: 2 }}>
              {intencion === null
                ? 'Entras como pasajero.'
                : `Entras como ${intencion.titulo.toLowerCase()}.`}
            </Text>
          </View>
        </View>

        <View style={{ gap: 18 }}>
          <CampoDeTexto
            etiqueta="Correo o teléfono"
            placeholder="Correo o teléfono"
            icono={<IconoDeCorreo tamano={20} color="#9CA3AF" />}
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
            placeholder="Contraseña"
            icono={<IconoDeCandado tamano={20} color="#9CA3AF" />}
            value={contrasena}
            onChangeText={setContrasena}
            secureTextEntry={!aLaVista}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="go"
            editable={!enviando}
            error={error}
            onSubmitEditing={() => { void enviar(); }}
            testID="campo-contrasena"
            accion={
              <Pressable
                onPress={() => setALaVista(visible => !visible)}
                accessibilityRole="button"
                accessibilityLabel={aLaVista ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                accessibilityState={{ selected: aLaVista }}
                hitSlop={10}
                testID="ver-contrasena"
              >
                <IconoDeOjo tamano={20} color="#9CA3AF" tachado={aLaVista} />
              </Pressable>
            }
          />

          <ContrasenaOlvidada />
        </View>

        <Boton
          titulo="Entrar"
          onPress={() => { void enviar(); }}
          cargando={enviando}
          deshabilitado={!puedeEnviar}
          sufijo={<FlechaDerecha color={tema.color.sobreAcento} />}
          estilo={{
            minHeight: 56,
            borderRadius: 28,
            opacity: 1,
            shadowColor: '#D97706',
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6
          } as never}
          testID="boton-entrar"
        />

        <EntradaSocial />
      </View>
    </Pantalla>
  );
}

/**
 * «¿Olvidaste tu contraseña?».
 *
 * El backend NO tiene recuperación —ni ruta, ni correo, ni testigo—, así que
 * esto no abre ningún flujo: dice la verdad y ofrece el camino que sí existe,
 * escribir a soporte. Un enlace a un formulario que no restablece nada sería
 * peor que no tenerlo.
 */
function ContrasenaOlvidada() {
  return (
    <Pressable
      onPress={() => Alert.alert(
        '¿Olvidaste tu contraseña?',
        'Todavía no se puede cambiar desde la aplicación. Escríbenos y te ayudamos a recuperarla.',
        [{ text: 'Entendido' }]
      )}
      accessibilityRole="button"
      accessibilityLabel="¿Olvidaste tu contraseña?"
      hitSlop={8}
      style={{ alignSelf: 'flex-end', marginTop: -4 }}
      testID="contrasena-olvidada"
    >
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#E68A00' }}>
        ¿Olvidaste tu contraseña?
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Google y Apple
// ---------------------------------------------------------------------------

/**
 * Los dos accesos de siempre, sólo con su logotipo.
 *
 * Sin texto dentro del botón, que es lo que pidió el dueño. Lo que no se puede
 * quitar es la verdad: debajo, una línea dice que todavía no están
 * disponibles, y cada botón lleva su nombre completo para quien no ve la
 * pantalla. Un icono apagado sin explicación se lee como una avería.
 */
function EntradaSocial() {
  const google = ENTRADA_SOCIAL.google;
  const apple = ENTRADA_SOCIAL.apple;
  const alguno = google.disponible || apple.disponible;

  return (
    <View style={{ gap: 16 }} testID="entrada-social">
      <Separador texto="o entra con" />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
        <BotonDeMarca nombre={google.titulo} disponible={google.disponible} testID="entrada-google">
          <LogoDeGoogle />
        </BotonDeMarca>

        <BotonDeMarca nombre={apple.titulo} disponible={apple.disponible} testID="entrada-apple">
          <LogoDeApple />
        </BotonDeMarca>
      </View>

      {alguno ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4 }}>
          <IconoDeCandado tamano={14} color="#9CA3AF" />
          <Text style={{ fontSize: 12.5, color: '#9CA3AF', fontWeight: '500' }}>
            {AVISO_DE_NO_DISPONIBLE}
          </Text>
        </View>
      )}
    </View>
  );
}

/** La línea con una palabra en medio. */
function Separador({ texto }: { readonly texto: string }) {
  const linea = { flex: 1, height: 1, backgroundColor: '#E5E7EB' };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 }}>
      <View style={linea} />
      <Text style={{ fontSize: 13, color: '#9CA3AF', fontWeight: '500' }}>{texto}</Text>
      <View style={linea} />
    </View>
  );
}

function BotonDeMarca({ nombre, disponible, onPress, testID, children }: {
  readonly nombre: string;
  readonly disponible: boolean;
  /** Sólo tiene sentido cuando `disponible`; sin él, el botón no hace nada. */
  readonly onPress?: () => void;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const tema = useTema();

  return (
    <Pressable
      disabled={!disponible}
      onPress={onPress}
      accessibilityRole="button"
      // Sin texto visible, el nombre completo vive aquí.
      accessibilityLabel={nombre}
      accessibilityHint={disponible ? undefined : AVISO_DE_NO_DISPONIBLE}
      accessibilityState={{ disabled: !disponible }}
      testID={testID}
      style={({ pressed }) => ({
        flex: 1,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        borderWidth: 1.2,
        borderColor: '#E5E7EB',
        backgroundColor: pressed && disponible ? tema.color.superficieElevada : tema.color.superficieElevada,
        opacity: 1
      })}
    >
      <DiscoDeMarca>{children}</DiscoDeMarca>
    </Pressable>
  );
}

/**
 * Campo con la apariencia de la referencia: el icono dentro, a la izquierda, y
 * sitio a la derecha para una acción —el ojo de la contraseña—.
 */
const CampoDeTexto = forwardRef<TextInput, TextInputProps & {
  readonly etiqueta: string;
  readonly error?: string | null;
  readonly icono?: ReactNode;
  readonly accion?: ReactNode;
}>(function CampoDeTexto({ etiqueta, error, icono, accion, ...resto }, ref) {
  const tema = useTema();
  const [enfocado, setEnfocado] = useState(false);
  const hayError = typeof error === 'string' && error !== '';

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: tema.color.textoPrimario }}>
        {etiqueta}
      </Text>

      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: tema.color.superficieElevada,
        borderWidth: 1.2,
        borderColor: hayError
          ? tema.color.peligro
          : enfocado ? tema.color.acento : '#E5E7EB'
      }}>
        {icono}

        <TextInput
          ref={ref}
          {...resto}
          // La etiqueta y el error viajan juntos: un borde rojo no le dice nada
          // a quien usa un lector de pantalla.
          accessibilityLabel={hayError ? `${etiqueta}. Error: ${error}` : etiqueta}
          accessibilityState={{ disabled: resto.editable === false }}
          placeholderTextColor="#9CA3AF"
          onFocus={evento => { setEnfocado(true); resto.onFocus?.(evento); }}
          onBlur={evento => { setEnfocado(false); resto.onBlur?.(evento); }}
          style={{
            flex: 1,
            paddingVertical: 14,
            fontSize: 16,
            color: tema.color.textoPrimario
          }}
        />

        {accion}
      </View>

      {hayError && (
        <Text
          style={{ fontSize: 12.5, color: tema.color.peligro, fontWeight: '500' }}
          accessibilityRole="text"
        >
          {error}
        </Text>
      )}
    </View>
  );
});
