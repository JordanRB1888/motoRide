import type { MetadataRoute } from "next";

const SITE = "https://mas58express.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Nada bloqueado: /privacidad y /terminos se desindexan con su propia
      // etiqueta `noindex`, y un Disallow impedía descargarlas —el rastreador
      // nunca llegaba a leer la etiqueta y la URL podía seguir apareciendo.
      { userAgent: "*", allow: "/" },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
