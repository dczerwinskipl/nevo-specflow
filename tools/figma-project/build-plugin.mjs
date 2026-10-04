import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { buildImporterUi } from '../figma-import/build-ui.mjs';

const root = new URL('./', import.meta.url);
const pluginDist = new URL('dist/plugin/', root);

await rm(pluginDist, { force: true, recursive: true });
await mkdir(pluginDist, { recursive: true });
await Promise.all([
  build({
    entryPoints: [fileURLToPath(new URL('src/importer.ts', root))],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    outfile: fileURLToPath(new URL('code.js', pluginDist)),
    legalComments: 'none',
  }),
  buildImporterUi({ output: new URL('ui.html', pluginDist) }),
]);
