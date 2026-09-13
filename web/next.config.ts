import type { NextConfig } from "next";
// Los mismos interruptores que usan los componentes: la CSP se abre a Turnstile
// SÓLO si algún formulario puede llegar a pintarse. Mientras estén apagados, la
// política no concede un permiso que nadie va a usar.
import { PARTNER_LEADS_ENABLED, WAITLIST_ENABLED } from "./lib/flags";

const nextConfig: NextConfig = {
  // El repositorio raíz tiene su propio lockfile (la app Vite). Sin esto, Next
  // infiere ese directorio como workspace y avisa en cada build.
  turbopack: { root: __dirname },
  /* Las capturas de la app son interfaz: su texto fino se deshace con la
     calidad 75 por defecto. Con 92 el optimizador sigue recortando la mayor
     parte del peso y conserva la nitidez. */
  images: { qualities: [75, 92] },

  /* `pg` se carga tal cual, sin pasar por el empaquetador. Trae un módulo nativo
     opcional (`pg-native`) que el empaquetador intenta resolver y no encuentra;
     además, una librería de conexiones no gana nada con ser empaquetada. Sólo
     afecta al servidor: ninguna página la importa. */
  serverExternalPackages: ["pg"],

  /* `www` y el dominio apex servían los dos el sitio completo con 200. Los dos
     declaran el mismo canonical, así que Google consolida igual, pero dos
     orígenes vivos para el mismo contenido es una duplicidad innecesaria.
     La regla mira la cabecera Host, de modo que solo se dispara para
     www.mas58express.com: ni el apex, ni las URL de vista previa de Vercel, ni
     ningún otro subdominio (api-staging, admin-staging, el correo) la ven. */
  /* ------------------------------------------------------------------
     Cabeceras de seguridad.

     Antes sólo llegaba HSTS —lo que pone Vercel de serie—: ni CSP, ni nosniff,
     ni Referrer-Policy, ni control de encuadre. La política de abajo es la más
     estricta que este sitio admite sin romperse, y cada permiso que concede está
     justificado por algo que el sitio hace de verdad.
     ------------------------------------------------------------------ */
  async headers() {
    /* En desarrollo, React necesita `eval()` para reconstruir las pilas de
       llamadas y el recargado en caliente abre un WebSocket: sin estas dos
       excepciones, `npm run dev` deja de funcionar. Jamás se aplican al build
       de producción. */
    const dev = process.env.NODE_ENV !== "production";
    /* Turnstile necesita tres permisos: cargar su script, abrir su marco y
       hablar con Cloudflare para resolver el desafío. Se conceden juntos y sólo
       cuando hacen falta. Dominio exacto, nunca un comodín. */
    const TURNSTILE = "https://challenges.cloudflare.com";
    const conFormularios = WAITLIST_ENABLED || PARTNER_LEADS_ENABLED;
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      // Nadie necesita encuadrar este sitio. Sustituye a X-Frame-Options, que
      // sería redundante: frame-ancestors lo entienden todos los navegadores
      // que reciben esta web.
      "frame-ancestors 'none'",
      "object-src 'none'",
      // Las teselas del mapa son <img> servidas por OpenStreetMap: sin este
      // permiso la sección de cobertura se queda en gris.
      "img-src 'self' data: https://tile.openstreetmap.org",
      // Las tipografías son locales.
      "font-src 'self'",
      // React escribe estilos en línea (el teléfono 3D, el parallax del hero) y
      // GSAP los modifica en cada fotograma: sin 'unsafe-inline' no hay escena.
      "style-src 'self' 'unsafe-inline'",
      // Next inyecta los datos de hidratación en un <script> en línea. Evitarlo
      // exige un «nonce» por petición, y eso obligaría a renderizar cada página
      // en el servidor: el sitio dejaría de ser estático a cambio de muy poco,
      // porque no acepta entradas de usuario ni ejecuta código de terceros.
      `script-src 'self' 'unsafe-inline'${conFormularios ? ` ${TURNSTILE}` : ""}${dev ? " 'unsafe-eval'" : ""}`,
      `connect-src 'self'${conFormularios ? ` ${TURNSTILE}` : ""}${dev ? " ws: http://127.0.0.1:* http://localhost:*" : ""}`,
      `frame-src ${conFormularios ? TURNSTILE : "'none'"}`,
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:ruta*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // El sitio público no usa ninguna de estas capacidades.
            value:
              "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Dos años, el valor que ya servía Vercel. `includeSubDomains` y
          // `preload` NO se añaden aquí: obligarían a HTTPS a todos los
          // subdominios durante dos años y son casi irreversibles en los
          // navegadores que ya lo hayan visto. Es una decisión de dominio, no
          // de este proyecto.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/:ruta*",
        has: [{ type: "host", value: "www.mas58express.com" }],
        destination: "https://mas58express.com/:ruta*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
