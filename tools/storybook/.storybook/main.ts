import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: [
    '../../../packages/nevo-ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/specflow-ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../examples/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  tags: {
    capture: { defaultFilterSelection: 'exclude' },
    contract: { defaultFilterSelection: 'exclude' },
    integration: { defaultFilterSelection: 'exclude' },
  },
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: '@storybook/react-vite',
  viteFinal: (config) =>
    mergeConfig(config, {
      optimizeDeps: { include: ['@tanstack/react-router'] },
      plugins: [tailwindcss()],
    }),
};

export default config;
