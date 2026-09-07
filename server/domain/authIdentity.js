/**
 * Identidad de autenticacion: como se demuestra quien eres, separado de quien
 * eres.
 *
 * TRES COSAS QUE NO SON LA MISMA
 *
 *   USER               -- la persona en +58express: id, nombre, ROL, saldo,
 *                         viajes. Vive en `users`. El rol lo concede el
 *                         servidor y nada de este fichero lo toca.
 *   AUTH IDENTITY      -- una forma de demostrar que eres ese User: la
 *                         contrasena, una cuenta de Google, una de Apple. Un
 *                         User puede tener varias; cada una pertenece a un solo
 *                         User. Vive en `authIdentities`.
 *   VERIFIED CONTACT   -- un correo o un telefono cuya posesion se ha
 *                         demostrado con un codigo. Vive en `verifiedContacts`.
 *
 * LA CLAVE ESTABLE DE UNA IDENTIDAD ES EL SUBJECT, NO EL CORREO
 *
 * Google y Apple entregan un identificador estable de la cuenta (`sub`). El
 * correo puede cambiar, puede ocultarse (Apple lo permite) o puede coincidir
 * con el de otra persona que lo tenia antes. Por eso la identidad se ancla a
 * `(provider, providerSubject)` y ese par es UNICO en todo el sistema: dos
 * Users no pueden reclamar la misma cuenta de Google.
 *
 * Para PASSWORD el subject es el id del User: la contrasena no viene de un
 * proveedor externo y el hash sigue viviendo en `users.passwordHash`, donde
 * siempre estuvo. Aqui no se duplica.
 */

export const PROVEEDORES = Object.freeze(['PASSWORD', 'GOOGLE', 'APPLE']);

export function esProveedorConocido(valor) {
  return PROVEEDORES.includes(valor);
}

/** Los proveedores cuya identidad llega como token firmado por un tercero. */
export const PROVEEDORES_SOCIALES = Object.freeze(['GOOGLE', 'APPLE']);

/**
 * La clave de unicidad. Es lo que el indice unico de la base de datos
 * protege y lo que el almacen comprueba antes de insertar.
 */
export function claveDeIdentidad(provider, providerSubject) {
  return `${provider}:${providerSubject}`;
}

/**
 * Una identidad recien creada. Pura: quien la guarda decide donde.
 *
 * `providerSubject` se conserva tal cual lo entrega el proveedor. No se
 * normaliza porque para Google y Apple es una cadena opaca y cualquier
 * transformacion podria hacer que dos cuentas distintas colisionaran o que la
 * misma cuenta no se reconociera.
 */
export function crearIdentidad({ id, userId, provider, providerSubject, now = new Date() }) {
  if (!esProveedorConocido(provider)) throw new Error(`Proveedor desconocido: ${provider}`);
  if (typeof userId !== 'string' || userId === '') throw new Error('La identidad necesita un userId');
  if (typeof providerSubject !== 'string' || providerSubject === '') {
    throw new Error('La identidad necesita un providerSubject');
  }
  const createdAt = now.toISOString();
  return { id, userId, provider, providerSubject, createdAt, lastUsedAt: createdAt };
}

/** La identidad PASSWORD de un User: el subject es su propio id. */
export function identidadDeContrasena({ id, user, now }) {
  return crearIdentidad({ id, userId: user.id, provider: 'PASSWORD', providerSubject: user.id, now });
}

/** Lo que se le puede contar al cliente de una identidad: nunca el subject. */
export function identidadPublica(identidad) {
  return {
    provider: identidad.provider,
    createdAt: identidad.createdAt,
    lastUsedAt: identidad.lastUsedAt
  };
}

/**
 * Un contacto (correo o telefono) asociado a un User. Nace SIN verificar:
 * aparecer en el registro no demuestra posesion. `verifiedAt` solo lo
 * escribe una verificacion con codigo que salio bien.
 */
export function crearContacto({ id, userId, type, valueNormalized, now = new Date() }) {
  if (type !== 'EMAIL' && type !== 'PHONE') throw new Error(`Tipo de contacto desconocido: ${type}`);
  if (typeof userId !== 'string' || userId === '') throw new Error('El contacto necesita un userId');
  if (typeof valueNormalized !== 'string' || valueNormalized === '') {
    throw new Error('El contacto necesita un valor normalizado');
  }
  return { id, userId, type, valueNormalized, verifiedAt: null, createdAt: now.toISOString() };
}

export function contactoVerificado(contacto) {
  return typeof contacto?.verifiedAt === 'string' && contacto.verifiedAt !== '';
}

export function contactoPublico(contacto) {
  return {
    type: contacto.type,
    verified: contactoVerificado(contacto),
    verifiedAt: contacto.verifiedAt ?? null
  };
}
