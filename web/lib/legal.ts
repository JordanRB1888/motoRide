/**
 * La identidad legal de la empresa, en un solo sitio.
 *
 * POR QUÉ AQUÍ Y NO ESCRITA EN CADA PÁGINA
 *
 * Estos datos aparecen en la política de privacidad, en los términos de uso y
 * —el día que se enciendan— en los formularios que piden consentimiento. Tres
 * copias de una razón social son tres oportunidades de que una se quede vieja:
 * cambia el domicilio fiscal, se actualizan dos de las tres, y el documento que
 * queda mal es justamente el que alguien va a leer el día que haya un problema.
 *
 * Los valores los confirmó el dueño el 13 de septiembre de 2026. **Ninguno está
 * inventado ni deducido.** Si algo de esto cambia, se cambia aquí y los dos
 * documentos quedan al día solos.
 */

export const EMPRESA = {
  razonSocial: "+58 EXPRESS, C.A.",

  /* CONFIRMADO CONTRA EL DOCUMENTO OFICIAL el 13 de septiembre de 2026: el RIF
     figura exactamente así, sin separadores.

     NO añadir guiones. Es tentador «normalizarlo» a J-50872360-0 porque es la
     forma en que suele verse, pero eso sería inferir dónde van los grupos de un
     identificador oficial, y una inferencia en un documento legal no es un
     detalle de estilo: es un dato distinto del que consta en el documento. */
  rif: "J508723600",

  domicilio:
    "Carretera Vía El Moján, Casa Nro. S/N, Sector Puerto Caballo, " +
    "Maracaibo, Estado Zulia, Zona Postal 4001, República Bolivariana de Venezuela",

  /** Quien decide qué se hace con los datos. Hoy coincide con la empresa. */
  responsable: "+58 EXPRESS, C.A.",

  /** A donde se escriben las solicitudes sobre datos personales. */
  correoPrivacidad: "58expressapp@gmail.com",

  jurisdiccion: "Maracaibo, Estado Zulia, República Bolivariana de Venezuela",

  dominio: "mas58express.com",

  /**
   * Compromiso **interno**, no un plazo legal.
   *
   * La diferencia importa, y está verificada: el deber de dar «oportuna y
   * adecuada respuesta» del artículo 51 de la Constitución está dirigido a las
   * autoridades y a los funcionarios públicos, no a los particulares, y Venezuela
   * no tiene una ley especial de protección de datos que fije plazos a una
   * empresa privada. Llamarlo «plazo legal» sería atribuirle a la ley algo que no
   * dice; llamarlo compromiso propio es exacto y además obliga igual.
   */
  plazoRespuesta: "15 días hábiles",
} as const;

/**
 * La vigencia de los documentos legales.
 *
 * Va arriba del todo en las dos páginas porque es lo primero que comprueba quien
 * sabe leer un documento legal: de cuándo es. Al cambiar cualquiera de los dos
 * textos hay que subir la versión y la fecha — si no, decir «última
 * actualización» se convierte en decorado.
 */
export const VIGENCIA_LEGAL = {
  /* 1.1 — 15 de septiembre de 2026. Ronda FACTUAL, previa a la revisión
     jurídica: no se tocó ninguna base legal, ni un derecho, ni el responsable,
     ni el plazo de respuesta. Sólo se corrigieron tres cosas que el documento
     contaba de forma distinta a como funciona el sitio:

       · Gmail figuraba como algo que ocurría «sólo si tú decides escribirnos».
         En realidad es el buzón del equipo, y el formulario de comercios le
         manda un aviso con los datos del formulario en cuanto se active.
       · La medición decía enviar «la dirección de la página» sin más. Ahora esa
         dirección se recorta —fuera la consulta y el fragmento— y la lista de
         campos incluye el referente, que antes no se mencionaba y sí viaja.
       · Los tres plazos de conservación prometían cosas que el código no hace:
         «12 meses desde el último contacto» cuando se cuenta desde el alta,
         «como máximo 24 horas» cuando el barrido es diario, y un borrado de las
         inscripciones confirmadas que no existe. */
  fecha: "15 de septiembre de 2026",
  version: "1.1",
} as const;

/**
 * Los términos de uso llevan su propia vigencia desde la versión 1.1.
 *
 * POR QUÉ SEPARADA
 *
 * Los dos documentos compartían fecha y versión, y eso funciona sólo mientras
 * cambian a la vez. El 14 de septiembre de 2026 se incorporaron las observaciones
 * jurídicas de Fernando Atencio **sobre los términos**, y la política de
 * privacidad no se tocó. Con una vigencia compartida había que elegir entre dos
 * mentiras: dejar los términos diciendo que son del día 13 —cuando su texto ya no
 * lo es— o mover la fecha de la política sin que hubiera cambiado una coma.
 *
 * Cada documento declara la suya y ninguno miente.
 */
export const VIGENCIA_TERMINOS = {
  fecha: "14 de septiembre de 2026",
  version: "1.1",
} as const;
