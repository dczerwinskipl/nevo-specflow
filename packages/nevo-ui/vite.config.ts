import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
