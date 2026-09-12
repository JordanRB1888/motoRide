import type { MetadataRoute } from "next";

const SITE = "https://mas58express.com";

/**
 * Las páginas legales quedan fuera a propósito: todavía no contienen un
 * documento válido y están marcadas como `noindex`.
 */
const RUTAS = [
  { path: "", priority: 1 },
  { path: "/servicios", priority: 0.9 },
  { path: "/pasajeros", priority: 0.9 },
  { path: "/conductores", priority: 0.9 },
  { path: "/seguridad", priority: 0.8 },
  { path: "/aliados", priority: 0.8 },
  { path: "/nosotros", priority: 0.6 },
  { path: "/ayuda", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return RUTAS.map(({ path, priority }) => ({
    url: `${SITE}${path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
