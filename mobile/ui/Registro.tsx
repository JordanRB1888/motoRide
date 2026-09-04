/**
 * Experiencia visual de REGISTRO / ALTA DE USUARIO en +58Express.
 *
 * QUÉ ES ESTO
 *
 * Pantalla hermana oficial de `acceso.tsx` (Login). Conserva la misma identidad
 * gráfica, el mismo hero curvado con la moto y el lema, el mismo lenguaje de
 * campos y la misma calidad tipográfica, pero diseñada para que una PERSONA NUEVA
 * cree su cuenta con una jerarquía impecable.
 *
 * DOS CAMINOS CLAROS TRAS ELEGIR ROL EN LA BIENVENIDA:
 *   · «Ya tengo cuenta» → Iniciar sesión (acceso.tsx)
 *   · «Soy nuevo» → Crear cuenta (Registro.tsx)
 *
 * CONTEXTO DE CONDUCTOR:
 *   Para quien seleccionó Conductor, se enfatiza con total claridad que primero
 *   crea su cuenta y en el paso siguiente completa su solicitud para trabajar con
 *   +58Express. NUNCA se promete el rol de forma automática.
 *   El CTA dice: «Crear cuenta y postularme».
 *
 * CONTEXTO DE PASAJERO:
 *   Para quien seleccionó Pasajero, el copy es limpio: «Crea tu cuenta»,
 *   sin conceptos de postulación ni verificación vehicular.
 *   El CTA dice: «Crear cuenta».
 *
 * SÓLO UI: sin llamadas a API, sin validación técnica dura, sin backend ni auth.
 */

import { forwardRef, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '../theme/ThemeContext';
import { espaciado } from '../theme/tokens';
import { Boton } from './componentes';
import { HeroDeMarca, LemaConFilos, PlacaDeMarca } from './HeroDeMarca';
import { LogoEncendido } from './Marca';
import { DiscoDeMarca, LogoDeApple, LogoDeGoogle } from './MarcasDeTerceros';
import {
  AdornoDeCampoAnimado,
  FlechaDerecha,
  IconoDeCandado,
  IconoDeCorreo,
  IconoDeOjoAnimado,
  IconoDeTelefono,
  IconoDeUsuario
} from './IconosDeCampo';
import { Icono } from './Icono';
import { useMovimientoReducido } from './movimiento';
import { AVISO_DE_NO_DISPONIBLE, ENTRADA_SOCIAL, LEMA } from '../domain/entrada';

export type IntencionDeRegistro = 'passenger' | 'driver';

export interface PropiedadesDeRegistro {
  readonly intencion?: IntencionDeRegistro;
  readonly onCrearCuenta?: (datos: {
    nombre: string;
    apellido: string;
    correo: string;
    telefono: string;
    contrasena: string;
  }) => void;
  readonly onIrALogin?: () => void;
  readonly onAbrirDocumentoLegal?: (tipo: 'terminos' | 'privacidad') => void;
  /**
   * Qué campo falla y por qué, con las claves del servidor.
   *
   * Los campos ya sabían pintarse en rojo; lo que faltaba era por dónde
   * entran los errores desde fuera. Sin esto, quien se registra con un correo
   * ya usado no vería nunca dónde está el problema.
   */
  readonly errores?: Readonly<Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'password', string>>>;
  /** Un aviso general, cuando el fallo no es de un campo concreto. */
  readonly aviso?: string | null;
  /** Mientras la cuenta se está creando: el botón espera y no se repite. */
  readonly creando?: boolean;
  readonly testID?: string;
}

// ---------------------------------------------------------------------------
// Selector de Camino Auth: Segmented Control [ Iniciar sesión | Crear cuenta ]
// ---------------------------------------------------------------------------

export function SelectorDeCaminoAuth({
  modoActivo,
  onCambiarModo,
  estilo
}: {
  readonly modoActivo: 'login' | 'registro';
  readonly onCambiarModo: (modo: 'login' | 'registro') => void;
  readonly estilo?: StyleProp<ViewStyle>;
}) {
  const tema = useTema();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: tema.color.superficieHundida,
          borderRadius: 24,
          padding: 4,
          borderWidth: 1,
          borderColor: tema.color.borde
        },
        estilo
      ]}
    >
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: modoActivo === 'login' }}
        accessibilityLabel="Ya tengo cuenta, iniciar sesión"
        onPress={() => onCambiarModo('login')}
        style={{
          flex: 1,
          paddingVertical: 10,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: modoActivo === 'login' ? tema.color.superficieElevada : 'transparent',
          shadowColor: '#000',
          shadowOpacity: modoActivo === 'login' ? 0.08 : 0,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: modoActivo === 'login' ? 2 : 0
        }}
      >
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: modoActivo === 'login' ? '700' : '500',
            color: modoActivo === 'login' ? tema.color.textoPrimario : tema.color.textoSecundario
          }}
        >
          Ya tengo cuenta
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: modoActivo === 'registro' }}
        accessibilityLabel="Soy nuevo, crear cuenta"
        onPress={() => onCambiarModo('registro')}
        style={{
          flex: 1,
          paddingVertical: 10,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: modoActivo === 'registro' ? tema.color.superficieElevada : 'transparent',
          shadowColor: '#000',
          shadowOpacity: modoActivo === 'registro' ? 0.08 : 0,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: modoActivo === 'registro' ? 2 : 0
        }}
      >
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: modoActivo === 'registro' ? '700' : '500',
            color: modoActivo === 'registro' ? tema.color.textoPrimario : tema.color.textoSecundario
          }}
        >
          Soy nuevo
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Campo de Texto Unificado (idéntico al de acceso.tsx para coherencia visual)
// ---------------------------------------------------------------------------

interface PropiedadesDeCampo extends TextInputProps {
  readonly etiqueta: string;
  readonly icono?: (enfocado: boolean) => ReactNode;
  readonly accion?: ReactNode;
  readonly error?: string | null;
  readonly testID?: string;
}

const CampoDeTextoRegistro = forwardRef<TextInput, PropiedadesDeCampo>(function CampoDeTexto(
  { etiqueta, icono, accion, error, testID, onFocus, onBlur, ...resto },
  ref
) {
  const tema = useTema();
  const [enfocado, setEnfocado] = useState(false);

  const conError = Boolean(error);
  const colorBorde = conError
    ? tema.color.peligro
    : enfocado
      ? tema.color.acento
      : tema.color.borde;

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 54,
          paddingHorizontal: 16,
          borderRadius: 16,
          backgroundColor: tema.color.superficie,
          borderWidth: 1.5,
          borderColor: colorBorde,
          gap: 12
        }}
      >
        {icono ? (
          <View style={{ width: 22, alignItems: 'center', justifyContent: 'center' }}>
            {icono(enfocado)}
          </View>
        ) : null}

        <TextInput
          ref={ref}
          placeholderTextColor={tema.color.textoTenue}
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: '500',
            color: tema.color.textoPrimario,
            paddingVertical: 12
          }}
          onFocus={e => {
            setEnfocado(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setEnfocado(false);
            onBlur?.(e);
          }}
          testID={testID}
          {...resto}
        />

        {accion ? <View style={{ alignItems: 'center', justifyContent: 'center' }}>{accion}</View> : null}
      </View>

      {conError ? (
        <Text style={{ fontSize: 12, color: tema.color.peligro, paddingHorizontal: 4, fontWeight: '500' }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

function BotonDeMarcaSocial({ nombre, disponible, children, testID }: {
  readonly nombre: string;
  readonly disponible: boolean;
  readonly children: React.ReactNode;
  readonly testID?: string;
}) {
  const tema = useTema();

  return (
    <Pressable
      disabled={!disponible}
      accessibilityRole="button"
      accessibilityLabel={`${nombre}${disponible ? '' : `. ${AVISO_DE_NO_DISPONIBLE}`}`}
      accessibilityState={{ disabled: !disponible }}
      style={({ pressed }) => [{
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: tema.color.superficie,
        borderWidth: 1.5,
        borderColor: tema.color.borde,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disponible ? (pressed ? 0.7 : 1) : 0.65
      }]}
      testID={testID}
    >
      <DiscoDeMarca apagado={!disponible}>{children}</DiscoDeMarca>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Banner Informativo de Postulación (Exclusivo para Conductor Nuevo)
// ---------------------------------------------------------------------------

export function BannerContextoConductor() {
  const tema = useTema();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: tema.color.superficieHundida,
        borderWidth: 1,
        borderColor: `${tema.color.acento}55`
      }}
      accessibilityRole="text"
      accessibilityLabel="Información de postulación: Crearás tu cuenta y luego completarás tu solicitud."
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: `${tema.color.acento}22`,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2
        }}
      >
        <Icono nombre="volante" color={tema.color.acentoTexto} tamano={16} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: tema.color.acentoTexto, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Paso 1 de 2 · Cuenta
          </Text>
        </View>
        <Text style={{ fontSize: 12.5, lineHeight: 17, color: tema.color.textoSecundario, fontWeight: '500' }}>
          Crearás tu cuenta y luego completarás tu solicitud con los documentos de tu vehículo para trabajar con +58Express.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hoja del Formulario de Registro (utilizable como hoja independiente o en C2)
// ---------------------------------------------------------------------------

export function HojaDeRegistro({
  intencion = 'passenger',
  onCrearCuenta,
  onIrALogin,
  onAbrirDocumentoLegal,
  errores,
  aviso = null,
  creando = false,
  testID = 'hoja-de-registro'
}: {
  readonly intencion?: IntencionDeRegistro;
  readonly onCrearCuenta?: (datos: {
    nombre: string;
    apellido: string;
    correo: string;
    telefono: string;
    contrasena: string;
  }) => void;
  readonly onIrALogin?: () => void;
  readonly onAbrirDocumentoLegal?: (tipo: 'terminos' | 'privacidad') => void;
  readonly errores?: Record<string, string>;
  readonly aviso?: string | null;
  readonly creando?: boolean;
  readonly testID?: string;
}) {
  const tema = useTema();
  const esConductor = intencion === 'driver';

  // Estados locales para los 6 campos visuales
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);
  const [verConfirmacion, setVerConfirmacion] = useState(false);

  // Referencias para encadenar el teclado entre campos
  const refApellido = useRef<TextInput>(null);
  const refCorreo = useRef<TextInput>(null);
  const refTelefono = useRef<TextInput>(null);
  const refContrasena = useRef<TextInput>(null);
  const refConfirmarContrasena = useRef<TextInput>(null);

  const puedeEnviar =
    nombre.trim() !== '' &&
    apellido.trim() !== '' &&
    correo.trim() !== '' &&
    telefono.trim() !== '' &&
    contrasena !== '' &&
    confirmarContrasena !== '';

  const handleSubmit = () => {
    onCrearCuenta?.({
      nombre,
      apellido,
      correo,
      telefono,
      contrasena
    });
  };

  return (
    <View
      testID={testID}
      style={{
        backgroundColor: tema.color.superficieElevada,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        marginTop: -16,
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 28,
        gap: 20,
        ...tema.superficie.sombra
      }}
    >
      {/* Selector de camino: Iniciar sesión / Crear cuenta */}
      <SelectorDeCaminoAuth
        modoActivo="registro"
        onCambiarModo={modo => {
          if (modo === 'login') onIrALogin?.();
        }}
      />

      {/* Cabecera del formulario */}
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
          Crea tu cuenta
        </Text>

        <Text style={{ fontSize: 14.5, color: tema.color.textoSecundario, lineHeight: 20 }}>
          {esConductor
            ? 'Completa tus datos para iniciar tu proceso en +58Express.'
            : 'Pide tu moto en segundos y muévete por la ciudad con total seguridad.'}
        </Text>
      </View>

      {/* Banner contextual de Conductor */}
      {esConductor ? <BannerContextoConductor /> : null}

      {/* Los 6 campos del formulario de registro */}
      <View style={{ gap: 14 }}>
        {/* Fila Nombre y Apellido */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <CampoDeTextoRegistro
              etiqueta="Nombre"
              placeholder="Nombre"
              icono={activo => (
                <AdornoDeCampoAnimado activo={activo} tipo="usuario">
                  <IconoDeUsuario color={activo ? tema.color.acentoTexto : tema.color.textoTenue} />
                </AdornoDeCampoAnimado>
              )}
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => refApellido.current?.focus()}
              testID="campo-nombre"
            />
          </View>

          <View style={{ flex: 1 }}>
            <CampoDeTextoRegistro
              ref={refApellido}
              etiqueta="Apellido"
              placeholder="Apellido"
              icono={activo => (
                <AdornoDeCampoAnimado activo={activo} tipo="usuario">
                  <IconoDeUsuario color={activo ? tema.color.acentoTexto : tema.color.textoTenue} />
                </AdornoDeCampoAnimado>
              )}
              value={apellido}
              onChangeText={setApellido}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => refCorreo.current?.focus()}
              error={errores?.lastName ?? null}
              testID="campo-apellido"
            />
          </View>
        </View>

        {/* Correo Electrónico */}
        <CampoDeTextoRegistro
          ref={refCorreo}
          etiqueta="Correo electrónico"
          placeholder="tu@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          icono={activo => (
            <AdornoDeCampoAnimado activo={activo} tipo="correo">
              <IconoDeCorreo color={activo ? tema.color.acentoTexto : tema.color.textoTenue} />
            </AdornoDeCampoAnimado>
          )}
          value={correo}
          onChangeText={setCorreo}
          returnKeyType="next"
          onSubmitEditing={() => refTelefono.current?.focus()}
          error={errores?.email ?? null}
          testID="campo-correo"
        />

        {/* Teléfono Móvil */}
        <CampoDeTextoRegistro
          ref={refTelefono}
          etiqueta="Teléfono móvil"
          placeholder="+58 414 0000000"
          keyboardType="phone-pad"
          icono={activo => (
            <AdornoDeCampoAnimado activo={activo} tipo="telefono">
              <IconoDeTelefono color={activo ? tema.color.acentoTexto : tema.color.textoTenue} />
            </AdornoDeCampoAnimado>
          )}
          value={telefono}
          onChangeText={setTelefono}
          returnKeyType="next"
          onSubmitEditing={() => refContrasena.current?.focus()}
          error={errores?.phone ?? null}
          testID="campo-telefono"
        />

        {/* Contraseña */}
        <CampoDeTextoRegistro
          ref={refContrasena}
          etiqueta="Contraseña"
          placeholder="Crea una contraseña"
          secureTextEntry={!verContrasena}
          autoCapitalize="none"
          autoCorrect={false}
          icono={activo => (
            <AdornoDeCampoAnimado activo={activo} tipo="candado">
              <IconoDeCandado color={activo ? tema.color.acentoTexto : tema.color.textoTenue} />
            </AdornoDeCampoAnimado>
          )}
          value={contrasena}
          onChangeText={setContrasena}
          returnKeyType="next"
          onSubmitEditing={() => refConfirmarContrasena.current?.focus()}
          error={errores?.password ?? null}
          accion={
            <Pressable
              onPress={() => setVerContrasena(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={verContrasena ? 'Ocultar contraseña' : 'Ver contraseña'}
              hitSlop={8}
              testID="ver-contrasena-registro"
            >
              <IconoDeOjoAnimado color={tema.color.textoTenue} abierto={verContrasena} />
            </Pressable>
          }
          testID="campo-contrasena-registro"
        />

        {/* Confirmar Contraseña */}
        <CampoDeTextoRegistro
          ref={refConfirmarContrasena}
          etiqueta="Confirmar contraseña"
          placeholder="Repite tu contraseña"
          secureTextEntry={!verConfirmacion}
          autoCapitalize="none"
          autoCorrect={false}
          icono={activo => (
            <AdornoDeCampoAnimado activo={activo} tipo="candado">
              <IconoDeCandado color={activo ? tema.color.acentoTexto : tema.color.textoTenue} />
            </AdornoDeCampoAnimado>
          )}
          value={confirmarContrasena}
          onChangeText={setConfirmarContrasena}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          accion={
            <Pressable
              onPress={() => setVerConfirmacion(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={verConfirmacion ? 'Ocultar confirmación' : 'Ver confirmación'}
              hitSlop={8}
              testID="ver-confirmacion-registro"
            >
              <IconoDeOjoAnimado color={tema.color.textoTenue} abierto={verConfirmacion} />
            </Pressable>
          }
          testID="campo-confirmar-contrasena"
        />
      </View>

      {/* Aviso general: lo que no es de un campo concreto */}
      {aviso ? (
        <Text
          accessibilityRole="alert"
          style={{ color: tema.color.peligro, fontSize: 13, lineHeight: 18, textAlign: 'center' }}
          testID="aviso-registro"
        >
          {aviso}
        </Text>
      ) : null}

      {/* Botón Principal de Creación de Cuenta */}
      <Boton
        titulo={esConductor ? 'Crear cuenta y postularme' : 'Crear cuenta'}
        onPress={handleSubmit}
        cargando={creando}
        deshabilitado={!puedeEnviar || creando}
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
        testID="boton-crear-cuenta"
      />

      {/* Alternativa limpia: Iniciar Sesión si ya existe cuenta */}
      <View style={{ alignItems: 'center', marginTop: -4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ya tengo una cuenta, iniciar sesión"
          onPress={onIrALogin}
          hitSlop={8}
          style={{ paddingVertical: 4 }}
          testID="enlace-a-login"
        >
          <Text style={{ fontSize: 14, color: tema.color.textoSecundario, fontWeight: '500' }}>
            ¿Ya tienes una cuenta?{' '}
            <Text style={{ color: tema.color.acentoTexto, fontWeight: '700' }}>
              Iniciar sesión
            </Text>
          </Text>
        </Pressable>
      </View>

      {/* Separador y redes sociales con etiqueta 'Disponible próximamente' */}
      <View style={{ gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: tema.color.borde }} />
          <Text style={{ fontSize: 13, color: tema.color.textoTenue, fontWeight: '500' }}>
            o regístrate con
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: tema.color.borde }} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
          <BotonDeMarcaSocial nombre={ENTRADA_SOCIAL.google.titulo} disponible={false} testID="registro-google">
            <LogoDeGoogle />
          </BotonDeMarcaSocial>

          <BotonDeMarcaSocial nombre={ENTRADA_SOCIAL.apple.titulo} disponible={false} testID="registro-apple">
            <LogoDeApple />
          </BotonDeMarcaSocial>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <IconoDeCandado tamano={13} color={tema.color.textoTenue} />
          <Text style={{ fontSize: 12, color: tema.color.textoTenue, fontWeight: '500' }}>
            {AVISO_DE_NO_DISPONIBLE}
          </Text>
        </View>
      </View>

      {/* Aviso Legal de Términos y Privacidad */}
      <View style={{ alignItems: 'center', marginTop: 8, paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 12, color: tema.color.textoTenue, textAlign: 'center', lineHeight: 17 }}>
          Al crear tu cuenta aceptas los{' '}
          <Text
            onPress={() => onAbrirDocumentoLegal?.('terminos')}
            style={{ color: tema.color.textoPrimario, fontWeight: '600', textDecorationLine: 'underline' }}
          >
            Términos y Condiciones
          </Text>{' '}
          y la{' '}
          <Text
            onPress={() => onAbrirDocumentoLegal?.('privacidad')}
            style={{ color: tema.color.textoPrimario, fontWeight: '600', textDecorationLine: 'underline' }}
          >
            Política de Privacidad
          </Text>{' '}
          de +58Express.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pantalla C2 de Registro
// ---------------------------------------------------------------------------

export function C2Registro({
  intencion = 'passenger',
  onCrearCuenta,
  onIrALogin,
  onAbrirDocumentoLegal,
  errores,
  aviso = null,
  creando = false,
  testID = 'pantalla-registro'
}: PropiedadesDeRegistro) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const quieto = useMovimientoReducido();

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
          {/* Hero oficial idéntico al del acceso y la bienvenida */}
          <HeroDeMarca variante="acceso" insetSuperior={insets.top} sangrado={espaciado.xl} quieto={quieto}>
            <PlacaDeMarca ancho={352}>
              <LogoEncendido ancho={284} llegada="frenazo" />
            </PlacaDeMarca>
            <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 4 }}>
              <LemaConFilos texto={LEMA} />
            </View>
          </HeroDeMarca>

          <HojaDeRegistro
            intencion={intencion}
            onCrearCuenta={onCrearCuenta}
            onIrALogin={onIrALogin}
            onAbrirDocumentoLegal={onAbrirDocumentoLegal}
            errores={errores}
            aviso={aviso}
            creando={creando}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
