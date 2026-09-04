/**
 * El almacen de identidades y contactos: la unica puerta de escritura a
 * `database.authIdentities` y `database.verifiedContacts`.
 *
 * COMO SE GARANTIZA LA UNICIDAD
 *
 * En dos capas. La primera es este fichero: comprueba y anade en la misma
 * vuelta del bucle de eventos, sin ningun `await` en medio, asi que dentro de
 * un proceso dos peticiones no pueden colarse entre el «no existe» y el
 * `push`. La segunda es la base de datos: los indices unicos de
 * `server/migrations/002_*.sql` (SQLite) y de
 * `supabase/migrations/20260904120000_*.sql` (Postgres) rechazan el duplicado
 * si dos instancias del servidor llegan a la vez; entonces la persistencia
 * falla y la peticion recibe un 503 en vez de un exito falso.
 *
 * QUE NO HACE
 *
 * No concede roles, no toca `users.passwordHash` y no borra nada. Las
 * identidades PASSWORD apuntan al User; el hash sigue donde estaba.
 */
import { randomUUID } from 'node:crypto';
import {
  claveDeIdentidad,
  crearContacto,
  crearIdentidad,
  identidadDeContrasena
} from '../domain/authIdentity.js';

export function createAuthIdentityStore({ database, now = () => new Date(), nuevoId = () => randomUUID() }) {
  if (!database) throw new Error('AUTH_IDENTITY_STORE_REQUIRES_DATABASE');
  database.authIdentities ??= [];
  database.verifiedContacts ??= [];

  const identidades = {
    buscar(provider, providerSubject) {
      const clave = claveDeIdentidad(provider, providerSubject);
      return database.authIdentities.find(i => claveDeIdentidad(i.provider, i.providerSubject) === clave) ?? null;
    },

    deUsuario(userId) {
      return database.authIdentities.filter(i => i.userId === userId);
    },

    /**
     * Crea la identidad o devuelve la que ya existia para el MISMO User.
     * Si pertenece a otro User, lanza `IDENTITY_TAKEN`: eso no se resuelve
     * aqui, se responde 409 y quien la reclama tiene que demostrar posesion.
     *
     * Es idempotente a proposito: un doble toque en «Entrar con Google» hace
     * dos peticiones con el mismo token, y las dos deben acabar en la misma
     * identidad, no en un 409 para la segunda.
     */
    crear({ userId, provider, providerSubject }) {
      const existente = identidades.buscar(provider, providerSubject);
      if (existente) {
        if (existente.userId !== userId) {
          const fallo = new Error('IDENTITY_TAKEN');
          fallo.code = 'IDENTITY_TAKEN';
          throw fallo;
        }
        return { creada: false, identidad: existente };
      }
      const identidad = crearIdentidad({ id: `authid_${nuevoId()}`, userId, provider, providerSubject, now: now() });
      database.authIdentities.push(identidad);
      return { creada: true, identidad };
    },

    marcarUso(identidad) {
      identidad.lastUsedAt = now().toISOString();
      return identidad;
    },

    /** La identidad PASSWORD del User; se crea si falta. Nunca duplica el hash. */
    asegurarDeContrasena(user) {
      const existente = identidades.buscar('PASSWORD', user.id);
      if (existente) return { creada: false, identidad: existente };
      const identidad = identidadDeContrasena({ id: `authid_${nuevoId()}`, user, now: now() });
      database.authIdentities.push(identidad);
      return { creada: true, identidad };
    },

    /**
     * El relleno de arranque: cada User que ya tiene contrasena recibe su
     * identidad PASSWORD. Corre en cada arranque y no hace nada la segunda
     * vez. Devuelve cuantas creo, para que el arranque sepa si persistir.
     */
    rellenarContrasenas() {
      let creadas = 0;
      for (const user of database.users) {
        if (typeof user.passwordHash !== 'string' || user.passwordHash === '') continue;
        if (identidades.asegurarDeContrasena(user).creada) creadas += 1;
      }
      return creadas;
    }
  };

  const contactos = {
    buscar(userId, type, valueNormalized) {
      return (
        database.verifiedContacts.find(
          c => c.userId === userId && c.type === type && c.valueNormalized === valueNormalized
        ) ?? null
      );
    },

    deUsuario(userId) {
      return database.verifiedContacts.filter(c => c.userId === userId);
    },

    /** Quien tiene VERIFICADO ese contacto, si alguien. */
    duenoVerificado(type, valueNormalized) {
      return (
        database.verifiedContacts.find(
          c => c.type === type && c.valueNormalized === valueNormalized && typeof c.verifiedAt === 'string'
        ) ?? null
      );
    },

    /**
     * El contacto del User, creado SIN verificar si no existia. Es lo que el
     * registro llama: deja constancia de que el User declaro ese correo o
     * telefono, y nada mas.
     */
    asegurar({ userId, type, valueNormalized }) {
      const existente = contactos.buscar(userId, type, valueNormalized);
      if (existente) return { creado: false, contacto: existente };
      const contacto = crearContacto({ id: `contact_${nuevoId()}`, userId, type, valueNormalized, now: now() });
      database.verifiedContacts.push(contacto);
      return { creado: true, contacto };
    },

    /**
     * Marca el contacto como verificado. Solo lo llama una verificacion con
     * codigo que salio bien; este fichero no comprueba codigos.
     *
     * Si OTRO User ya lo tiene verificado, no se le quita: `CONTACT_TAKEN`.
     * Reasignar un telefono es una decision con su propia prueba de posesion
     * y su propia fase.
     */
    marcarVerificado({ userId, type, valueNormalized }) {
      const dueno = contactos.duenoVerificado(type, valueNormalized);
      if (dueno && dueno.userId !== userId) return { ok: false, motivo: 'CONTACT_TAKEN', contacto: null };
      const { contacto } = contactos.asegurar({ userId, type, valueNormalized });
      if (typeof contacto.verifiedAt !== 'string') contacto.verifiedAt = now().toISOString();
      return { ok: true, motivo: null, contacto };
    }
  };

  /**
   * Lo que un alta con contrasena deja ademas del User: su identidad PASSWORD
   * y sus contactos declarados, SIN verificar. Devuelve `deshacer()` para que
   * el registro pueda retirarlo todo si la persistencia falla, igual que ya
   * retira el User.
   */
  function altaConContrasena(user, { email = null, phoneE164 = null } = {}) {
    const creados = [];
    const identidad = identidades.asegurarDeContrasena(user);
    if (identidad.creada) creados.push(['authIdentities', identidad.identidad]);
    if (email) {
      const contacto = contactos.asegurar({ userId: user.id, type: 'EMAIL', valueNormalized: email });
      if (contacto.creado) creados.push(['verifiedContacts', contacto.contacto]);
    }
    if (phoneE164) {
      const contacto = contactos.asegurar({ userId: user.id, type: 'PHONE', valueNormalized: phoneE164 });
      if (contacto.creado) creados.push(['verifiedContacts', contacto.contacto]);
    }
    return {
      deshacer() {
        for (const [tabla, registro] of creados) {
          const indice = database[tabla].indexOf(registro);
          if (indice !== -1) database[tabla].splice(indice, 1);
        }
      }
    };
  }

  return { identidades, contactos, altaConContrasena };
}
