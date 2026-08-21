import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['src/**/__tests__/**', 'src/index.ts'],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 85,
        lines: 95,
      },
    },
  },
});
