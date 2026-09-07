/**
 * El estado de la solicitud de conductor, y qué enseñar en cada uno.
 *
 * LOS VALORES SON LOS DEL BACKEND, NO UNOS NUEVOS
 *
 * Salen de `server/domain/driverApplicationModel.js`
 * (`DRIVER_APPLICATION_STATUS`). Inventar aquí una escala propia —«NOT_APPLIED»,
 * «UNDER_REVIEW»— habría creado un segundo vocabulario que traducir en cada
 * pantalla, y el primer sitio donde se olvidara la traducción enseñaría un
 * estado equivocado sobre una decisión de aprobación.
 *
 * No están en `shared/contracts/` todavía, así que se declaran aquí con su
 * fuente citada **y** una prueba que los compara con el fichero del backend: si
 * alguien añade o renombra un estado allí, la prueba lo dice.
 *
 * ESTO NO DECIDE NADA
 *
 * El estado lo determina el backend. Este módulo sólo traduce un valor recibido
 * en un texto para la persona. Ninguna pantalla concede acceso de conductor
 * mirando esto: si el backend dice `pending`, no hay interfaz de conductor,
 * y punto.
 */

export const ESTADOS_DE_SOLICITUD = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'needs_changes',
  'suspended'
] as const;
export type EstadoDeSolicitud = (typeof ESTADOS_DE_SOLICITUD)[number];

/** Cuando no hay solicitud ninguna. No es un estado del backend: es su ausencia. */
export const SIN_SOLICITUD = 'sin_solicitud' as const;
export type SituacionDeConductor = EstadoDeSolicitud | typeof SIN_SOLICITUD;

export interface MensajeDeSituacion {
  readonly titulo: string;
  readonly explicacion: string;
  /** Qué puede hacer ahora mismo, si puede hacer algo. */
  readonly accion: string | null;
  /** `true` SÓLO con la solicitud aprobada. */
  readonly puedeConducir: boolean;
}

const MENSAJES: Readonly<Record<SituacionDeConductor, MensajeDeSituacion>> = Object.freeze({
  sin_solicitud: {
    titulo: 'Conviértete en conductor',
    explicacion: 'Necesitamos verificar tus documentos antes de que puedas recibir carreras.',
    accion: 'Empezar mi solicitud',
    puedeConducir: false
  },
  draft: {
    titulo: 'Tu solicitud está a medias',
    explicacion: 'Guardamos lo que llevas. Puedes retomarla donde la dejaste.',
    accion: 'Continuar mi solicitud',
    puedeConducir: false
  },
  pending: {
    titulo: 'Solicitud en revisión',
    explicacion: 'Estamos verificando tus documentos. Te avisamos en cuanto haya respuesta.',
    accion: null,
    puedeConducir: false
  },
  needs_changes: {
    titulo: 'Falta corregir algo',
    explicacion: 'Revisamos tu solicitud y hay algo que necesita cambiarse.',
    accion: 'Ver qué corregir',
    puedeConducir: false
  },
  approved: {
    titulo: 'Todo listo',
    explicacion: 'Tu cuenta de conductor está aprobada.',
    accion: 'Entrar',
    puedeConducir: true
  },
  rejected: {
    titulo: 'Solicitud no aprobada',
    explicacion: 'No pudimos aprobar tu solicitud. Puedes escribirnos si crees que hay un error.',
    accion: 'Contactar con soporte',
    puedeConducir: false
  },
  suspended: {
    titulo: 'Cuenta suspendida',
    explicacion: 'Tu cuenta de conductor está suspendida. Escríbenos para revisar tu caso.',
    accion: 'Contactar con soporte',
    puedeConducir: false
  }
});

/**
 * Traduce una situación en lo que se le enseña a la persona.
 *
 * Un valor desconocido cae en `sin_solicitud`, que es el más restrictivo: no
 * concede nada. Si el backend empieza a devolver un estado que esta versión de
 * la aplicación no conoce, lo peor que puede pasar es que se ofrezca empezar una
 * solicitud — nunca que se abra una interfaz de conductor por error.
 */
export function describirSituacion(situacion: string): MensajeDeSituacion {
  const conocida = (ESTADOS_DE_SOLICITUD as readonly string[]).includes(situacion)
    || situacion === SIN_SOLICITUD;
  return MENSAJES[conocida ? (situacion as SituacionDeConductor) : SIN_SOLICITUD];
}

/**
 * `true` sólo con la aprobación explícita.
 *
 * Se escribe como comparación positiva y no como «no está rechazado»: una lista
 * de exclusiones deja pasar cualquier estado nuevo que nadie recuerde añadir.
 */
export function puedeConducir(situacion: string): boolean {
  return situacion === 'approved';
}
