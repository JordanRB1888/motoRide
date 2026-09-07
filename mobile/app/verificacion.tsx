/**
 * Verificar un contacto con un código. Pantalla REAL.
 *
 * LA SUPERFICIE ES DE ANTIGRAVITY
 *
 * `ui/VerificacionOTP.tsx` ya tenía dibujado todo: el selector de canal con
 * WhatsApp recomendado, las seis casillas con auto-avance, el contador, los
 * avisos y la pantalla de éxito. Aquí **no se rediseña nada**: se le pasan
 * datos y acciones. Lo único que cambia respecto a su previsualización es de
 * dónde salen los números —del servidor, no de un ejemplo.
 *
 * QUÉ DECIDE ESTA PANTALLA
 *
 * Nada sobre el código. Manda, espera y pinta lo que el dominio dice
 * (`domain/verificacionOtp.ts`). El estado de la pantalla es un valor de esa
 * lista y siempre hay algo que enseñar: no existe camino que deje la pantalla
 * en blanco.
 *
 * EL CONTADOR
 *
 * Arranca del número que dio el servidor y baja de segundo en segundo. Es una
 * ayuda visual: cuando llega a cero no invalida nada —lo invalida el servidor,
 * y lo dice al responder—. Un teléfono con la hora mal puesta no puede alargar
 * ni acortar un código.
 *
 * SIN CONEXIÓN
 *
 * Si la petición no sale, no se gastó ningún intento: el código sigue valiendo
 * y se puede reintentar. La pantalla lo dice con esas palabras.
 *
 * EL CÓDIGO NO SE GUARDA
 *
 * Vive en el estado de React mientras se escribe y se limpia al terminar o al
 * pedir otro. No se registra, no se persiste y no viaja a ningún sitio que no
 * sea el backend.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Campo } from '../ui/Campo';

import { Pantalla } from '../components/Pantalla';
import { Boton } from '../ui/componentes';
import { useTema } from '../theme/ThemeContext';
import {
  C2VerificacionOTP,
  SelectorCanalOTP,
  type CanalOTP,
  type DestinoCanalOTP
} from '../ui/VerificacionOTP';
import { consultarCanales, comprobarCodigo, pedirCodigo } from '../services/otp';
import { pedirPerfil } from '../services/perfil';
import { useSesion } from '../context/AuthContext';
import {
  aparienciaDeLaCasilla,
  canalPreferido,
  canalesOfrecibles,
  codigoCompleto,
  estaOcupado,
  limpiarCodigo,
  siguienteSegundo,
  type CanalDeVerificacion,
  type CanalDisponible,
  type DesafioEnviado,
  type EstadoDeVerificacion,
  type PropositoDeVerificacion
} from '../domain/verificacionOtp';

/** El vocabulario del servidor y el de la superficie, que no coinciden. */
const A_LA_SUPERFICIE: Record<CanalDeVerificacion, CanalOTP> = {
  WHATSAPP: 'whatsapp',
  SMS: 'sms',
  EMAIL: 'email'
};
const DEL_SELECTOR: Record<CanalOTP, CanalDeVerificacion> = {
  whatsapp: 'WHATSAPP',
  sms: 'SMS',
  email: 'EMAIL'
};

const DESCRIPCION_DEL_CANAL: Record<CanalDeVerificacion, { titulo: string; descripcion: string }> = {
  WHATSAPP: { titulo: 'WhatsApp', descripcion: 'Recibe el código al instante por chat' },
  SMS: { titulo: 'Mensaje de texto (SMS)', descripcion: 'Envío tradicional a tu línea telefónica' },
  EMAIL: { titulo: 'Correo electrónico', descripcion: 'Código a tu bandeja de entrada' }
};

export default function Verificacion() {
  const parametros = useLocalSearchParams<{
    telefono?: string;
    correo?: string;
    proposito?: string;
    volverA?: string;
  }>();

  // Los colores salen del tema, nunca de literales: la aplicación tiene modo
  // oscuro y un texto sin color se pinta negro sobre negro.
  const tema = useTema();
  const proposito = (parametros.proposito ?? 'SIGNUP') as PropositoDeVerificacion;
  const { sesion } = useSesion();

  /**
   * A DÓNDE SE MANDA EL CÓDIGO
   *
   * Normalmente lo trae quien navega hasta aquí: el registro acaba de escribir
   * el correo y lo pasa. Pero también se llega desde dentro de la aplicación
   * —«confirma tu correo para pedir viajes»—, y allí no hay ningún formulario
   * del que sacarlo: el dato lo tiene el servidor.
   *
   * Así que, con sesión y sin parámetro, se pregunta. Sin esto la pantalla
   * respondía «no tenemos un correo al que enviarte el código» a una cuenta
   * cuyo correo el servidor conoce perfectamente.
   */
  const [contacto, setContacto] = useState({
    telefono: typeof parametros.telefono === 'string' ? parametros.telefono : '',
    correo: typeof parametros.correo === 'string' ? parametros.correo : ''
  });
  const { telefono, correo } = contacto;
  const faltaContacto = telefono === '' || correo === '';
  const haySesion = sesion.estado === 'AUTENTICADO';

  useEffect(() => {
    if (!faltaContacto || !haySesion) return;
    let vigente = true;
    void pedirPerfil().then(respuesta => {
      if (!vigente || !respuesta.ok) return;
      // Lo que ya venía por parámetro manda: es lo que la persona acaba de
      // escribir, y puede ser más nuevo que lo que hay guardado.
      setContacto(actual => ({
        telefono: actual.telefono || respuesta.datos.phone,
        correo: actual.correo || respuesta.datos.email
      }));
    });
    return () => { vigente = false; };
  }, [faltaContacto, haySesion]);
  /** Los propósitos que exigen sesión: el servidor los rechaza sin ella. */
  const conSesion = ['CHANGE_PHONE', 'CHANGE_EMAIL', 'ACCOUNT_LINK', 'SENSITIVE_ACTION'].includes(proposito);

  // `null` es «todavía no he preguntado». Una lista vacía es «pregunté y no
  // hay ninguno», y `false` en `consultaOk` es «no pude preguntar». Los tres
  // son distintos y se ven distintos.
  const [canales, setCanales] = useState<CanalDisponible[] | null>(null);
  const [consultaOk, setConsultaOk] = useState(true);
  const [sinRed, setSinRed] = useState(false);
  const [canal, setCanal] = useState<CanalDeVerificacion | null>(null);
  const [estado, setEstado] = useState<EstadoDeVerificacion>('ELIGIENDO_CANAL');
  const [desafio, setDesafio] = useState<DesafioEnviado | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [intentosRestantes, setIntentosRestantes] = useState<number | undefined>(undefined);
  const [segundosParaReenviar, setSegundosParaReenviar] = useState(0);

  // RECUPERAR LA CONTRASENA ES EL UNICO PROPOSITO CON DOS PASOS.
  //
  // El servidor pide el codigo y la contrasena nueva en la MISMA peticion, y lo
  // hace a proposito: valida la contrasena ANTES de gastar el codigo, de forma
  // que escribir una demasiado corta no queme el codigo ni obligue a pedir
  // otro. Por eso aqui, al completar las seis cifras, no se verifica todavia:
  // se pasa a pedir la contrasena y se manda todo junto.
  const recuperandoContrasena = proposito === 'PASSWORD_RESET';
  const [pidiendoContrasena, setPidiendoContrasena] = useState(false);
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [contrasenaRepetida, setContrasenaRepetida] = useState('');
  const [errorDeContrasena, setErrorDeContrasena] = useState<string | null>(null);

  // Protege del doble toque incluso antes de que el estado se repinte: dos
  // pulsaciones seguidas ocurren en el mismo fotograma.
  const enviando = useRef(false);
  const verificando = useRef(false);

  const cargarCanales = useCallback(async () => {
    const { ok, sinRed, canales: lista } = await consultarCanales();
    setConsultaOk(ok);
    setSinRed(sinRed);
    setCanales(lista);
    setCanal(actual => actual ?? canalPreferido(lista));
  }, []);

  /** Volver a preguntar tras un fallo de red, sin salir de la pantalla. */
  const reintentarCanales = useCallback(() => {
    setCanales(null);
    setConsultaOk(true);
    setSinRed(false);
    void cargarCanales();
  }, [cargarCanales]);

  useEffect(() => {
    void cargarCanales();
  }, [cargarCanales]);

  // La cuenta atrás del reenvío. Sólo pinta; no decide nada.
  useEffect(() => {
    if (segundosParaReenviar <= 0) return undefined;
    const temporizador = setTimeout(() => setSegundosParaReenviar(siguienteSegundo(segundosParaReenviar)), 1000);
    return () => clearTimeout(temporizador);
  }, [segundosParaReenviar]);

  const destinoDe = useCallback(
    (elegido: CanalDeVerificacion) => (elegido === 'EMAIL' ? correo : telefono),
    [correo, telefono]
  );

  const enviar = useCallback(
    async (elegido: CanalDeVerificacion) => {
      if (enviando.current) return;
      const destino = destinoDe(elegido);
      if (!destino) {
        setEstado('ERROR_DEL_SERVIDOR');
        setAviso(
          elegido === 'EMAIL'
            ? 'No tenemos un correo al que enviarte el código.'
            : 'No tenemos un teléfono al que enviarte el código.'
        );
        return;
      }

      enviando.current = true;
      setEstado('ENVIANDO');
      setAviso(null);
      try {
        const resultado = await pedirCodigo({ canal: elegido, destino, proposito, conSesion });
        setEstado(resultado.estado);
        setAviso(resultado.mensaje ?? null);
        if (resultado.desafio) {
          setDesafio(resultado.desafio);
          setCodigo('');
          setIntentosRestantes(resultado.desafio.attemptsLeft);
          setSegundosParaReenviar(resultado.desafio.resendAvailableInSeconds);
        } else if (resultado.esperaSegundos !== undefined) {
          setSegundosParaReenviar(resultado.esperaSegundos);
        }
      } finally {
        enviando.current = false;
      }
    },
    [conSesion, destinoDe, proposito]
  );

  const verificar = useCallback(
    async (escrito: string, contrasena?: string) => {
      if (verificando.current || !desafio || !codigoCompleto(escrito)) return;
      verificando.current = true;
      setEstado('VERIFICANDO');
      setAviso(null);
      try {
        const resultado = await comprobarCodigo({
          challengeId: desafio.challengeId,
          codigo: escrito,
          proposito,
          contrasenaNueva: contrasena,
          conSesion
        });
        setEstado(resultado.estado);
        setAviso(resultado.mensaje ?? null);
        if (resultado.intentosRestantes !== undefined) setIntentosRestantes(resultado.intentosRestantes);
        // Un código quemado se borra de la pantalla; uno que sigue vivo
        // --sin conexión-- se conserva para poder reintentarlo tal cual.
        if (resultado.necesitaOtroCodigo) {
          setCodigo('');
          // Un codigo quemado deja la contrasena sin sitio donde aplicarse: se
          // vuelve a la casilla, y no se conserva lo escrito.
          setPidiendoContrasena(false);
          setContrasenaNueva('');
          setContrasenaRepetida('');
        }
      } finally {
        verificando.current = false;
      }
    },
    [conSesion, desafio, proposito]
  );

  const alEscribir = useCallback(
    (texto: string) => {
      const limpio = limpiarCodigo(texto);
      setCodigo(limpio);
      // Al completar las seis cifras se comprueba solo: es lo que la gente
      // espera y evita un botón de más. Salvo al recuperar la contraseña, donde
      // todavía falta la mitad de lo que hay que mandar.
      if (!codigoCompleto(limpio)) return;
      if (recuperandoContrasena) setPidiendoContrasena(true);
      else void verificar(limpio);
    },
    [recuperandoContrasena, verificar]
  );

  /** Manda el código y la contraseña juntos, que es como los quiere el servidor. */
  const confirmarContrasena = useCallback(() => {
    // Las mismas dos reglas que el servidor, comprobadas aquí para no gastar
    // una ida y vuelta --ni un código-- en algo que ya se sabe que va a fallar.
    if (contrasenaNueva.length < 8) {
      setErrorDeContrasena('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (contrasenaNueva !== contrasenaRepetida) {
      setErrorDeContrasena('Las dos contraseñas no coinciden.');
      return;
    }
    setErrorDeContrasena(null);
    void verificar(codigo, contrasenaNueva);
  }, [codigo, contrasenaNueva, contrasenaRepetida, verificar]);

  const continuar = useCallback(() => {
    const destino = typeof parametros.volverA === 'string' ? parametros.volverA : null;
    if (destino) router.replace(destino as never);
    else router.back();
  }, [parametros.volverA]);

  const ofrecibles = canalesOfrecibles(canales ?? []);

  // Sólo se pintan los canales que el servidor sabe enviar Y para los que
  // tenemos contacto: un botón que no lleva a ninguna parte es peor que no
  // tenerlo.
  const canalesParaLaSuperficie: DestinoCanalOTP[] = ofrecibles
    .filter(disponible => destinoDe(disponible) !== '')
    .map(disponible => ({
      tipo: A_LA_SUPERFICIE[disponible],
      titulo: DESCRIPCION_DEL_CANAL[disponible].titulo,
      descripcion: DESCRIPCION_DEL_CANAL[disponible].descripcion,
      destinoEnmascarado: enmascararParaMostrar(disponible, destinoDe(disponible)),
      recomendado: disponible === 'WHATSAPP'
    }));

  // Sin ningún canal que ofrecer no se pinta un selector vacío con un botón
  // que no hace nada. Y hay tres razones distintas para no tener canales:
  // todavía estoy preguntando, pregunté y no hay ninguno, o no pude preguntar.
  // Las tres se ven distintas, y ninguna se queda esperando para siempre.
  if (!desafio && canalesParaLaSuperficie.length === 0) {
    const consultando = canales === null;
    const titulo = consultando
      ? 'Un momento…'
      : consultaOk
        ? 'No podemos enviarte el código'
        : sinRed
          ? 'Sin conexión'
          : 'El servidor no responde';
    const explicacion = consultando
      ? 'Estamos viendo por dónde podemos enviarte el código.'
      : consultaOk
        ? 'Ahora mismo no hay ningún medio disponible para verificar tu contacto. Inténtalo más tarde.'
        : sinRed
          ? 'Revisa tus datos o el wifi e inténtalo de nuevo.'
          : 'No pudimos preguntar por dónde enviarte el código. Inténtalo de nuevo en un momento.';
    return (
      <Pantalla>
        <View
          style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}
          testID="pantalla-sin-canales"
          accessibilityRole="alert"
        >
          <Text
            style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', color: tema.color.textoPrimario }}
          >
            {titulo}
          </Text>
          <Text
            style={{ fontSize: 15, lineHeight: 21, textAlign: 'center', color: tema.color.textoSecundario }}
          >
            {explicacion}
          </Text>
          {!consultando ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              {!consultaOk ? (
                <Boton titulo="Reintentar" onPress={reintentarCanales} testID="reintentar-canales" />
              ) : null}
              <Boton titulo="Volver" onPress={() => router.back()} testID="volver-sin-canales" />
            </View>
          ) : null}
        </View>
      </Pantalla>
    );
  }

  if (!desafio) {
    return (
      <Pantalla>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }} testID="pantalla-eleccion-canal">
          <SelectorCanalOTP
            canales={canalesParaLaSuperficie}
            canalSeleccionado={A_LA_SUPERFICIE[canal ?? 'WHATSAPP']}
            onSeleccionarCanal={elegido => setCanal(DEL_SELECTOR[elegido])}
            onContinuar={() => canal && void enviar(canal)}
            cargando={estaOcupado(estado)}
          />
          {aviso ? (
            <View testID="aviso-envio" accessibilityRole="alert" style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', color: tema.color.textoSecundario }}>{aviso}</Text>
            </View>
          ) : null}
        </View>
      </Pantalla>
    );
  }

  // EL SEGUNDO PASO DE RECUPERAR LA CONTRASENA.
  //
  // Se llega aqui con el codigo ya escrito y sin gastar. Si se sale --el boton
  // de volver-- se conserva el codigo: sigue siendo valido y pedir otro solo
  // por retroceder seria maltratar a quien ya esta teniendo un mal dia.
  if (pidiendoContrasena) {
    const enviando = estado === 'VERIFICANDO';
    return (
      <Pantalla>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }} testID="pantalla-contrasena-nueva">
          <Text style={{ fontSize: 22, fontWeight: '800', color: tema.color.textoPrimario }}>
            Tu nueva contraseña
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: tema.color.textoSecundario }}>
            El código es correcto. Elige la contraseña con la que entrarás a partir de ahora.
          </Text>

          <Campo
            etiqueta="Nueva contraseña"
            value={contrasenaNueva}
            onChangeText={texto => { setContrasenaNueva(texto); setErrorDeContrasena(null); }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!enviando}
            ayuda="Al menos 8 caracteres."
            testID="campo-contrasena-nueva"
          />
          <Campo
            etiqueta="Repite la contraseña"
            value={contrasenaRepetida}
            onChangeText={texto => { setContrasenaRepetida(texto); setErrorDeContrasena(null); }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!enviando}
            error={errorDeContrasena}
            onSubmitEditing={confirmarContrasena}
            testID="campo-contrasena-repetida"
          />

          {/* Lo que no es un fallo de la contrasena --sin conexion, el codigo
              que vencio mientras se escribia-- se dice aparte, porque no se
              arregla cambiando lo escrito. */}
          {aviso && !errorDeContrasena ? (
            <Text
              accessibilityRole="alert"
              testID="aviso-contrasena"
              style={{ fontSize: 14, lineHeight: 20, color: tema.color.textoSecundario }}
            >
              {aviso}
            </Text>
          ) : null}

          <View style={{ gap: 10, marginTop: 8 }}>
            <Boton
              titulo="Cambiar mi contraseña"
              onPress={confirmarContrasena}
              cargando={enviando}
              testID="confirmar-contrasena-nueva"
            />
            <Boton
              titulo="Volver"
              variante="secundario"
              onPress={() => { setPidiendoContrasena(false); setErrorDeContrasena(null); }}
              testID="volver-al-codigo"
            />
          </View>
        </View>
      </Pantalla>
    );
  }

  return (
    <C2VerificacionOTP
      canal={A_LA_SUPERFICIE[desafio.channel]}
      codigo={codigo}
      onChangeCodigo={alEscribir}
      estado={aparienciaDeLaCasilla(estado)}
      segundosRestantes={segundosParaReenviar}
      // El mensaje y los intentos salen del servidor. Nunca un número fijo:
      // saber si queda uno o quedan cuatro cambia lo que la persona hace.
      mensajeError={aviso ?? 'El código no es correcto.'}
      intentosRestantes={intentosRestantes}
      // Lo que no es un fallo del código —sin conexión, límite, canal caído—
      // tiene su propio aviso, con su propia frase.
      avisoGeneral={aparienciaDeLaCasilla(estado) === 'normal' ? aviso : null}
      verificando={estado === 'VERIFICANDO'}
      onVerificar={() => {
        if (recuperandoContrasena) setPidiendoContrasena(true);
        else void verificar(codigo);
      }}
      onReenviar={() => canal && void enviar(canal)}
      onCambiarCanal={() => {
        // Volver al selector. El desafío anterior lo invalida el servidor en
        // cuanto se pida por otro canal; aquí sólo se cambia de pantalla.
        setDesafio(null);
        setCodigo('');
        setAviso(null);
        setEstado('ELIGIENDO_CANAL');
      }}
      onContinuarExito={continuar}
    />
  );
}

/**
 * Lo que se enseña del destino mientras no hay respuesta del servidor. En
 * cuanto la hay, se usa `maskedDestination`, que lo enmascara el servidor.
 */
function enmascararParaMostrar(canal: CanalDeVerificacion, destino: string): string {
  if (canal === 'EMAIL') {
    const arroba = destino.lastIndexOf('@');
    if (arroba <= 0) return '•••';
    const nombre = destino.slice(0, arroba);
    return `${nombre[0]}•••${nombre.length > 2 ? nombre[nombre.length - 1] : ''}${destino.slice(arroba)}`;
  }
  const cifras = destino.replace(/\D/g, '');
  return cifras.length < 4 ? '•••' : `••• ••${cifras.slice(-2)}`;
}

