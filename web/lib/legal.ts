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

  /* Se escribe exactamente como lo facilitó el dueño. La forma habitual de
     presentar un RIF venezolano lleva guiones —J-50872360-0—, pero separar un
     identificador oficial es una suposición sobre dónde van los grupos, y
     equivocarse ahí en un documento legal es peor que no separarlo. */
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
  fecha: "13 de septiembre de 2026",
  version: "1.0",
} as const;
