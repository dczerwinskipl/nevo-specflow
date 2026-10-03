// Third-party attribution for code actually embedded in the shipped bundle.
// The package list comes from esbuild's metafile, so adding a bundled runtime
// dependency cannot silently omit its license metadata.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BundledThirdPartyPackage } from './bundle.js';

interface ResolvedNoticePackage {
  readonly name: string;
  readonly version: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly author?: string;
  readonly root: string;
}

export function buildThirdPartyNotices(packages: readonly BundledThirdPartyPackage[]): string {
  const resolved = deduplicate(packages.map(resolvePackage));
  const blocks = resolved.map((pkg) => {
    const licenseText = readLicense(pkg.root);
    if (!licenseText && !pkg.license) {
      throw new Error(
        `bundled package ${pkg.name}@${pkg.version} provides neither a LICENSE file nor package.json license metadata`,
      );
    }

    const source = pkg.homepage ?? pkg.repository ?? `https://www.npmjs.com/package/${pkg.name}`;
    const attribution = [
      '='.repeat(72),
      `${pkg.name} ${pkg.version}${pkg.license ? ` (${pkg.license})` : ''}`,
      source,
      ...(pkg.author ? [`Author: ${pkg.author}`] : []),
      '='.repeat(72),
      '',
    ];

    if (licenseText) {
      attribution.push(licenseText);
    } else {
      attribution.push(
        'The installed upstream package does not include a license text file.',
        `Its package.json declares the license as: ${pkg.license}`,
        'See the source URL above for the upstream project and license information.',
      );
    }

    return attribution.join('\n');
  });

  return [
    'THIRD-PARTY NOTICES',
    '',
    '`@nevo/specflow` is distributed as a single bundled file (`dist/bin.js`). That',
    'bundle embeds the third-party software listed below. When an installed upstream',
    'package contains a license text, it is reproduced verbatim. When upstream ships',
    'only package.json license metadata, that declaration and its source are preserved.',
    '',
    ...blocks,
    '',
  ].join('\n');
}

function resolvePackage(pkg: BundledThirdPartyPackage): ResolvedNoticePackage {
  const manifest = JSON.parse(readFileSync(join(pkg.root, 'package.json'), 'utf8')) as {
    name?: string;
    version?: string;
    license?: string;
    homepage?: string;
    repository?: string | { url?: string };
    author?: string | { name?: string; email?: string };
  };
  if (!manifest.version) throw new Error(`package version missing in ${pkg.root}`);

  return {
    name: manifest.name ?? pkg.name,
    version: manifest.version,
    ...(manifest.license ? { license: manifest.license } : {}),
    ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
    ...(repositoryUrl(manifest.repository)
      ? { repository: repositoryUrl(manifest.repository) }
      : {}),
    ...(authorText(manifest.author) ? { author: authorText(manifest.author) } : {}),
    root: pkg.root,
  };
}

function repositoryUrl(repository: string | { url?: string } | undefined): string | undefined {
  if (typeof repository === 'string') return repository;
  return repository?.url;
}

function authorText(
  author: string | { name?: string; email?: string } | undefined,
): string | undefined {
  if (typeof author === 'string') return author;
  if (!author?.name) return undefined;
  return author.email ? `${author.name} <${author.email}>` : author.name;
}

function deduplicate(packages: readonly ResolvedNoticePackage[]): readonly ResolvedNoticePackage[] {
  const result = new Map<string, ResolvedNoticePackage>();
  for (const pkg of packages) result.set(`${pkg.name}@${pkg.version}`, pkg);
  return [...result.values()].sort((a, b) => {
    const name = a.name.localeCompare(b.name);
    return name === 0 ? a.version.localeCompare(b.version) : name;
  });
}

function readLicense(pkgDir: string): string | undefined {
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'COPYING']) {
    const path = join(pkgDir, file);
    if (existsSync(path)) return readFileSync(path, 'utf8').trimEnd();
  }
  return undefined;
}
