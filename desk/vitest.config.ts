import { defineConfig } from 'vitest/config';

// The tests of the Desk run with no network. test/setup/no-network.ts, which runs before every test file, makes fetch and the connections of node throw.
// A test that runs git starts a dozen programs, and the whole suite runs sixty files at once, so a test gets thirty seconds instead of five, and the set-up that
// runs before the tests of a file a minute instead of ten seconds (the adversarial matrix runs every scenario in one): they are limits on a test that hangs, not on one
// that is slow.
export default defineConfig({
  test: {
    setupFiles: ['./test/setup/no-network.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
