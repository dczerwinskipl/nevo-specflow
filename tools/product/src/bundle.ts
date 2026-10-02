// The one canonical bundler for the product. esbuild compiles the `nevo-specflow`
// entry, internal workspace packages, and runtime third-party dependencies into a
// single self-contained ESM file.

import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import { build } from 'esbuild';

export interface BundleInput {
  /** absolute or cwd-relative entry (`src/bin.ts`). */
  readonly entry: string;
  /** absolute or cwd-relative output (`dist/bin.js`). */
  readonly outfile: string;
  /** value baked in for `NEVO_SPECFLOW_VERSION_INJECTED`. */
  readonly version: string;
  readonly cwd?: string;
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

  return {
    outfile,
    thirdPartyPackages: discoverThirdPartyPackages(Object.keys(result.metafile.inputs), cwd),
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
