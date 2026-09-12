import type { MetadataRoute } from "next";

const SITE = "https://mas58express.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Sin documento legal redactado, estas páginas no deben indexarse.
        disallow: ["/privacidad", "/terminos"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
