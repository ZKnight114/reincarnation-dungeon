import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 5173, strictPort: true },
  build: { assetsInlineLimit: 0 },
});
