import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(packageDirectory, 'package.json'), 'utf8'));
const targets = Object.values(manifest.exports).flatMap((entry) =>
  typeof entry === 'string' ? [entry] : Object.values(entry),
);

for (const target of targets) {
  if (!target.startsWith('./dist/')) {
    throw new Error(`Package export must target dist: ${target}`);
  }
  await access(resolve(packageDirectory, target));
}

if (manifest.dependencies?.react || manifest.dependencies?.['react-dom']) {
  throw new Error('React runtimes must remain peer dependencies of @nevo/ui.');
}

console.log(`Verified ${targets.length} packaged @nevo/ui export targets.`);
