/**
 * Qué decirle en el inicio a quien se postuló para conducir.
 *
 * POR QUÉ ESTO VIVE AQUÍ Y NO EN LA PANTALLA
 *
 * Quien manda una solicitud no debería tener que acordarse de entrar al perfil
 * cada mañana a ver si administración contestó. El inicio se lo dice. Pero eso
 * significa traducir seis estados del expediente a un título, una frase y un
 * botón, y esa traducción no puede estar repartida por las pantallas: acabaría
 * habiendo dos versiones de qué significa `needs_changes`.
 *
 * A DÓNDE LLEVA CADA BOTÓN NO SE DECIDE AQUÍ
 *
 * El destino sale de `destinoDePostulacion`, que ya es la única autoridad sobre
 * en qué paso está cada quien. Aquí sólo se elige qué palabras acompañan a ese
 * destino. Si un día cambia el orden de los pasos, cambia allí y esto sigue
 * siendo cierto.
 *
 * LO QUE NO SE INVENTA
 *
 * Un expediente rechazado no ofrece «volver a intentarlo», porque hoy el
 * servidor no concede eso. Uno suspendido no ofrece desbloquearse. Prometer en
 * el inicio algo que la siguiente pantalla no puede cumplir es peor que no
 * decir nada.
 */

import {
  destinoDePostulacion,
  describirDocumento,
  type RetratoDelExpediente,
  type RutaDePostulacion
} from './postulacion';

/** Un documento que administración pidió repetir, con lo que escribió. */
export interface CorreccionDelExpediente {
  readonly tipo: string;
  readonly motivo: string | null;
}

/**
 * Lo que el inicio necesita saber del expediente.
 *
 * No es la solicitud entera: aquí no entran la cédula, ni el teléfono, ni las
 * claves de los ficheros. Sólo lo que se va a pintar.
 */
export interface ExpedienteEnElInicio {
  readonly retrato: RetratoDelExpediente;
  readonly correcciones: readonly CorreccionDelExpediente[];
  /** Lo que administración escribió al decidir. */
  readonly motivoDeLaDecision: string | null;
  /** Una corrección de datos escritos, si la hubo, aparte de los documentos. */
  readonly correccionEscrita: string | null;
}

/** Las tres formas que Antigravity dibujó para esta tarjeta. */
export type VarianteDelAviso = 'review' | 'changes_required' | 'approved';

export interface AvisoDePostulacion {
  readonly variante: VarianteDelAviso;
  readonly titulo: string;
  readonly descripcion: string;
  /** El texto de la insignia. Siempre dice el estado con palabras, no con color. */
  readonly etiqueta: string;
  /** `null` cuando no hay nada que hacer todavía: la tarjeta informa y ya. */
  readonly textoCTA: string | null;
  readonly destino: RutaDePostulacion;
  /**
   * Si antes de ir hay que volver a preguntarle al servidor quién es esta
   * persona. Sólo al aprobarse: el rol lo concede el backend, no la aplicación.
   */
  readonly revalidarLaSesion: boolean;
  readonly testID: string;
}

/** Cómo se lee un documento pendiente de corregir, con su motivo si lo hay. */
function describirCorreccion(correccion: CorreccionDelExpediente): string {
  const nombre = describirDocumento(correccion.tipo)?.titulo ?? correccion.tipo;
  return correccion.motivo ? `${nombre}: ${correccion.motivo}` : nombre;
}

/**
 * Qué falta por corregir, en una línea.
 *
 * Con una sola corrección cabe el motivo entero, que es lo que de verdad ayuda.
 * Con varias no cabe, así que se dice cuántas son y por dónde empezar; la lista
 * completa está en el paso de documentos, que es donde se arreglan.
 */
function resumirCorrecciones(expediente: ExpedienteEnElInicio): string {
  const [primera, ...resto] = expediente.correcciones;
  if (primera === undefined) {
    return expediente.correccionEscrita ?? 'Administración te pidió corregir algo.';
  }
  if (resto.length === 0) return describirCorreccion(primera);
  const nombre = describirDocumento(primera.tipo)?.titulo ?? primera.tipo;
  return `${expediente.correcciones.length} documentos por corregir. Empieza por ${nombre.toLowerCase()}.`;
}

/**
 * El aviso que toca, o `null` si no hay nada que anunciar.
 *
 * Devuelve `null` en dos casos, y los dos importan:
 *
 *   - Sin expediente. Quien nunca se postuló no tiene por qué encontrarse una
 *     tarjeta permanente ofreciéndoselo; la puerta sigue en «Cambiar de modo».
 *   - Quien ya es conductor. Su solicitud terminó hace tiempo, y recordárselo
 *     cada vez que pide un viaje como pasajero no informa de nada.
 */
export function avisoDePostulacion(
  expediente: ExpedienteEnElInicio | null,
  { rolReal }: { readonly rolReal?: string | null } = {}
): AvisoDePostulacion | null {
  if (rolReal === 'driver') return null;
  if (expediente === null) return null;

  const destino = destinoDePostulacion(expediente.retrato, { rolReal });
  const comun = { destino, revalidarLaSesion: false };

  switch (expediente.retrato.estado) {
    case 'draft':
      return {
        ...comun,
        variante: 'review',
        etiqueta: 'Sin enviar',
        titulo: 'Continúa tu solicitud',
        descripcion: 'Te quedó a medias. Retómala donde la dejaste.',
        textoCTA: 'Continuar',
        testID: 'aviso-postulacion-draft'
      };

    case 'needs_changes':
      return {
        ...comun,
        variante: 'changes_required',
        etiqueta: 'Requiere cambios',
        titulo: 'Tu solicitud necesita una corrección',
        descripcion: resumirCorrecciones(expediente),
        textoCTA: 'Revisar cambios',
        testID: 'aviso-postulacion-needs-changes'
      };

    case 'approved':
      return {
        ...comun,
        // El rol lo da el servidor. Esta pantalla sólo se lo vuelve a preguntar.
        revalidarLaSesion: true,
        variante: 'approved',
        etiqueta: 'Aprobada',
        titulo: 'Solicitud aprobada',
        descripcion: 'Ya puedes empezar a conducir con +58Express.',
        textoCTA: 'Entrar como conductor',
        testID: 'aviso-postulacion-approved'
      };

    case 'rejected':
      return {
        ...comun,
        variante: 'review',
        etiqueta: 'Rechazada',
        titulo: 'Solicitud rechazada',
        // El motivo lo escribió administración; si no escribió nada, no se
        // inventa uno, y tampoco se ofrece volver a intentarlo.
        descripcion: expediente.motivoDeLaDecision ?? 'Toca para ver los detalles.',
        textoCTA: null,
        testID: 'aviso-postulacion-rejected'
      };

    case 'suspended':
      return {
        ...comun,
        variante: 'review',
        etiqueta: 'Suspendida',
        titulo: 'Tu cuenta de conductor está suspendida',
        descripcion: expediente.motivoDeLaDecision ?? 'Toca para ver los detalles.',
        textoCTA: null,
        testID: 'aviso-postulacion-suspended'
      };

    // `pending` y cualquier estado que esta versión no conozca. El servicio ya
    // convierte lo desconocido en `pending`, que es el más prudente: esperar.
    default:
      return {
        ...comun,
        variante: 'review',
        etiqueta: 'En revisión',
        titulo: 'Solicitud en revisión',
        descripcion: 'Te avisamos en cuanto haya una decisión.',
        textoCTA: null,
        testID: 'aviso-postulacion-pending'
      };
  }
}
