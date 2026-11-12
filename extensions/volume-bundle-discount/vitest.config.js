// WASM fixture tests: build the function with the Shopify CLI (Javy), then execute
// each fixture in Shopify's `function-runner` — the same path `shopify app function run` uses.
export default {
  test: {
    include: ['tests/**/*.test.js'],
    forceRerunTriggers: ['**/tests/fixtures/**', '**/src/**'],
    testTimeout: 30000,
  },
};
