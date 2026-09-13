import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El repositorio raíz tiene su propio lockfile (la app Vite). Sin esto, Next
  // infiere ese directorio como workspace y avisa en cada build.
  turbopack: { root: __dirname },
  /* Las capturas de la app son interfaz: su texto fino se deshace con la
     calidad 75 por defecto. Con 92 el optimizador sigue recortando la mayor
     parte del peso y conserva la nitidez. */
  images: { qualities: [75, 92] },

  /* `www` y el dominio apex servían los dos el sitio completo con 200. Los dos
     declaran el mismo canonical, así que Google consolida igual, pero dos
     orígenes vivos para el mismo contenido es una duplicidad innecesaria.
     La regla mira la cabecera Host, de modo que solo se dispara para
     www.mas58express.com: ni el apex, ni las URL de vista previa de Vercel, ni
     ningún otro subdominio (api-staging, admin-staging, el correo) la ven. */
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
