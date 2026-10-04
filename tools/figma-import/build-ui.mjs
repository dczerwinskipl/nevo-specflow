import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('./', import.meta.url);

export async function buildImporterUi({
  output = new URL('dist/ui.html', root),
  clean = false,
} = {}) {
  const [template, styles, script] = await Promise.all([
    readFile(new URL('ui/template.html', root), 'utf8'),
    readFile(new URL('ui/styles.css', root), 'utf8'),
    build({
      entryPoints: [fileURLToPath(new URL('ui/src/app.ts', root))],
      bundle: true,
      format: 'iife',
      target: 'es2020',
      write: false,
      legalComments: 'none',
    }).then((result) => result.outputFiles[0].text),
  ]);

  const html = template
    .replace('/*__FIGMA_UI_STYLES__*/', styles.replaceAll('</style', '<\\/style'))
    .replace('/*__FIGMA_UI_SCRIPT__*/', script.replaceAll('</script', '<\\/script'));

  const outputDirectory = new URL('.', output);
  if (clean) await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    output,
    `<!-- Generated from tools/figma-import/ui by build-ui.mjs. Do not edit this artifact. -->\n${html}`,
  );
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) await buildImporterUi({ clean: true });
