/**
 * Cuando se exige un contacto verificado. Una sola autoridad, apagada.
 *
 * POR QUE ESTA APAGADA
 *
 * Medido sobre la base de desarrollo el 4 de septiembre de 2026: CERO usuarios
 * tienen el telefono verificado, porque hasta AUTH-FINAL-1 no habia forma de
 * verificarlo. Encender la exigencia hoy bloquearia los seis expedientes que
 * hay y dejaria a los cinco conductores aprobados sin poder trabajar. No es una
 * medida de seguridad: es una interrupcion del servicio.
 *
 * Asi que la regla se escribe, se prueba y se deja EN OFF. Se enciende cuando
 * exista un proveedor real (AUTH-FINAL-2 deja la fundacion lista pero sin
 * credenciales) y despues de una migracion progresiva: pedir el codigo en el
 * primer punto sensible que toque cada persona, no de golpe a todo el mundo.
 *
 * COMO SE ENCIENDE
 *
 * Con variables de entorno, no editando codigo, para poder apagarla en
 * caliente si el proveedor se cae:
 *
 *   DRIVER_REQUIRE_VERIFIED_PHONE=true     al enviar un expediente
 *   PASSENGER_REQUIRE_VERIFIED_PHONE=true  antes de una operacion sensible
 *
 * Ninguna de las dos toca a quien YA esta aprobado: se comprueban al enviar y
 * al operar, no al entrar. Nadie pierde el acceso a su cuenta por esto.
 */

const ENCENDIDO = new Set(['1', 'true', 'yes', 'si']);

function encendida(valor) {
  return ENCENDIDO.has(String(valor ?? '').trim().toLowerCase());
}

/**
 * El estado de las dos politicas. Se lee del entorno en cada llamada para que
 * apagar una no exija reiniciar el proceso.
 */
export function politicasDeVerificacion(env = process.env) {
  return {
    /** Exigir telefono verificado al ENVIAR un expediente de conductor. */
    conductorExigeTelefono: encendida(env.DRIVER_REQUIRE_VERIFIED_PHONE),
    /** Exigir telefono verificado antes de una operacion sensible del pasajero. */
    pasajeroExigeTelefono: encendida(env.PASSENGER_REQUIRE_VERIFIED_PHONE)
  };
}

/**
 * Si a esta persona le falta verificar el telefono para enviar su expediente.
 *
 * `contactosVerificados` son los contactos del User que ya tienen `verifiedAt`.
 * Con la politica apagada devuelve siempre `false`: nadie queda bloqueado.
 */
export function faltaTelefonoVerificadoParaConductor({ contactosVerificados = [], env = process.env } = {}) {
  if (!politicasDeVerificacion(env).conductorExigeTelefono) return false;
  return !contactosVerificados.some(contacto => contacto.type === 'PHONE' && contacto.verifiedAt);
}

export function faltaTelefonoVerificadoParaPasajero({ contactosVerificados = [], env = process.env } = {}) {
  if (!politicasDeVerificacion(env).pasajeroExigeTelefono) return false;
  return !contactosVerificados.some(contacto => contacto.type === 'PHONE' && contacto.verifiedAt);
}

/** El error que veria el cliente si la politica estuviera encendida. */
export const PHONE_VERIFICATION_REQUIRED = 'PHONE_VERIFICATION_REQUIRED';
