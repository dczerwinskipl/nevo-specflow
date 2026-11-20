import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runtime integration tests create Git repositories and start workers and HTTP servers.
    testTimeout: 20_000,
  },
});
