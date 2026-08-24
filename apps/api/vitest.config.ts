import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // The layers the unit suite owns: business logic, HTTP handling and
      // background jobs. Process bootstrap (index.ts), driver construction
      // (db, redis, lucia, oauth, logger) and the schema/seed/email templates
      // are configuration rather than behaviour — they are exercised end to end
      // by the Playwright suite, and counting them here would report a number
      // that says nothing about how well the logic is tested.
      include: [
        'src/services/**',
        'src/routes/**',
        'src/middleware/**',
        'src/jobs/**',
        'src/lib/**',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/lib/email.ts',
        'src/lib/env.ts',
        'src/lib/logger.ts',
        'src/lib/lucia.ts',
        'src/lib/oauth.ts',
        'src/lib/redis.ts',
        'src/jobs/index.ts',
      ],
      // Set just under the current numbers: the point is to catch a drop, not
      // to pin an exact figure that every unrelated change has to chase.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 68,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@calley/shared': new URL('../../packages/shared/src', import.meta.url).pathname,
    },
  },
});
