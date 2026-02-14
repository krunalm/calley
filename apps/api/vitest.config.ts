import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/lib/**'],
    },
  },
  resolve: {
    alias: {
      '@calley/shared': new URL('../../packages/shared/src', import.meta.url).pathname,
    },
  },
});
