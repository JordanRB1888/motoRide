import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Analitica from "@/components/site/Analitica";
import { ANALYTICS_ENABLED } from "@/lib/flags";
import { organizacionJsonLd } from "@/lib/jsonld";
import "./globals.css";

/* Tipografías oficiales de campaña, servidas desde el propio dominio:
   Big Shoulders para titulares condensados, Outfit para texto.

   Los .ttf originales pesaban 205 KB (110 KB con brotli) y competían con la
   imagen LCP en el arranque. Se sirven como WOFF2 subseteado a latín —su
   compresión de contornos va mucho más allá de lo que brotli saca de un TTF
   plano—: 49 KB los tres, sin perder ni un glifo que el sitio escriba. */
const displayBrand = localFont({
  src: [{ path: "./fonts/BigShoulders-Bold.woff2", weight: "700", style: "normal" }],
  variable: "--font-display-brand",
  display: "swap",
  preload: true,
  /* La reserva automática la declara `globals.css`, no esta llamada.
     `next/font` generaba una sobre Arial con `size-adjust: 88.59%`. Ese valor
     sí iguala anchos de avance —es un cociente de anchos—, pero lo calcula
     sobre el alfabeto en MINÚSCULAS, y `.display` pinta en mayúsculas. En caja
     alta se quedaba a un 27,8% de más, los titulares se partían en dos líneas y
     la página saltaba 79 px al llegar la fuente.
     El razonamiento completo, con los números, está junto a las @font-face. */
  adjustFontFallback: false,
});

const bodyBrand = localFont({
  src: [
    { path: "./fonts/Outfit-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Outfit-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body-brand",
  display: "swap",
  preload: true,
});

const SITE = "https://mas58express.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    /* El título de la portada nombra la categoría y el sitio, no sólo la marca.
       «+58Express» todavía no lo busca nadie: lo que se busca es «mototaxi
       Maracaibo». La promesa de marca sigue viva en el H1 de la página. */
    default: "+58Express — Mototaxi, delivery y envíos en Maracaibo",
    template: "%s · +58Express",
  },
  description:
    "Movilidad y servicios bajo demanda en el Zulia: mototaxi, viajes, delivery y envíos en Maracaibo y el Municipio Mara. Próximamente — conoce cómo va a funcionar.",
  applicationName: "+58Express",
  authors: [{ name: "+58Express" }],
  keywords: [
    "mototaxi",
    "movilidad",
    "Maracaibo",
    "Zulia",
    "Venezuela",
    "delivery",
    "envíos",
    "+58Express",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_VE",
    url: SITE,
    siteName: "+58Express",
    title: "+58Express — Mototaxi, delivery y envíos en Maracaibo",
    description:
      "Movilidad y servicios bajo demanda en Maracaibo y el Municipio Mara. Próximamente en tu zona.",
    images: [
      {
        url: "/brand/og.jpg",
        width: 1200,
        height: 630,
        alt: "+58Express — Muévete. Pide. Recibe.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "+58Express — Mototaxi, delivery y envíos en Maracaibo",
    description:
      "Movilidad y servicios bajo demanda en Maracaibo y el Municipio Mara. Próximamente en tu zona.",
    images: ["/brand/og.jpg"],
  },
  icons: {
    icon: [
      { url: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/app-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  robots: { index: true, follow: true },
  /* Verificación de la propiedad en Google Search Console.
     Se declara por la API de metadatos de Next —no como HTML a mano— para que
     viva junto al resto de los metadatos y no se pierda en un retoque del
     <head>. Next la renderiza como <meta name="google-site-verification">. */
  verification: { google: "7Gnxi9z4ffm6oHBCOFvQ3BkTH4OBjk9phLxqoPOcEYw" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${displayBrand.variable} ${bodyBrand.variable}`}>
      <body>
        {/* Datos estructurados de la organización.
            Va en el layout para que esté en todas las páginas, y lleva un `@id`
            estable para que los buscadores entiendan que es la misma empresa y
            no una por página. Es JSON inerte —no ejecuta nada— y la CSP ya lo
            permite con `script-src 'unsafe-inline'`: no hubo que abrir nada. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: organizacionJsonLd() }}
        />
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-signal focus:px-5 focus:py-3 focus:font-bold focus:text-ink-900"
        >
          Saltar al contenido
        </a>
        {children}
        {/* Analítica sin cookies y sin datos personales. Se sirve desde el
            propio dominio, así que la CSP no necesita abrirse a ningún origen
            externo — que fue la razón por la que se eligió frente a las
            alternativas.

            Va envuelta en `Analitica` y no suelta: esa envoltura recorta la
            consulta y el fragmento de la dirección antes de que salga del
            navegador. El porqué, con la medición que lo motivó, está allí. */}
        {ANALYTICS_ENABLED && <Analitica />}
      </body>
    </html>
  );
}
