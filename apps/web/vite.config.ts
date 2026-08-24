import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const analyze = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    // `semicolons` / `quoteStyle` keep the generated route tree byte-identical to
    // what Prettier (semi: true, singleQuote: true) produces, so a build never
    // leaves `routeTree.gen.ts` dirty and lint-staged never reformats it back.
    TanStackRouterVite({
      routesDirectory: './src/routes',
      semicolons: true,
      quoteStyle: 'single',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      // The bundle report is an analysis artefact, not part of the app: writing
      // it into `dist` on every build ships a browsable map of the source tree
      // to whatever serves the static output. Opt in with `ANALYZE=1 pnpm build`.
      plugins: analyze
        ? [
            visualizer({
              filename: 'dist/bundle-stats.html',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : [],
    },
  },
});
