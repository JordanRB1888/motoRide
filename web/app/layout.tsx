import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* Tipografías oficiales de campaña, servidas desde el propio dominio:
   Big Shoulders para titulares condensados, Outfit para texto. */
const displayBrand = localFont({
  src: [{ path: "./fonts/BigShoulders-Bold.ttf", weight: "700", style: "normal" }],
  variable: "--font-display-brand",
  display: "swap",
  preload: true,
});

const bodyBrand = localFont({
  src: [
    { path: "./fonts/Outfit-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Outfit-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-body-brand",
  display: "swap",
  preload: true,
});

const SITE = "https://mas58express.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "+58Express — Muévete. Pide. Recibe.",
    template: "%s · +58Express",
  },
  description:
    "Movilidad y servicios bajo demanda en Venezuela. Pide tu moto, sigue tu viaje en tiempo real y conoce el precio antes de confirmar.",
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
    title: "+58Express — Muévete. Pide. Recibe.",
    description:
      "Movilidad y servicios bajo demanda en Venezuela. Tu ciudad, más cerca.",
  },
  twitter: {
    card: "summary_large_image",
    title: "+58Express — Muévete. Pide. Recibe.",
    description:
      "Movilidad y servicios bajo demanda en Venezuela. Tu ciudad, más cerca.",
  },
  icons: {
    icon: [
      { url: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/app-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  robots: { index: true, follow: true },
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
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-signal focus:px-5 focus:py-3 focus:font-bold focus:text-ink-900"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
