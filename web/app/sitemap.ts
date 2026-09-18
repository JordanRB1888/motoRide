import type { MetadataRoute } from "next";

const SITE = "https://mas58express.com";

/**
 * Las páginas legales entran aquí desde el 13 de septiembre de 2026: ya
 * contienen documentos reales, con la identidad de la empresa y el tratamiento
 * de datos que la web hace de verdad, así que dejaron de estar en `noindex`.
 *
 * Van con prioridad baja —no son la puerta de entrada de nadie— pero deben ser
 * indexables y encontrables: una política de privacidad que los buscadores no
 * pueden ver es una política a la que cuesta llegar justo cuando se necesita.
 *
 * `/gracias` y `/baja` siguen fuera, y con su `noindex`: son destinos de un
 * enlace de correo, no contenido que nadie deba encontrar buscando.
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
  { path: "/contacto", priority: 0.8 },
  { path: "/privacidad", priority: 0.3 },
  { path: "/terminos", priority: 0.3 },
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
