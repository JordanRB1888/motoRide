/**
 * El desafio de verificacion: un codigo de seis cifras que demuestra que
 * quien lo escribe tiene en la mano el telefono o el correo al que se envio.
 *
 * UN SOLO MODELO PARA TODOS LOS CANALES Y PROPOSITOS
 *
 * WhatsApp, SMS y correo entregan el mismo tipo de codigo; lo que cambia es el
 * transporte. Y registrarse, entrar, recuperar la contrasena o cambiar de
 * telefono piden la misma prueba; lo que cambia es que se hace con ella
 * despues. Por eso hay un unico `authChallenge` con `channel` y `purpose`, y
 * no una tabla por cada combinacion.
 *
 * LO QUE SE GUARDA NUNCA ES EL CODIGO
 *
 * El codigo vive en el telefono de la persona y en ningun otro sitio. La base
 * de datos guarda un HMAC del codigo con un secreto del servidor y con el id
 * del desafio como sal. Con seis cifras hay un millon de posibilidades: sin el
 * secreto, una copia de la base de datos no sirve para deducirlos; con el
 * limite de intentos, probarlos en linea tampoco.
 *
 * A QUE QUEDA ATADO
 *
 * Al destino, al canal, al proposito y --cuando lo hay-- al usuario. Un codigo
 * pedido para entrar no sirve para cambiar el telefono, aunque sea el mismo
 * numero y las mismas seis cifras: el proposito es parte de lo que se verifica.
 *
 * ESTE FICHERO ES PURO
 *
 * No toca la base de datos ni envia nada. Recibe desafios y devuelve
 * decisiones; quien lo llama persiste. Asi se prueba sin servidor.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CANALES = Object.freeze(['WHATSAPP', 'SMS', 'EMAIL']);
export const PROPOSITOS = Object.freeze([
  'SIGNUP',
  'LOGIN',
  'PASSWORD_RESET',
  'CHANGE_PHONE',
  'CHANGE_EMAIL',
  'ACCOUNT_LINK',
  'SENSITIVE_ACTION'
]);

/** Que tipo de contacto necesita cada canal. */
export const TIPO_DE_CONTACTO_POR_CANAL = Object.freeze({
  WHATSAPP: 'PHONE',
  SMS: 'PHONE',
  EMAIL: 'EMAIL'
});

/**
 * La politica. Son constantes exportadas, no configuracion: cambiarlas es una
 * decision de seguridad y debe verse en un diff, no en una variable de
 * entorno que nadie revisa.
 */
export const POLITICA = Object.freeze({
  /** Seis cifras: lo que cabe en un SMS y en la memoria de quien lo lee. */
  DIGITOS: 6,
  /** Cinco minutos. Suficiente para que llegue un SMS lento; no para olvidarlo. */
  TTL_MS: 5 * 60 * 1000,
  /** Intentos de escribir el codigo antes de que el desafio quede agotado. */
  INTENTOS_MAXIMOS: 5,
  /** Cuanto hay que esperar para pedir que se reenvie el mismo desafio. */
  COOLDOWN_DE_REENVIO_MS: 60 * 1000
});

export function esCanalConocido(valor) {
  return CANALES.includes(valor);
}

export function esPropositoConocido(valor) {
  return PROPOSITOS.includes(valor);
}

/**
 * Seis cifras con `randomInt`, que es criptograficamente seguro. Se rellena
 * con ceros a la izquierda: `000123` es un codigo tan valido como cualquiera.
 */
export function generarCodigo(digitos = POLITICA.DIGITOS) {
  const tope = 10 ** digitos;
  return String(randomInt(0, tope)).padStart(digitos, '0');
}

/**
 * El HMAC del codigo. El id del desafio actua de sal: el mismo codigo en dos
 * desafios distintos produce hashes distintos, y una tabla precalculada no
 * sirve.
 */
export function hashDelCodigo({ secreto, challengeId, codigo }) {
  if (typeof secreto !== 'string' || secreto.length < 16) {
    throw new Error('El secreto de los codigos debe tener al menos 16 caracteres');
  }
  return createHmac('sha256', secreto).update(`${challengeId}\n${String(codigo)}`).digest('hex');
}

function igualesEnTiempoConstante(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Un desafio nuevo. Devuelve el registro a guardar y, APARTE, el codigo en
 * claro para entregarselo al canal de envio. El codigo no esta dentro del
 * registro y no debe guardarse ni registrarse en ningun sitio.
 */
export function crearDesafio({
  id,
  secreto,
  channel,
  purpose,
  destination,
  userId = null,
  now = new Date(),
  codigo = generarCodigo()
}) {
  if (!esCanalConocido(channel)) throw new Error(`Canal desconocido: ${channel}`);
  if (!esPropositoConocido(purpose)) throw new Error(`Proposito desconocido: ${purpose}`);
  if (typeof destination !== 'string' || destination === '') throw new Error('El desafio necesita un destino');
  if (typeof id !== 'string' || id === '') throw new Error('El desafio necesita un id');

  const creado = now.getTime();
  const registro = {
    id,
    channel,
    purpose,
    destination,
    userId,
    codeHash: hashDelCodigo({ secreto, challengeId: id, codigo }),
    attempts: 0,
    maxAttempts: POLITICA.INTENTOS_MAXIMOS,
    createdAt: new Date(creado).toISOString(),
    expiresAt: new Date(creado + POLITICA.TTL_MS).toISOString(),
    lastSentAt: new Date(creado).toISOString(),
    consumedAt: null,
    invalidatedAt: null
  };
  return { registro, codigo };
}

function vencido(desafio, ahora) {
  return new Date(desafio.expiresAt).getTime() <= ahora.getTime();
}

/** Un desafio sigue vivo si no se uso, no se invalido y no vencio. */
export function estaVivo(desafio, ahora = new Date()) {
  return !desafio.consumedAt && !desafio.invalidatedAt && !vencido(desafio, ahora);
}

/**
 * Los resultados de una verificacion. `OK` consume el desafio; el resto lo
 * deja como estaba, salvo `CODIGO_INCORRECTO`, que gasta un intento, y
 * `AGOTADO`, que lo cierra.
 */
export const RESULTADO = Object.freeze({
  OK: 'OK',
  NO_EXISTE: 'NO_EXISTE',
  NO_COINCIDE: 'NO_COINCIDE',
  VENCIDO: 'VENCIDO',
  YA_USADO: 'YA_USADO',
  INVALIDADO: 'INVALIDADO',
  AGOTADO: 'AGOTADO',
  CODIGO_INCORRECTO: 'CODIGO_INCORRECTO'
});

/**
 * Verifica un codigo contra un desafio y devuelve el desafio ACTUALIZADO
 * junto al resultado. No muta el que recibe.
 *
 * `esperado` describe a que debe estar atado el desafio: destino, canal,
 * proposito y usuario. Si algo no cuadra, `NO_COINCIDE`, y NO se gasta un
 * intento --no ha sido un fallo de codigo sino de contexto-- pero tampoco se
 * revela cual de los cuatro fallo.
 */
export function verificarCodigo({ desafio, codigo, secreto, esperado, now = new Date() }) {
  if (!desafio) return { resultado: RESULTADO.NO_EXISTE, desafio: null };

  if (esperado) {
    const coincide =
      (esperado.destination === undefined || esperado.destination === desafio.destination) &&
      (esperado.channel === undefined || esperado.channel === desafio.channel) &&
      (esperado.purpose === undefined || esperado.purpose === desafio.purpose) &&
      (esperado.userId === undefined || (esperado.userId ?? null) === (desafio.userId ?? null));
    if (!coincide) return { resultado: RESULTADO.NO_COINCIDE, desafio };
  }

  if (desafio.consumedAt) return { resultado: RESULTADO.YA_USADO, desafio };
  if (desafio.invalidatedAt) return { resultado: RESULTADO.INVALIDADO, desafio };
  if (vencido(desafio, now)) return { resultado: RESULTADO.VENCIDO, desafio };
  if (desafio.attempts >= desafio.maxAttempts) return { resultado: RESULTADO.AGOTADO, desafio };

  const ahora = now.toISOString();
  const esperadoHash = hashDelCodigo({ secreto, challengeId: desafio.id, codigo: String(codigo ?? '') });
  if (igualesEnTiempoConstante(esperadoHash, desafio.codeHash)) {
    return { resultado: RESULTADO.OK, desafio: { ...desafio, consumedAt: ahora } };
  }

  const attempts = desafio.attempts + 1;
  const agotado = attempts >= desafio.maxAttempts;
  return {
    resultado: agotado ? RESULTADO.AGOTADO : RESULTADO.CODIGO_INCORRECTO,
    desafio: { ...desafio, attempts, invalidatedAt: agotado ? ahora : desafio.invalidatedAt }
  };
}

/**
 * Cuantos milisegundos faltan para poder reenviar. Cero si ya se puede.
 * Un desafio muerto no se reenvia: se crea otro.
 */
export function esperaParaReenviar(desafio, now = new Date()) {
  if (!desafio || !estaVivo(desafio, now)) return 0;
  const desde = new Date(desafio.lastSentAt).getTime();
  const falta = desde + POLITICA.COOLDOWN_DE_REENVIO_MS - now.getTime();
  return falta > 0 ? falta : 0;
}

/** Cierra un desafio sin consumirlo: se pidio otro, o cambio el contexto. */
export function invalidar(desafio, now = new Date()) {
  if (!estaVivo(desafio, now)) return desafio;
  return { ...desafio, invalidatedAt: now.toISOString() };
}

/**
 * Lo que se le cuenta al cliente de un desafio: ni el hash ni el destino
 * completo. `expiresInSeconds` y `resendAvailableInSeconds` le bastan para
 * pintar la cuenta atras.
 */
export function desafioPublico(desafio, now = new Date()) {
  const faltaParaVencer = Math.max(0, new Date(desafio.expiresAt).getTime() - now.getTime());
  return {
    challengeId: desafio.id,
    channel: desafio.channel,
    purpose: desafio.purpose,
    expiresInSeconds: Math.ceil(faltaParaVencer / 1000),
    resendAvailableInSeconds: Math.ceil(esperaParaReenviar(desafio, now) / 1000),
    attemptsLeft: Math.max(0, desafio.maxAttempts - desafio.attempts)
  };
}
