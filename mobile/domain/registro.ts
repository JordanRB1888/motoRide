/**
 * Crear una cuenta: qué se comprueba antes de molestar al servidor.
 *
 * LA INTENCIÓN NO ES UN ROL
 *
 * Quien pulsa «Conductor» en la bienvenida y crea su cuenta NO se convierte en
 * conductor. Nace como pasajera, igual que todo el mundo, y a continuación se le
 * abre la postulación. El rol lo concede el backend cuando administración
 * aprueba el expediente, y no antes. Aquí la intención sólo decide dos cosas:
 * qué dice el botón y a qué pantalla se va después.
 *
 * ESTAS REGLAS SON UNA CORTESÍA
 *
 * Cada comprobación de aquí es un espejo de `/api/auth/register`, y sirve para
 * avisar antes de gastar una petición por una red móvil que se paga por megas.
 * La autoridad es el servidor: si un día endurece una regla, aquí puede quedar
 * una comprobación de menos, y el servidor seguirá diciendo que no. Hay una
 * prueba que lee el servidor y compara.
 */

import type { IntencionDeEntrada } from './entrada';

/** Lo que se le pide a quien crea su cuenta. */
export interface DatosDeRegistro {
  readonly nombre: string;
  readonly apellido: string;
  readonly correo: string;
  readonly telefono: string;
  readonly contrasena: string;
}

/** Qué campo falla y por qué. Las claves son las del servidor. */
export type ErroresDeRegistro = Readonly<Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'password', string>>>;

export type MotivoDeRegistro =
  | 'CUENTA_EXISTENTE'
  | 'DATOS_INVALIDOS'
  | 'DEMASIADOS_INTENTOS'
  | 'SIN_CONEXION'
  | 'ERROR_DEL_SERVIDOR';

/** Mínimo del servidor. Escrito aquí para poder decirlo antes de enviar. */
export const LARGO_MINIMO_DE_CONTRASENA = 8;
const LARGO_MINIMO_DEL_NOMBRE = 2;
const DIGITOS_DEL_TELEFONO = { minimo: 10, maximo: 15 } as const;

/** El mismo patrón que usa el servidor. Ni más estricto ni más laxo. */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizarCorreo = (valor: string): string => valor.trim().toLowerCase();
export const digitosDelTelefono = (valor: string): string => valor.replace(/\D/g, '');

/**
 * Lo que se puede comprobar sin preguntar.
 *
 * Devuelve un objeto vacío cuando todo cuadra. No comprueba si la cuenta ya
 * existe: eso sólo lo sabe el servidor, y preguntárselo campo a campo sería
 * decirle a cualquiera qué correos están registrados.
 */
export function validarRegistro(datos: DatosDeRegistro): ErroresDeRegistro {
  const errores: Record<string, string> = {};

  if (datos.nombre.trim().length < LARGO_MINIMO_DEL_NOMBRE) errores.firstName = 'El nombre es obligatorio.';
  if (datos.apellido.trim().length < LARGO_MINIMO_DEL_NOMBRE) errores.lastName = 'El apellido es obligatorio.';
  if (!CORREO.test(normalizarCorreo(datos.correo))) errores.email = 'Introduce una dirección de correo válida.';

  const digitos = digitosDelTelefono(datos.telefono);
  if (digitos.length < DIGITOS_DEL_TELEFONO.minimo || digitos.length > DIGITOS_DEL_TELEFONO.maximo) {
    errores.phone = 'Introduce un teléfono válido.';
  }
  if (datos.contrasena.length < LARGO_MINIMO_DE_CONTRASENA) {
    errores.password = `La contraseña debe tener al menos ${LARGO_MINIMO_DE_CONTRASENA} caracteres.`;
  }

  return errores;
}

export const registroCompleto = (errores: ErroresDeRegistro): boolean => Object.keys(errores).length === 0;

/**
 * Lo que se le dice a la persona cuando el servidor dice que no.
 *
 * «Ya hay una cuenta con esos datos» no dice cuál de los dos: el servidor
 * responde lo mismo para el correo y para el teléfono, y está bien que así sea.
 * Precisar cuál permitiría averiguar qué correos están registrados probando uno
 * a uno. Lo que sí se hace es ofrecer la salida: entrar.
 */
export const MENSAJES_DE_REGISTRO: Readonly<Record<MotivoDeRegistro, string>> = Object.freeze({
  CUENTA_EXISTENTE: 'Ya hay una cuenta con ese correo o ese teléfono. Entra con ella si es tuya.',
  DATOS_INVALIDOS: 'Revisa los datos: hay algo que no cuadra.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
  SIN_CONEXION: 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  ERROR_DEL_SERVIDOR: 'No pudimos crear tu cuenta. Inténtalo de nuevo en un momento.'
});

/** Con este motivo, lo que ayuda es ir a entrar, no repetir el formulario. */
export const conviene_entrar = (motivo: MotivoDeRegistro): boolean => motivo === 'CUENTA_EXISTENTE';

/**
 * A dónde va alguien que acaba de crear su cuenta.
 *
 * Quien venía por la puerta de conductor va a la postulación —a crear el
 * expediente que algún día le dará el rol—, y quien venía por la de pasajera,
 * a su inicio. En ningún caso al inicio de conductor: esa cuenta todavía no lo
 * es, y llevarla allí sería prometer algo que el backend no ha concedido.
 */
export function destinoTrasRegistrarse(intencion?: IntencionDeEntrada | null): '/pasajero' | '/postulacion' {
  return intencion === 'driver' ? '/postulacion' : '/pasajero';
}
