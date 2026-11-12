import { defineConfig } from 'vitest/config';

// Fast, offline unit tests across the monorepo. The Discount Function's WASM
// fixture suite runs separately (`npm run test:function`) because it builds
// with the Shopify CLI, and the storefront's Playwright smoke test runs via
// `npm run test:e2e`.
export default defineConfig({
  test: {
    include: [
      'extensions/*/tests/unit/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'infra/test/**/*.test.ts',
      'app/**/*.test.ts',
      'storefront/app/**/*.test.ts',
    ],
    environment: 'node',
  },
});
