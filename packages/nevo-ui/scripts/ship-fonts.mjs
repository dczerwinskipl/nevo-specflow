// Ships the design-system font files next to dist/styles.css.
//
// Vite library mode always inlines assets as base64, which would put ~180 KB of font data into
// styles.css and force every consumer to parse it before first paint. Instead the @font-face rules
// in src/design-system/fonts.css are copied to dist/fonts/inter.css with real woff2 files beside
// them, and dist/styles.css imports that file. Consumers' Tailwind/Vite pipelines inline the
// @import and emit the woff2 files as hashed assets, so no CDN or runtime fetch is involved.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const fontPackagePrefix = '@fontsource-variable/inter/files/';
const fontsDirectory = resolve(packageDirectory, 'dist/fonts');

const source = await readFile(resolve(packageDirectory, 'src/design-system/fonts.css'), 'utf8');
const fontFiles = [...source.matchAll(/url\('(@fontsource-variable\/inter\/files\/[^']+)'\)/g)].map(
  (match) => match[1],
);

if (fontFiles.length === 0) {
  throw new Error('src/design-system/fonts.css declares no font files to ship.');
}

await mkdir(fontsDirectory, { recursive: true });
for (const specifier of fontFiles) {
  await copyFile(require.resolve(specifier), resolve(fontsDirectory, basename(specifier)));
}

await writeFile(
  resolve(fontsDirectory, 'inter.css'),
  source.replaceAll(`url('${fontPackagePrefix}`, "url('./"),
);

const stylesPath = resolve(packageDirectory, 'dist/styles.css');
const styles = await readFile(stylesPath, 'utf8');
const fontImport = "@import './fonts/inter.css';\n";
if (!styles.includes(fontImport)) {
  await writeFile(stylesPath, fontImport + styles);
}

console.log(`Shipped ${fontFiles.length} Inter font files with @nevo/ui styles.`);
