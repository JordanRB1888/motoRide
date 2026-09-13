import type { MetadataRoute } from "next";

const SITE = "https://mas58express.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Nada bloqueado. `/privacidad` y `/terminos` ya son documentos reales y
      // se indexan; `/gracias` y `/baja` se desindexan con su propia etiqueta
      // `noindex`, que es lo correcto: un `Disallow` impediría descargarlas, el
      // rastreador nunca llegaría a leer la etiqueta y la URL podría seguir
      // apareciendo en los resultados sin descripción.
      { userAgent: "*", allow: "/" },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
