/**
 * Borrar una cuenta: qué se borra, qué se anonimiza y qué se conserva.
 *
 * POR QUÉ NO SE BORRA TODO
 *
 * Un viaje tiene dos partes. Borrar el del pasajero destruiría el registro de
 * trabajo del conductor, y al revés. Una transacción es contabilidad, y una
 * acción de administración es auditoría: eso no se borra porque alguien se
 * vaya, se conserva **sin poder atribuirlo a una persona identificable**.
 *
 * Por eso el id del usuario NO desaparece: se queda como referencia
 * anonimizada, sin nombre, sin correo, sin teléfono y sin foto. Lo que se
 * destruye es lo que identifica; lo que se conserva es lo que otras entidades
 * necesitan para seguir teniendo sentido.
 *
 * LO QUE SÍ DESAPARECE DEL TODO
 *
 * Las credenciales y los contactos —para que nadie pueda volver a entrar ni
 * recibir un código—, y los ficheros privados: la cédula, la licencia y el
 * vídeo de presentación son documentos de identidad, y conservarlos «por si
 * acaso» es exactamente lo que no se debe hacer.
 *
 * ESTE FICHERO ES PURO
 *
 * Decide y devuelve; quien llama borra ficheros y persiste. Así se prueba sin
 * base de datos y sin almacenamiento.
 */

/** Las tablas cuyas filas de esa persona se borran enteras. */
export const TABLAS_QUE_SE_BORRAN = Object.freeze([
  'authIdentities',
  'verifiedContacts',
  'authChallenges',
  'pushSubscriptions',
  'notifications'
]);

/** El estado de una cuenta borrada. `requireAuth` lo rechaza. */
export const ESTADO_BORRADO = 'DELETED';

/**
 * El usuario, anonimizado.
 *
 * Se conservan `id` y `role` porque los viajes y la contabilidad los
 * referencian; y `createdAt`, que es un dato del registro, no de la persona.
 * Todo lo demás se va.
 */
export function usuarioAnonimizado(user, ahora) {
  return {
    id: user.id,
    role: user.role,
    firstName: 'Cuenta',
    lastName: 'eliminada',
    email: null,
    phone: null,
    photoStorageKey: null,
    passwordHash: null,
    accountStatus: ESTADO_BORRADO,
    deletedAt: ahora,
    // Invalida cualquier token emitido antes: el JWT que tuviera en la mano
    // deja de servir en la siguiente petición.
    credentialsChangedAt: ahora,
    emailVerified: false,
    phoneVerified: false,
    rating: user.rating ?? null,
    totalTrips: user.totalTrips ?? 0,
    walletBalance: user.walletBalance ?? 0,
    createdAt: user.createdAt ?? null,
    updatedAt: ahora
  };
}

/** El expediente, sin datos personales pero con su decisión intacta. */
export function expedienteAnonimizado(expediente, ahora) {
  const {
    personal: _personal,
    vehicle,
    ...resto
  } = expediente;
  return {
    ...resto,
    vehicle: vehicle === undefined ? undefined : { ...vehicle, plate: null },
    personal: null,
    anonymizedAt: ahora
  };
}

/**
 * Qué hacer con una cuenta. Devuelve un PLAN, no lo ejecuta.
 *
 * `ficherosABorrar` son claves del almacenamiento privado: la foto de perfil y
 * todos los documentos del expediente, el vídeo incluido.
 */
export function planDeBorrado({ database, userId, ahora }) {
  const user = database.users.find(item => item.id === userId) ?? null;
  if (user === null) return { existe: false };

  const yaBorrada = user.accountStatus === ESTADO_BORRADO;

  const documentos = (database.driverDocuments ?? []).filter(doc => doc.userId === userId);
  const ficherosABorrar = [
    ...(typeof user.photoStorageKey === 'string' && user.photoStorageKey !== '' ? [user.photoStorageKey] : []),
    ...documentos.map(doc => doc.storageKey).filter(clave => typeof clave === 'string' && clave !== '')
  ];

  return {
    existe: true,
    yaBorrada,
    user,
    ficherosABorrar,
    // Se cuentan para el informe, sin sacar nada de dentro.
    cuantos: {
      identidades: (database.authIdentities ?? []).filter(i => i.userId === userId).length,
      contactos: (database.verifiedContacts ?? []).filter(c => c.userId === userId).length,
      desafios: (database.authChallenges ?? []).filter(d => d.userId === userId).length,
      documentos: documentos.length,
      viajes: (database.trips ?? []).filter(
        t => t.passengerId === userId || t.driverId === userId || t.assignedDriverId === userId
      ).length,
      transacciones: (database.transactions ?? []).filter(t => t.userId === userId).length
    }
  };
}

/**
 * Si un token sigue valiendo para este usuario.
 *
 * `iat` viene en segundos; `credentialsChangedAt` es una fecha ISO. Un usuario
 * sin la marca se comporta como siempre: nada caduca de más.
 *
 * El margen de un segundo evita echar a quien acaba de cambiar su contraseña:
 * el token nuevo se firma en el mismo segundo en que se guarda la marca, y sin
 * margen se invalidaría a sí mismo.
 */
export function tokenSigueValiendo(user, emitidoEnSegundos) {
  const marca = user?.credentialsChangedAt;
  if (typeof marca !== 'string' || marca === '') return true;
  if (typeof emitidoEnSegundos !== 'number' || !Number.isFinite(emitidoEnSegundos)) return true;
  const cambiadas = Math.floor(new Date(marca).getTime() / 1000);
  if (!Number.isFinite(cambiadas)) return true;
  return emitidoEnSegundos + 1 >= cambiadas;
}

/**
 * Cuántos métodos de entrada le quedarían a alguien si quitara uno.
 *
 * La contraseña cuenta como método. Quitar el último dejaría la cuenta sin
 * puerta, y eso no se permite ni aunque lo pida: recuperarla exigiría un
 * contacto verificado y un canal, que hoy puede no existir.
 */
export function metodosDeEntrada({ user, identidades }) {
  const conContrasena = typeof user?.passwordHash === 'string' && user.passwordHash !== '';
  const sociales = identidades.filter(i => i.provider !== 'PASSWORD').map(i => i.provider);
  return { conContrasena, sociales, total: (conContrasena ? 1 : 0) + sociales.length };
}

/** Si se puede desvincular ese proveedor sin dejar la cuenta sin puerta. */
export function sePuedeDesvincular({ user, identidades, provider }) {
  if (provider === 'PASSWORD') return false;
  const tiene = identidades.some(i => i.provider === provider);
  if (!tiene) return false;
  const { total } = metodosDeEntrada({ user, identidades });
  return total > 1;
}
