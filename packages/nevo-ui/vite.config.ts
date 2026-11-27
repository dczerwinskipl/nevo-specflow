import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The package's own public entries (`@nevo/ui/figma/define`, ...) resolve to its source, as in
    // `tsconfig.json`: a test must not depend on the package's own `dist` being built and current.
    alias: [
      { find: /^@nevo\/ui$/u, replacement: resolve(import.meta.dirname, 'src/index.ts') },
      { find: /^@nevo\/ui\/(.+)$/u, replacement: resolve(import.meta.dirname, 'src/$1') },
    ],
  },
  build: {
    cssCodeSplit: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        'figma/index': resolve(import.meta.dirname, 'src/figma/index.ts'),
        'figma/define': resolve(import.meta.dirname, 'src/figma/define.ts'),
        'figma/resources': resolve(import.meta.dirname, 'src/figma/resources.ts'),
        'design-system/color': resolve(import.meta.dirname, 'src/design-system/color.ts'),
        'design-system/resources': resolve(import.meta.dirname, 'src/design-system/resources.ts'),
        'design-system/theme': resolve(import.meta.dirname, 'src/design-system/theme.ts'),
        styles: resolve(import.meta.dirname, 'src/design-system.css'),
      },
      formats: ['es'],
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: [
        /^@internationalized\//,
        /^@nevo\//,
        /^@radix-ui\//,
        /^@tanstack\//,
        /^clsx(?:\/.*)?$/,
        /^lucide-react(?:\/.*)?$/,
        /^mermaid(?:\/.*)?$/,
        /^react(?:\/.*)?$/,
        /^react-aria-components(?:\/.*)?$/,
        /^react-dom(?:\/.*)?$/,
        /^react-markdown(?:\/.*)?$/,
        /^remark-gfm(?:\/.*)?$/,
        /^tailwind-variants(?:\/.*)?$/,
      ],
    },
  },
});
