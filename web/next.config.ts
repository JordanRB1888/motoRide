import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El repositorio raíz tiene su propio lockfile (la app Vite). Sin esto, Next
  // infiere ese directorio como workspace y avisa en cada build.
  turbopack: { root: __dirname },
  /* Las capturas de la app son interfaz: su texto fino se deshace con la
     calidad 75 por defecto. Con 92 el optimizador sigue recortando la mayor
     parte del peso y conserva la nitidez. */
  images: { qualities: [75, 92] },
};

export default nextConfig;
