// The one canonical bundler for the product. esbuild compiles the `nevo-specflow`
// entry, internal workspace packages, and runtime third-party dependencies into a
// single self-contained ESM file.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { copyWindowsBindings } from './windows-bindings.ts';

export interface BundleInput {
  /** absolute or cwd-relative entry (`src/bin.ts`). */
  readonly entry: string;
  /** absolute or cwd-relative output (`dist/bin.js`). */
  readonly outfile: string;
  /** value baked in for `NEVO_SPECFLOW_VERSION_INJECTED`. */
  readonly version: string;
  readonly cwd?: string;
  /** built SpecFlow UI directory; defaults to the workspace package dist output. */
  readonly uiSourceDir?: string;
  /** shipped default definitions (seed files); defaults to the Engine package `definitions` folder. */
  readonly definitionsSourceDir?: string;
}

export interface BundledThirdPartyPackage {
  readonly name: string;
  readonly root: string;
}

export interface BundleResult {
  readonly outfile: string;
  readonly thirdPartyPackages: readonly BundledThirdPartyPackage[];
}

export async function bundleProduct(input: BundleInput): Promise<BundleResult> {
  const cwd = input.cwd ?? process.cwd();
  const outfile = resolve(cwd, input.outfile);
  mkdirSync(dirname(outfile), { recursive: true });

  const result = await build({
    absWorkingDir: cwd,
    entryPoints: [resolve(cwd, input.entry)],
    outfile,
    bundle: true,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'bundle',
    define: { NEVO_SPECFLOW_VERSION_INJECTED: JSON.stringify(input.version) },
    banner: {
      js: [
        '#!/usr/bin/env node',
        "import { createRequire as __nevoCreateRequire } from 'node:module';",
        'const require = __nevoCreateRequire(import.meta.url);',
      ].join('\n'),
    },
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'silent',
  });

  // A Worker must be an installed artifact beside bin.js; workspace source paths are never used.
  await build({
    absWorkingDir: cwd,
    entryPoints: [
      fileURLToPath(new URL('../../specflow-runtime/src/session-worker.ts', import.meta.url)),
    ],
    outfile: join(dirname(outfile), 'session-worker.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'bundle',
    logLevel: 'silent',
  });

  copyProductUiAssets(
    input.uiSourceDir ?? resolve(cwd, '..', 'specflow-ui', 'dist'),
    dirname(outfile),
  );

  copyProductDefinitionSeeds(
    input.definitionsSourceDir ?? resolve(cwd, '..', 'specflow-engine', 'definitions'),
    dirname(outfile),
  );

  return {
    outfile,
    thirdPartyPackages: [
      ...discoverThirdPartyPackages(Object.keys(result.metafile.inputs), cwd),
      ...copyWindowsBindings(dirname(outfile)),
    ],
  };
}

function discoverThirdPartyPackages(
  inputs: readonly string[],
  cwd: string,
): readonly BundledThirdPartyPackage[] {
  const packages = new Map<string, BundledThirdPartyPackage>();
  const marker = `${sep}node_modules${sep}`;

  for (const input of inputs) {
    const absolute = isAbsolute(input) ? input : resolve(cwd, input);
    const markerIndex = absolute.lastIndexOf(marker);
    if (markerIndex < 0) continue;

    const packageRelative = absolute.slice(markerIndex + marker.length);
    const segments = packageRelative.split(sep);
    const first = segments[0];
    if (!first) continue;

    const name = first.startsWith('@') ? `${first}/${segments[1] ?? ''}` : first;
    if (!name || name.endsWith('/') || name.startsWith('@nevo/')) continue;

    const rootSegments = name.split('/');
    const root = join(absolute.slice(0, markerIndex + marker.length), ...rootSegments);
    packages.set(root, { name, root });
  }

  return [...packages.values()].sort((a, b) =>
    a.name === b.name ? a.root.localeCompare(b.root) : a.name.localeCompare(b.name),
  );
}

function copyProductUiAssets(source: string, outputDir: string): void {
  const index = join(source, 'index.html');
  if (!existsSync(index)) {
    throw new Error(
      `SpecFlow UI build output is missing at ${source}. Build @nevo/specflow-ui before bundling the product.`,
    );
  }

  const destination = join(outputDir, 'ui');
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

/**
 * The default definitions are data files next to the bundle (`definitions/` beside `bin.js`), found
 * at run time relative to the bundle; they are never compiled into it.
 */
function copyProductDefinitionSeeds(source: string, outputDir: string): void {
  if (!existsSync(join(source, 'document-type'))) {
    throw new Error(
      `The default definitions are missing at ${source}. They ship in the Engine package and are needed before bundling the product.`,
    );
  }

  const destination = join(outputDir, 'definitions');
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}
