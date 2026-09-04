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

import { Pantalla } from '../components/Pantalla';
import {
  C2VerificacionOTP,
  SelectorCanalOTP,
  type CanalOTP,
  type DestinoCanalOTP
} from '../ui/VerificacionOTP';
import { consultarCanales, comprobarCodigo, pedirCodigo } from '../services/otp';
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

  const proposito = (parametros.proposito ?? 'SIGNUP') as PropositoDeVerificacion;
  const telefono = typeof parametros.telefono === 'string' ? parametros.telefono : '';
  const correo = typeof parametros.correo === 'string' ? parametros.correo : '';
  /** Los propósitos que exigen sesión: el servidor los rechaza sin ella. */
  const conSesion = ['CHANGE_PHONE', 'CHANGE_EMAIL', 'ACCOUNT_LINK', 'SENSITIVE_ACTION'].includes(proposito);

  const [canales, setCanales] = useState<CanalDisponible[]>([]);
  const [canal, setCanal] = useState<CanalDeVerificacion | null>(null);
  const [estado, setEstado] = useState<EstadoDeVerificacion>('ELIGIENDO_CANAL');
  const [desafio, setDesafio] = useState<DesafioEnviado | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [intentosRestantes, setIntentosRestantes] = useState<number | undefined>(undefined);
  const [segundosParaReenviar, setSegundosParaReenviar] = useState(0);

  // Protege del doble toque incluso antes de que el estado se repinte: dos
  // pulsaciones seguidas ocurren en el mismo fotograma.
  const enviando = useRef(false);
  const verificando = useRef(false);

  useEffect(() => {
    let vivo = true;
    consultarCanales().then(lista => {
      if (!vivo) return;
      setCanales(lista);
      setCanal(actual => actual ?? canalPreferido(lista));
    });
    return () => {
      vivo = false;
    };
  }, []);

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
    async (escrito: string) => {
      if (verificando.current || !desafio || !codigoCompleto(escrito)) return;
      verificando.current = true;
      setEstado('VERIFICANDO');
      setAviso(null);
      try {
        const resultado = await comprobarCodigo({
          challengeId: desafio.challengeId,
          codigo: escrito,
          proposito,
          conSesion
        });
        setEstado(resultado.estado);
        setAviso(resultado.mensaje ?? null);
        if (resultado.intentosRestantes !== undefined) setIntentosRestantes(resultado.intentosRestantes);
        // Un código quemado se borra de la pantalla; uno que sigue vivo
        // --sin conexión-- se conserva para poder reintentarlo tal cual.
        if (resultado.necesitaOtroCodigo) setCodigo('');
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
      // espera y evita un botón de más.
      if (codigoCompleto(limpio)) void verificar(limpio);
    },
    [verificar]
  );

  const continuar = useCallback(() => {
    const destino = typeof parametros.volverA === 'string' ? parametros.volverA : null;
    if (destino) router.replace(destino as never);
    else router.back();
  }, [parametros.volverA]);

  const ofrecibles = canalesOfrecibles(canales);

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
              <Text style={{ fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{aviso}</Text>
            </View>
          ) : null}
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
      onVerificar={() => void verificar(codigo)}
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

