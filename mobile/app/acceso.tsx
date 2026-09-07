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

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
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
import { HojaDeRegistro, SelectorDeCaminoAuth } from '../ui/Registro';
import { guardarUltimoRol } from '../services/session';
// AUTH-FINAL-3. La pantalla NO importa las bibliotecas de Google ni de Apple:
// entran por su única puerta, `social/proveedores.ts`, igual que la cámara
// entra por `media/captura.ts`. Aquí sólo hay decisiones ya traducidas.
import { consultarProveedores, entrarConProveedor } from '../services/social';
import { entrarCon, soportadoEnEstaPlataforma } from '../social/proveedores';
import {
  esFalloQueSeAvisa,
  interpretarResultadoDelProveedor,
  proveedoresOfrecibles,
  socialOcupado,
  type EstadoSocial,
  type ProveedorSocial
} from '../domain/entradaSocial';
import {
  MENSAJES_DE_REGISTRO,
  destinoTrasRegistrarse,
  registroCompleto,
  validarRegistro,
  type DatosDeRegistro,
  type ErroresDeRegistro
} from '../domain/registro';
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
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [erroresDeRegistro, setErroresDeRegistro] = useState<ErroresDeRegistro>({});
  const [avisoDeRegistro, setAvisoDeRegistro] = useState<string | null>(null);
  const [creandoCuenta, setCreandoCuenta] = useState(false);

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

  const { entrar, registrar, entrarConIdentidadSocial, sesion } = useSesion();

  // AUTH-FINAL-3: entrar con Google o con Apple.
  //
  // La lista de proveedores la manda el SERVIDOR y se cruza con lo que esta
  // plataforma soporta: Apple sólo existe en iOS, y Google necesita su client
  // ID de web. Mientras la consulta no vuelve, no se ofrece ninguno —así el
  // botón nunca aparece encendido un instante y luego apagado.
  const [proveedoresSociales, setProveedoresSociales] = useState<readonly ProveedorSocial[]>([]);
  const [estadoSocial, setEstadoSocial] = useState<EstadoSocial>('REPOSO');
  const [avisoSocial, setAvisoSocial] = useState<string | null>(null);
  // Un cerrojo que no depende del repintado: dos toques seguidos ocurren en el
  // mismo fotograma y `useState` todavía no ha cambiado.
  const abriendoProveedor = useRef(false);

  useEffect(() => {
    let vivo = true;
    void consultarProveedores().then(({ proveedores }) => {
      if (vivo) setProveedoresSociales(proveedoresOfrecibles(proveedores, soportadoEnEstaPlataforma));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const entrarConSocial = useCallback(
    async (proveedor: ProveedorSocial) => {
      if (abriendoProveedor.current) return;
      abriendoProveedor.current = true;
      setEstadoSocial('ABRIENDO_PROVEEDOR');
      setAvisoSocial(null);
      try {
        // 1. El selector del proveedor. Lo único que interesa es su token.
        const delProveedor = await entrarCon(proveedor);
        const corte = interpretarResultadoDelProveedor(delProveedor, proveedor);
        if (corte) {
          // Cancelar NO es un error: se vuelve en silencio, sin aviso rojo.
          setEstadoSocial(corte.estado);
          setAvisoSocial(esFalloQueSeAvisa(corte.estado) ? corte.mensaje ?? null : null);
          return;
        }

        // 2. El servidor verifica la firma del token. Es la única autoridad.
        setEstadoSocial('VERIFICANDO_CON_SERVIDOR');
        const token = delProveedor.estado === 'TOKEN' ? delProveedor.token : '';
        const resultado = await entrarConProveedor({
          proveedor,
          token,
          nombre: delProveedor.estado === 'TOKEN' ? delProveedor.nombre : undefined,
          apellido: delProveedor.estado === 'TOKEN' ? delProveedor.apellido : undefined
        });

        setEstadoSocial(resultado.estado);
        setAvisoSocial(esFalloQueSeAvisa(resultado.estado) ? resultado.mensaje ?? null : null);
        if (resultado.estado !== 'ENTRADO' || !resultado.usuario || !resultado.token) return;

        // 3. La sesión es de +58Express, y el destino lo decide el ROL que
        //    devolvió el servidor, no la intención con la que se pulsó.
        await entrarConIdentidadSocial({ usuario: resultado.usuario, token: resultado.token });
        void guardarUltimoRol(resultado.usuario.role === 'driver' ? 'driver' : 'passenger');
        router.replace(destinoTrasEntrar(resultado.usuario, intencion?.intencion ?? null));
      } finally {
        abriendoProveedor.current = false;
      }
    },
    [entrarConIdentidadSocial, intencion]
  );
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [aLaVista, setALaVista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campoContrasena = useRef<TextInput>(null);

  const enviando = sesion.estado === 'AUTENTICANDO';
  const puedeEnviar = identificador.trim() !== '' && contrasena !== '' && !enviando;

  /**
   * Crea la cuenta de verdad.
   *
   * LA INTENCIÓN NO VIAJA
   *
   * Quien llegó por la puerta de conductor crea una cuenta de PASAJERA, igual
   * que todo el mundo: el registro directo del servidor sólo permite eso, y el
   * rol de conductor lo concede la aprobación del expediente. Lo único que
   * cambia según la intención es a dónde se va después.
   */
  const crearLaCuenta = async (datos: DatosDeRegistro) => {
    // Un segundo toque mientras se está creando no manda otra petición. El
    // servidor además comprueba el duplicado dos veces, antes y después de
    // cifrar la contraseña, así que ni una carrera crearía dos cuentas.
    if (creandoCuenta) return;

    // Lo que se puede comprobar sin gastar la red se comprueba aquí; la
    // autoridad sigue siendo el servidor, y sus errores pisan a estos.
    const fallos = validarRegistro(datos);
    setErroresDeRegistro(fallos);
    setAvisoDeRegistro(null);
    if (!registroCompleto(fallos)) return;

    setCreandoCuenta(true);
    const resultado = await registrar(datos);
    setCreandoCuenta(false);

    if (!resultado.ok) {
      setErroresDeRegistro(resultado.campos ?? {});
      setAvisoDeRegistro(MENSAJES_DE_REGISTRO[resultado.motivo]);
      return;
    }

    // La preferencia se recuerda para la próxima vez, igual que al entrar. No
    // es un permiso: sólo decide por qué puerta se abre la aplicación.
    void guardarUltimoRol(intencion?.intencion ?? 'passenger');

    // A VERIFICAR EL CORREO, NO A LA APLICACIÓN.
    //
    // El registro devuelve sesión —hace falta para poder pedir el código— pero
    // la cuenta todavía no ha demostrado que ese correo sea suyo. El servidor
    // ya no deja pedir una carrera sin eso, así que entrar directo llevaría a
    // una aplicación que dice «no autorizado» sin explicar por qué.
    //
    // Se pasa `volverA` para que, al verificar, siga hacia donde iba: quien se
    // registró como conductora no debe acabar en la pantalla de la pasajera.
    router.replace({
      pathname: '/verificacion',
      params: {
        proposito: 'SIGNUP',
        correo: datos.correo,
        volverA: destinoTrasRegistrarse(intencion?.intencion ?? null)
      }
    } as never);
  };

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
      {modo === 'registro' ? (
        <HojaDeRegistro
          intencion={intencion?.intencion === 'driver' ? 'driver' : 'passenger'}
          onIrALogin={() => setModo('login')}
          onAbrirDocumentoLegal={tipo => {
            Alert.alert(
              tipo === 'terminos' ? 'Términos y Condiciones' : 'Política de Privacidad',
              'Los documentos legales oficiales están en revisión.'
            );
          }}
          errores={erroresDeRegistro}
          aviso={avisoDeRegistro}
          creando={creandoCuenta}
          onCrearCuenta={datos => { void crearLaCuenta(datos); }}
        />
      ) : (
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
            paddingTop: 28,
            paddingBottom: 28,
            gap: 20,
            shadowColor: '#000000',
            shadowOpacity: 0.08,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -4 },
            elevation: 6
          }}
        >
          {/* Selector de camino: Iniciar sesión / Crear cuenta */}
          <SelectorDeCaminoAuth
            modoActivo="login"
            onCambiarModo={setModo}
          />

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

            <ContrasenaOlvidada identificador={identificador} />
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

          {/* Enlace destacado directo para crear cuenta */}
          <View style={{ alignItems: 'center', marginTop: -4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={intencion?.intencion === 'driver' ? '¿No tienes cuenta? Crear cuenta y postularme' : '¿No tienes cuenta? Crear cuenta'}
              onPress={() => setModo('registro')}
              hitSlop={8}
              style={{ paddingVertical: 4 }}
              testID="enlace-crear-cuenta"
            >
              <Text style={{ fontSize: 14, color: tema.color.textoSecundario, fontWeight: '500' }}>
                ¿No tienes una cuenta?{' '}
                <Text style={{ color: tema.color.acentoTexto, fontWeight: '700' }}>
                  {intencion?.intencion === 'driver' ? 'Crear cuenta y postularme' : 'Crear cuenta'}
                </Text>
              </Text>
            </Pressable>
          </View>

          <EntradaSocial
            disponibles={proveedoresSociales}
            ocupado={socialOcupado(estadoSocial)}
            aviso={avisoSocial}
            onEntrar={entrarConSocial}
          />
        </View>
      )}
    </Pantalla>
  );
}

/**
 * «¿Olvidaste tu contraseña?».
 *
 * Lleva al flujo de verificación con `PASSWORD_RESET`: se manda un código al
 * contacto, y con el código se fija la contraseña nueva. El servidor la valida
 * ANTES de gastar el código —una contraseña corta no quema el código— y al
 * cambiarla marca `credentialsChangedAt`, con lo que toda sesión abierta antes
 * deja de valer. Que es exactamente lo que espera quien la cambia porque cree
 * que alguien más la sabe.
 *
 * SE LLEVA LO QUE YA ESTABA ESCRITO
 *
 * Si en el campo de arriba hay un correo, viaja con la navegación. Volver a
 * escribirlo sería pedirle dos veces lo mismo a alguien que ya está teniendo un
 * mal momento. Si lo que hay es un teléfono, o no hay nada, la pantalla de
 * verificación pregunta por dónde mandar el código.
 */
function ContrasenaOlvidada({ identificador }: { readonly identificador: string }) {
  const escrito = identificador.trim();
  // El correo se distingue del teléfono por la arroba, que es lo único que los
  // separa sin ambigüedad. Sin ella no se adivina: se deja que lo pregunte la
  // pantalla siguiente.
  const parametros = escrito.includes('@')
    ? { proposito: 'PASSWORD_RESET', correo: escrito }
    : { proposito: 'PASSWORD_RESET' };

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/verificacion', params: parametros } as never)}
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
/**
 * Los dos accesos de siempre, ahora conectados.
 *
 * AUTH-FINAL-3. `disponibles` lo dice el SERVIDOR —qué proveedores tiene
 * configurados— cruzado con lo que esta plataforma soporta. Mientras un
 * proveedor no esté en esa lista, su botón sigue deshabilitado y con el aviso
 * de siempre: un botón que no lleva a ninguna parte es peor que no tenerlo.
 *
 * El aviso de abajo sólo aparece cuando NINGUNO está disponible, igual que
 * antes; si uno lo está y el otro no, el que no lo está se queda apagado y con
 * su pista de accesibilidad, sin una línea que hable por los dos.
 */
function EntradaSocial({
  disponibles,
  ocupado,
  aviso,
  onEntrar
}: {
  readonly disponibles: readonly ProveedorSocial[];
  readonly ocupado: boolean;
  /**
   * Lo que salió mal, ya traducido. Cancelar no llega aquí: no es un fallo, y
   * enseñar un aviso rojo por algo que la persona hizo a propósito la haría
   * dudar de si rompió algo.
   */
  readonly aviso: string | null;
  readonly onEntrar: (proveedor: ProveedorSocial) => void;
}) {
  const hayGoogle = disponibles.includes('GOOGLE');
  const hayApple = disponibles.includes('APPLE');
  const alguno = hayGoogle || hayApple;

  return (
    <View style={{ gap: 16 }} testID="entrada-social">
      <Separador texto="o entra con" />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
        <BotonDeMarca
          nombre={ENTRADA_SOCIAL.google.titulo}
          disponible={hayGoogle && !ocupado}
          onPress={() => onEntrar('GOOGLE')}
          testID="entrada-google"
        >
          <LogoDeGoogle />
        </BotonDeMarca>

        <BotonDeMarca
          nombre={ENTRADA_SOCIAL.apple.titulo}
          disponible={hayApple && !ocupado}
          onPress={() => onEntrar('APPLE')}
          testID="entrada-apple"
        >
          <LogoDeApple />
        </BotonDeMarca>
      </View>

      {aviso ? (
        <View testID="aviso-social" accessibilityRole="alert" style={{ marginTop: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: '#DC2626', textAlign: 'center', fontWeight: '500' }}>
            {aviso}
          </Text>
        </View>
      ) : null}

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
