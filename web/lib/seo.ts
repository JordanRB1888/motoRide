import type { Metadata } from "next";

/**
 * Metadatos de una página interna.
 *
 * Sin esto, las diez rutas compartían el mismo bloque Open Graph: al compartir
 * /conductores, WhatsApp o X mostraban el título de la portada y una `og:url`
 * que apuntaba a la raíz, en contradicción con el propio canonical de la página.
 * Aquí cada página declara el suyo. Las rutas relativas las resuelve Next con
 * `metadataBase`.
 */
export function metaPagina({
  titulo,
  descripcion,
  ruta,
  indexar = true,
}: {
  titulo: string;
  descripcion: string;
  ruta: string;
  indexar?: boolean;
}): Metadata {
  const completo = `${titulo} · +58Express`;
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: ruta },
    openGraph: {
      type: "website",
      locale: "es_VE",
      siteName: "+58Express",
      title: completo,
      description: descripcion,
      url: ruta,
      images: [{ url: "/brand/og.jpg", width: 1200, height: 630, alt: "+58Express" }],
    },
    twitter: {
      card: "summary_large_image",
      title: completo,
      description: descripcion,
      images: ["/brand/og.jpg"],
    },
    ...(indexar ? {} : { robots: { index: false, follow: false } }),
  };
}
