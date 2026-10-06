import { defineConfig } from 'vitest/config';

// The tests of the Desk run with no network. test/setup/no-network.ts, which runs before every test file, makes fetch and the connections of node throw.
export default defineConfig({
  test: {
    setupFiles: ['./test/setup/no-network.ts'],
  },
});
