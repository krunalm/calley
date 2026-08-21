import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Scoped to the modules the unit suite actually owns: pure logic (lib,
      // stores) and the components it renders. The rest of the UI — calendar
      // grids, drawers, routes — is covered by the Playwright suite instead, so
      // pulling it in here would measure the wrong thing and produce a
      // meaningless global figure. AUDIT_REPORT.md tracks the component-test
      // gap separately.
      include: [
        'src/lib/**',
        'src/stores/**',
        'src/components/EmptyState.tsx',
        'src/components/ErrorBoundary.tsx',
        'src/components/FullPageLoader.tsx',
        'src/components/OfflineBanner.tsx',
        'src/components/auth/**',
      ],
      exclude: ['src/**/__tests__/**'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@calley/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
