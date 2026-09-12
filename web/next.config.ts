import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El repositorio raíz tiene su propio lockfile (la app Vite). Sin esto, Next
  // infiere ese directorio como workspace y avisa en cada build.
  turbopack: { root: __dirname },
};

export default nextConfig;
