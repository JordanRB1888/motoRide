/**
 * Las decisiones de la pantalla de verificación por código.
 *
 * PURO A PROPÓSITO
 *
 * Aquí no hay React, ni `fetch`, ni nada nativo: sólo qué significa cada
 * respuesta del servidor y en qué estado deja la pantalla. Por eso se puede
 * probar entero sin emulador, que es donde estos caminos —expirado, sin
 * conexión, limitado— son casi imposibles de reproducir a mano.
 *
 * EL SERVIDOR ES LA AUTORIDAD
 *
 * El cliente **nunca** decide que un código es válido. Manda `challengeId` y
 * `code`, y espera. Tampoco decide cuándo vence: el contador que se ve es una
 * aproximación visual que arranca del número que dio el servidor, y cuando
 * llega a cero no invalida nada —lo invalida el servidor, y lo dice al
 * responder—. Un reloj de teléfono mal puesto no puede alargar ni acortar un
 * código.
 *
 * SIN CONEXIÓN NO SE GASTA UN INTENTO
 *
 * Si la petición no sale del teléfono, el desafío no se toca: no hubo intento
 * que gastar. Por eso `SIN_CONEXION` es un estado propio y no un error de
 * código, y por eso se puede reintentar sin penalización.
 */

/** Los canales, en el vocabulario del servidor. */
export const CANALES = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
export type CanalDeVerificacion = (typeof CANALES)[number];

/** Los propósitos que la aplicación usa hoy. */
export type PropositoDeVerificacion =
  | 'SIGNUP'
  | 'LOGIN'
  | 'PASSWORD_RESET'
  | 'CHANGE_PHONE'
  | 'CHANGE_EMAIL'
  | 'ACCOUNT_LINK'
  | 'SENSITIVE_ACTION';

/**
 * Todos los estados de la superficie. No hay ninguno más: si aparece una
 * respuesta que no encaja, cae en `ERROR_DEL_SERVIDOR`, que sí tiene pantalla.
 * Nunca queda en blanco.
 */
export const ESTADOS = [
  'ELIGIENDO_CANAL',
  'ENVIANDO',
  'CODIGO_ENVIADO',
  'VERIFICANDO',
  'VERIFICADO',
  'CODIGO_INCORRECTO',
  'CODIGO_EXPIRADO',
  'CODIGO_AGOTADO',
  'LIMITE_ALCANZADO',
  'SIN_CONEXION',
  'CANAL_NO_DISPONIBLE',
  'ERROR_DEL_SERVIDOR'
] as const;
export type EstadoDeVerificacion = (typeof ESTADOS)[number];

/** Los estados en los que hay una operación en curso: el botón se protege. */
export const ESTADOS_OCUPADOS: readonly EstadoDeVerificacion[] = ['ENVIANDO', 'VERIFICANDO'];

export function estaOcupado(estado: EstadoDeVerificacion): boolean {
  return ESTADOS_OCUPADOS.includes(estado);
}

/**
 * El estado con el que la superficie de Antigravity pinta la casilla del
 * código. Su prop admite cuatro valores; el resto de estados no cambian la
 * casilla, sólo el aviso de al lado.
 */
export function aparienciaDeLaCasilla(
  estado: EstadoDeVerificacion
): 'normal' | 'error' | 'expirado' | 'exito' {
  if (estado === 'VERIFICADO') return 'exito';
  if (estado === 'CODIGO_EXPIRADO' || estado === 'CODIGO_AGOTADO') return 'expirado';
  if (estado === 'CODIGO_INCORRECTO') return 'error';
  return 'normal';
}

/** Un canal tal y como lo cuenta el servidor. */
export interface CanalDisponible {
  readonly channel: CanalDeVerificacion;
  readonly contactType: 'PHONE' | 'EMAIL';
  readonly available: boolean;
}

/**
 * Sólo los canales que el servidor sabe enviar. Un canal sin proveedor no se
 * ofrece: un botón que no lleva a ninguna parte es peor que no tener el botón.
 */
export function canalesOfrecibles(canales: readonly CanalDisponible[]): CanalDeVerificacion[] {
  return canales.filter(canal => canal.available).map(canal => canal.channel);
}

/**
 * El canal preferido de entre los que hay. WhatsApp primero —es lo que la
 * gente usa aquí—, luego SMS, y el correo al final.
 */
export const ORDEN_DE_PREFERENCIA: readonly CanalDeVerificacion[] = ['WHATSAPP', 'SMS', 'EMAIL'];

export function canalPreferido(
  canales: readonly CanalDisponible[]
): CanalDeVerificacion | null {
  const ofrecibles = canalesOfrecibles(canales);
  return ORDEN_DE_PREFERENCIA.find(canal => ofrecibles.includes(canal)) ?? null;
}

/** Qué contacto necesita cada canal: teléfono o correo. */
export function contactoDelCanal(canal: CanalDeVerificacion): 'PHONE' | 'EMAIL' {
  return canal === 'EMAIL' ? 'EMAIL' : 'PHONE';
}

/** La respuesta de un envío correcto. */
export interface DesafioEnviado {
  readonly challengeId: string;
  readonly channel: CanalDeVerificacion;
  readonly purpose: PropositoDeVerificacion;
  readonly expiresInSeconds: number;
  readonly resendAvailableInSeconds: number;
  readonly attemptsLeft: number;
  readonly maskedDestination?: string;
  readonly deliveryConfirmed?: boolean;
  readonly warning?: string;
}

export interface FalloDeApiParaOtp {
  readonly ok: false;
  readonly motivo: string;
  readonly codigo: string | null;
  readonly mensaje?: string;
  readonly detalle?: unknown;
  readonly estadoHttp?: number | null;
}

export interface ResultadoDeEnvio {
  readonly estado: EstadoDeVerificacion;
  readonly desafio?: DesafioEnviado;
  readonly mensaje?: string;
  readonly esperaSegundos?: number;
  readonly canal?: CanalDeVerificacion;
  /** El proveedor no confirmó la entrega: puede reenviar sin esperar. */
  readonly entregaSinConfirmar?: boolean;
}

/** Los motivos de fallo que significan «la petición no salió del teléfono». */
function esFalloDeRed(motivo: string): boolean {
  return motivo === 'SIN_RED' || motivo === 'TIEMPO_AGOTADO' || motivo === 'SIN_CONFIGURACION';
}

/**
 * Qué hacer con la respuesta a un envío.
 *
 * Cada error del servidor tiene su estado y su frase. «Algo salió mal» no
 * aparece en ninguna rama: quien no puede recibir un código necesita saber si
 * es su conexión, si tiene que esperar, o si ese canal no está disponible y
 * debe probar otro.
 */
export function interpretarEnvio(
  respuesta: { ok: true; datos: DesafioEnviado } | FalloDeApiParaOtp
): ResultadoDeEnvio {
  if (respuesta.ok) {
    const datos = respuesta.datos;
    return {
      estado: 'CODIGO_ENVIADO',
      desafio: datos,
      canal: datos.channel,
      entregaSinConfirmar: datos.deliveryConfirmed === false,
      mensaje:
        datos.deliveryConfirmed === false
          ? 'No pudimos confirmar el envío. Si no te llega, pide otro código o prueba con otro medio.'
          : undefined
    };
  }

  if (esFalloDeRed(respuesta.motivo)) {
    return {
      estado: 'SIN_CONEXION',
      mensaje: 'No hay conexión. Revisa tus datos o el wifi y vuelve a intentarlo.'
    };
  }

  const espera = esperaDelFallo(respuesta);

  switch (respuesta.codigo) {
    case 'RESEND_COOLDOWN':
      return {
        estado: 'LIMITE_ALCANZADO',
        esperaSegundos: espera,
        mensaje: 'Espera unos segundos antes de pedir otro código.'
      };
    case 'RATE_LIMITED':
      return {
        estado: 'LIMITE_ALCANZADO',
        esperaSegundos: espera,
        mensaje: 'Has pedido demasiados códigos. Inténtalo de nuevo en un rato.'
      };
    case 'SEND_IN_PROGRESS':
      // El segundo toque del mismo botón. No es un error que mostrar: se
      // mantiene el estado de envío y se espera a la primera respuesta.
      return { estado: 'ENVIANDO' };
    case 'VERIFICATION_PROVIDER_NOT_CONFIGURED':
      return {
        estado: 'CANAL_NO_DISPONIBLE',
        canal: canalDelFallo(respuesta),
        mensaje: 'Ese medio no está disponible ahora mismo. Prueba con otro.'
      };
    case 'VERIFICATION_SEND_FAILED':
      return {
        estado: 'CANAL_NO_DISPONIBLE',
        canal: canalDelFallo(respuesta),
        mensaje: 'No pudimos enviar el código por ese medio. Prueba con otro.'
      };
    case 'INVALID_DESTINATION':
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        mensaje: 'Ese número o correo no parece válido. Revísalo e inténtalo otra vez.'
      };
    default:
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        mensaje: 'No pudimos enviar el código. Inténtalo de nuevo en un momento.'
      };
  }
}

export interface ResultadoDeVerificacion {
  readonly estado: EstadoDeVerificacion;
  readonly mensaje?: string;
  readonly intentosRestantes?: number;
  readonly datos?: unknown;
  /** El código ya no sirve: hay que pedir otro. */
  readonly necesitaOtroCodigo?: boolean;
}

/**
 * Qué hacer con la respuesta a una verificación.
 *
 * `INVALID_CODE` con intentos restantes se cuenta, porque saber cuántos
 * quedan cambia lo que la persona hace: mirar mejor el mensaje o pedir otro.
 */
export function interpretarVerificacion(
  respuesta: { ok: true; datos: unknown } | FalloDeApiParaOtp
): ResultadoDeVerificacion {
  if (respuesta.ok) return { estado: 'VERIFICADO', datos: respuesta.datos };

  if (esFalloDeRed(respuesta.motivo)) {
    return {
      estado: 'SIN_CONEXION',
      // La petición no llegó al servidor: el desafío no se tocó y no se gastó
      // ningún intento. Se puede reintentar el mismo código.
      mensaje: 'No hay conexión. El código sigue siendo válido; inténtalo cuando vuelva.'
    };
  }

  switch (respuesta.codigo) {
    case 'INVALID_CODE': {
      const restantes = intentosRestantesDel(respuesta);
      return {
        estado: 'CODIGO_INCORRECTO',
        intentosRestantes: restantes,
        mensaje:
          restantes === undefined
            ? 'El código no es correcto.'
            : restantes === 1
              ? 'El código no es correcto. Te queda un intento.'
              : `El código no es correcto. Te quedan ${restantes} intentos.`
      };
    }
    case 'CODE_EXPIRED':
      return {
        estado: 'CODIGO_EXPIRADO',
        necesitaOtroCodigo: true,
        mensaje: 'El código venció. Pide uno nuevo.'
      };
    case 'CODE_EXHAUSTED':
      return {
        estado: 'CODIGO_AGOTADO',
        necesitaOtroCodigo: true,
        mensaje: 'Demasiados intentos fallidos. Pide un código nuevo.'
      };
    case 'RATE_LIMITED':
      return {
        estado: 'LIMITE_ALCANZADO',
        mensaje: 'Demasiados intentos. Inténtalo de nuevo en un rato.'
      };
    case 'CONTACT_TAKEN':
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        mensaje: 'Ese contacto ya está verificado en otra cuenta.'
      };
    case 'ACCOUNT_NOT_FOUND':
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        mensaje: 'No encontramos una cuenta con ese contacto.'
      };
    case 'ACCOUNT_DISABLED':
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        mensaje: 'Esta cuenta está desactivada. Escríbenos si crees que es un error.'
      };
    default:
      return {
        estado: 'ERROR_DEL_SERVIDOR',
        mensaje: 'No pudimos comprobar el código. Inténtalo de nuevo.'
      };
  }
}

/** Un código completo es seis cifras. Antes de eso no se manda nada. */
export const LONGITUD_DEL_CODIGO = 6;

export function codigoCompleto(codigo: string): boolean {
  return new RegExp(`^\\d{${LONGITUD_DEL_CODIGO}}$`).test(codigo);
}

/** Sólo cifras, y como mucho seis. Lo que se teclea se limpia al entrar. */
export function limpiarCodigo(texto: string): string {
  return String(texto ?? '').replace(/\D/g, '').slice(0, LONGITUD_DEL_CODIGO);
}

// ---------------------------------------------------------------------------
// Lectura del detalle del fallo
// ---------------------------------------------------------------------------

function detalleComoObjeto(fallo: FalloDeApiParaOtp): Record<string, unknown> | null {
  return fallo.detalle !== null && typeof fallo.detalle === 'object'
    ? (fallo.detalle as Record<string, unknown>)
    : null;
}

/** Los segundos de espera que el servidor indicó, si los indicó. */
export function esperaDelFallo(fallo: FalloDeApiParaOtp): number | undefined {
  const detalle = detalleComoObjeto(fallo);
  const ms = detalle?.retryAfterMs;
  return typeof ms === 'number' && Number.isFinite(ms) ? Math.ceil(ms / 1000) : undefined;
}

function intentosRestantesDel(fallo: FalloDeApiParaOtp): number | undefined {
  const detalle = detalleComoObjeto(fallo);
  const restantes = detalle?.attemptsLeft;
  return typeof restantes === 'number' && Number.isFinite(restantes) ? restantes : undefined;
}

function canalDelFallo(fallo: FalloDeApiParaOtp): CanalDeVerificacion | undefined {
  const detalle = detalleComoObjeto(fallo);
  const canal = detalle?.channel;
  return typeof canal === 'string' && (CANALES as readonly string[]).includes(canal)
    ? (canal as CanalDeVerificacion)
    : undefined;
}

/**
 * El siguiente segundo de la cuenta atrás. Nunca baja de cero y **nunca**
 * decide que algo venció: cuando llega a cero, la pantalla ofrece pedir otro
 * código, y quien dice si el anterior servía es el servidor.
 */
export function siguienteSegundo(segundos: number): number {
  return segundos > 0 ? segundos - 1 : 0;
}
