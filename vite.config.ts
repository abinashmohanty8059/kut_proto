import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/* Three standalone pages, each with its own entry module. Everything under
   public/ (the brand fonts, the films and the logos) is served from the root,
   which is how the markup refers to them. */
export default defineConfig({
  appType: 'mpa',
  build: {
    outDir: 'build',
    assetsDir: 'bundle',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        inbound: resolve(import.meta.dirname, 'inbound.html'),
        variants: resolve(import.meta.dirname, 'variants.html'),
      },
    },
  },
});
