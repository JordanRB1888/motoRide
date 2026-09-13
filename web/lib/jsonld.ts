import { EMAIL, REDES_ACTIVAS, REDES_SOCIALES, WHATSAPP } from "./contact";
import { EMPRESA } from "./legal";

/**
 * Los datos estructurados de la organización.
 *
 * PARA QUÉ SIRVE ESTO
 *
 * Un buscador que lee `+58Express` en una página no sabe si es una empresa, un
 * producto o una palabra suelta, ni que las cuentas de TikTok, Instagram y
 * Facebook son de la misma gente. `sameAs` es literalmente la frase «estos
 * perfiles y este sitio somos los mismos», y es lo que permite que al buscar la
 * marca aparezcan agrupados en vez de compitiendo entre sí.
 *
 * DE DÓNDE SALE CADA DATO — NINGUNO ESTÁ INVENTADO
 *
 * La identidad legal viene de `lib/legal.ts`, confirmada contra el documento
 * oficial. Las redes, de `lib/contact.ts`, el mismo sitio del que las lee el pie:
 * duplicar aquí las direcciones sería crear una segunda copia que se quedaría
 * vieja sin que nadie lo notara, porque nadie mira el JSON-LD.
 *
 * LO QUE NO SE DECLARA, A PROPÓSITO
 *
 * Ni valoraciones, ni reseñas, ni número de usuarios, ni precios, ni datos de la
 * aplicación móvil. Nada de eso existe todavía, y declarar en datos
 * estructurados algo que no se puede sostener es la forma más rápida de que un
 * buscador deje de fiarse del resto.
 */

type Nodo = Record<string, unknown>;

function organizacion(): Nodo {
  const sitio = `https://${EMPRESA.dominio}`;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    /* Un identificador estable para que, apareciendo en todas las páginas, los
       buscadores entiendan que es la MISMA organización y no una por página. */
    "@id": `${sitio}/#organizacion`,
    name: "+58Express",
    legalName: EMPRESA.razonSocial,
    url: sitio,
    logo: `${sitio}/brand/app-icon.png`,
    image: `${sitio}/brand/og.jpg`,
    description:
      "Movilidad y servicios bajo demanda en Venezuela: viajes en moto, envíos y entregas en Maracaibo y el Municipio Mara, estado Zulia.",
    /* El Registro de Información Fiscal, tal y como consta en el documento
       oficial: sin separadores. Es el ancla de identidad más fuerte que tiene
       una empresa venezolana. */
    taxID: EMPRESA.rif,
    email: EMAIL.direccion,
    /* El mismo número que ya publica el sitio. No es un teléfono adicional. */
    telephone: `+${WHATSAPP.e164}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Carretera Vía El Moján, Casa Nro. S/N, Sector Puerto Caballo",
      addressLocality: "Maracaibo",
      addressRegion: "Zulia",
      postalCode: "4001",
      addressCountry: "VE",
    },
    /* Lo que el propio sitio dice que cubre. Ni una ciudad más. */
    areaServed: [
      { "@type": "City", name: "Maracaibo" },
      { "@type": "AdministrativeArea", name: "Municipio Mara" },
    ],
    sameAs: REDES_ACTIVAS.map((red) => REDES_SOCIALES[red].url),
  };
}

/**
 * El JSON listo para incrustar.
 *
 * Cada `<` se sustituye por su forma escapada `<`, aunque todos los valores
 * sean nuestros. Es la precaución estándar: sin ella, el día que un dato
 * contuviera la secuencia de cierre de una etiqueta `script`, el navegador la
 * cerraría antes de tiempo y el resto del JSON se interpretaría como HTML.
 * Cuesta una línea y elimina la categoría entera de problema.
 */
export function organizacionJsonLd(): string {
  return JSON.stringify(organizacion()).replace(/</g, "\\u003c");
}
