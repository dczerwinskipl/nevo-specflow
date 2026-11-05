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

const styles = await readFile(resolve(packageDirectory, 'dist/styles.css'), 'utf8');
if (!styles.startsWith("@import './fonts/inter.css';")) {
  throw new Error('dist/styles.css must import the shipped Inter @font-face rules first.');
}

if (/data:font\//.test(styles)) {
  throw new Error('Fonts must ship as files, not base64 data inside dist/styles.css.');
}

const fontCss = await readFile(resolve(packageDirectory, 'dist/fonts/inter.css'), 'utf8');
for (const [, file] of fontCss.matchAll(/url\('\.\/([^']+)'\)/g)) {
  await access(resolve(packageDirectory, 'dist/fonts', file));
}

if (!/font-display:\s*swap/.test(fontCss)) {
  throw new Error('Shipped Inter @font-face rules must use font-display: swap.');
}

if (manifest.dependencies?.react || manifest.dependencies?.['react-dom']) {
  throw new Error('React runtimes must remain peer dependencies of @nevo/ui.');
}

console.log(`Verified ${targets.length} packaged @nevo/ui export targets.`);
