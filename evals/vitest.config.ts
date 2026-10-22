import { defineConfig } from 'vitest/config';

// The tests of the evals run the whole gate over every seeded case, and the proof that it can fail runs it once more with each check switched off, so a test takes seconds when the
// machine is quiet and the default of five seconds is too little for a slow runner that has other work to do. The limit is for a test that hangs, not for one that is slow.
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
