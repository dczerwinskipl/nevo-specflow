import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    storybookTest({
      configDir: path.join(dirname, '.storybook'),
      tags: {
        include: ['play-fn', 'visual', 'contract', 'integration'],
        exclude: ['capture'],
      },
    }),
  ],
  test: {
    name: 'storybook',
    // Story files run one after another. In parallel, timing-sensitive interaction and geometry
    // contracts failed at random under load (a different story each run), while the serial run is
    // stable and takes about as long: the single browser is the bottleneck either way.
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
