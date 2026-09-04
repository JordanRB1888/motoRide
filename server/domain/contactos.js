/**
 * La UNICA autoridad de normalizacion de contactos: correo y telefono.
 *
 * POR QUE EXISTE
 *
 * Hasta AUTH-FINAL-1 el telefono se normalizaba en ocho sitios distintos con
 * la misma expresion --`replace(/\D/g, '')`-- y ninguno era la autoridad. Eso
 * funciona hasta el dia en que uno de los ocho cambia. Con OTP encima, el
 * telefono se convierte ademas en un DESTINO al que se envia algo, y un destino
 * tiene que estar en un formato que un proveedor entienda: E.164, con codigo
 * de pais.
 *
 * DOS SALIDAS, Y NO SON LO MISMO
 *
 *   `digitos`  -- solo cifras. Es la clave de COINCIDENCIA que ya usaban el
 *                registro, el login y el expediente. Se conserva exactamente
 *                igual para que ningun usuario actual deje de poder entrar.
 *   `e164`     -- el destino canonico, con `+` y codigo de pais. Es lo que se
 *                guarda en un contacto verificado y lo que recibe el proveedor.
 *
 * VENEZUELA POR OMISION
 *
 * Un numero local venezolano se escribe `0414 123 4567`. Sin codigo de pais,
 * se asume +58 y se quita el cero troncal: `+584141234567`. Un numero que ya
 * trae `+` se respeta tal cual, sea del pais que sea.
 */

export const CODIGO_DE_PAIS_POR_OMISION = '58';

/** Longitudes que acepta el registro hoy. Se conservan. */
export const DIGITOS_MINIMOS = 10;
export const DIGITOS_MAXIMOS = 15;

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * El correo, tal como se compara y se guarda: sin espacios y en minusculas.
 * Es la misma regla que `/api/auth/register` aplicaba a mano.
 */
export function normalizarCorreo(valor) {
  return String(valor ?? '').trim().toLowerCase();
}

export function esCorreoValido(valor) {
  return CORREO_VALIDO.test(normalizarCorreo(valor));
}

/**
 * El telefono en sus dos formas.
 *
 * Devuelve siempre un objeto, nunca lanza: `valido` dice si sirve, y cuando
 * no sirve `e164` es `null`. `digitos` se calcula igual que antes para no
 * cambiar ninguna comparacion existente.
 */
export function normalizarTelefono(valor, { codigoDePais = CODIGO_DE_PAIS_POR_OMISION } = {}) {
  const bruto = String(valor ?? '').trim();
  const digitos = bruto.replace(/\D/g, '');
  const valido = digitos.length >= DIGITOS_MINIMOS && digitos.length <= DIGITOS_MAXIMOS;

  if (!valido) return { bruto, digitos, e164: null, valido: false };

  // Con `+` delante el codigo de pais viene dado y se respeta.
  if (bruto.startsWith('+')) return { bruto, digitos, e164: `+${digitos}`, valido: true };

  // `00` es el prefijo internacional en marcacion: equivale a `+`.
  if (digitos.startsWith('00') && digitos.length > 11) {
    return { bruto, digitos, e164: `+${digitos.slice(2)}`, valido: true };
  }

  // Ya trae el codigo de pais sin `+`: `58414...` (12 cifras para Venezuela).
  if (digitos.startsWith(codigoDePais) && digitos.length === codigoDePais.length + 10) {
    return { bruto, digitos, e164: `+${digitos}`, valido: true };
  }

  // Local con cero troncal: `0414...` -> `+58414...`.
  const sinTroncal = digitos.startsWith('0') ? digitos.slice(1) : digitos;
  return { bruto, digitos, e164: `+${codigoDePais}${sinTroncal}`, valido: true };
}

/** La clave de coincidencia que el resto del servidor ya usaba. */
export function digitosDelTelefono(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Dos telefonos son el mismo si coinciden sus cifras. Es la comparacion que
 * hacia el registro, escrita una sola vez.
 */
export function mismoTelefono(a, b) {
  const x = digitosDelTelefono(a);
  const y = digitosDelTelefono(b);
  return x !== '' && x === y;
}

export function mismoCorreo(a, b) {
  const x = normalizarCorreo(a);
  const y = normalizarCorreo(b);
  return x !== '' && x === y;
}

/** Los dos tipos de contacto que se pueden verificar. */
export const TIPOS_DE_CONTACTO = Object.freeze(['EMAIL', 'PHONE']);

/**
 * El valor normalizado de un contacto, segun su tipo. Es lo que se guarda en
 * `verifiedContacts.valueNormalized` y lo que se compara para saber si dos
 * personas reclaman el mismo contacto.
 */
export function valorNormalizadoDeContacto(tipo, valor) {
  if (tipo === 'EMAIL') {
    const correo = normalizarCorreo(valor);
    return CORREO_VALIDO.test(correo) ? correo : null;
  }
  if (tipo === 'PHONE') return normalizarTelefono(valor).e164;
  return null;
}
