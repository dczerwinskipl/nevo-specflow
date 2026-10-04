// Third-party attribution for code actually embedded in the shipped bundle.
// The package list comes from esbuild's metafile, so adding a bundled runtime
// dependency cannot silently omit its license metadata.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { BundledThirdPartyPackage } from './bundle.ts';

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
    '`@nevo/specflow` ships a bundled CLI/Runtime plus built browser UI assets.',
    'The distribution embeds the third-party software listed below. When an installed upstream',
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


interface DependencyManifest {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

export function discoverThirdPartyDependencyClosure(
  entryPackageDir: string,
  workspaceRoot: string,
): readonly BundledThirdPartyPackage[] {
  const workspacePackages = workspacePackageRoots(workspaceRoot);
  const discovered = new Map<string, BundledThirdPartyPackage>();
  const visited = new Set<string>();

  visit(entryPackageDir);

  return [...discovered.values()].sort((a, b) =>
    a.name === b.name ? a.root.localeCompare(b.root) : a.name.localeCompare(b.name),
  );

  function visit(packageRoot: string): void {
    if (visited.has(packageRoot)) return;
    visited.add(packageRoot);

    const manifest = readManifest<DependencyManifest>(packageRoot);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    };

    for (const dependencyName of Object.keys(dependencies)) {
      const workspacePackage = workspacePackages.get(dependencyName);
      if (workspacePackage) {
        visit(workspacePackage);
        continue;
      }

      const dependencyRoot = resolveDependencyRoot(packageRoot, dependencyName);
      if (!dependencyRoot) continue;

      const dependencyManifest = readManifest<DependencyManifest>(dependencyRoot);
      const canonicalName = dependencyManifest.name ?? dependencyName;
      if (canonicalName.startsWith('@nevo/')) {
        visit(dependencyRoot);
        continue;
      }

      discovered.set(dependencyRoot, { name: canonicalName, root: dependencyRoot });
      visit(dependencyRoot);
    }
  }
}

function workspacePackageRoots(workspaceRoot: string): ReadonlyMap<string, string> {
  const packagesDir = join(workspaceRoot, 'packages');
  const result = new Map<string, string>();

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = join(packagesDir, entry.name);
    const manifestPath = join(packageRoot, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string };
    if (manifest.name) result.set(manifest.name, packageRoot);
  }

  return result;
}

function resolveDependencyRoot(fromPackageRoot: string, dependencyName: string): string | undefined {
  const require = createRequire(join(fromPackageRoot, 'package.json'));

  for (const request of [`${dependencyName}/package.json`, dependencyName]) {
    try {
      const resolved = require.resolve(request);
      if (request.endsWith('/package.json')) return dirname(resolved);

      let current = dirname(resolved);
      for (;;) {
        const manifestPath = join(current, 'package.json');
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string };
          if (manifest.name === dependencyName) return current;
        }

        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    } catch {
      // Optional/platform-specific dependency not installed for this build.
    }
  }

  return undefined;
}

function readManifest<T>(packageRoot: string): T {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as T;
}
