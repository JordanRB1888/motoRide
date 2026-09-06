import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist',
    minify: 'esbuild'
  }
});
