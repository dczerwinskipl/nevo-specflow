import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { BundledThirdPartyPackage } from './bundle.ts';

/** Native bindings travel inside the tarball; installation never downloads code. */
export function copyWindowsBindings(outputDir: string): BundledThirdPartyPackage[] {
  const require = createRequire(new URL('../../specflow-runtime/package.json', import.meta.url));
  const root = dirname(require.resolve('koffi'));
  const packages = [{ name: 'koffi', root }];
  const nativeRequire = createRequire(join(root, 'package.json'));
  for (const architecture of ['x64', 'arm64']) {
    const name = `@koromix/koffi-win32-${architecture}`;
    packages.push({ name, root: dirname(nativeRequire.resolve(name)) });
  }

  const destination = join(outputDir, 'native');
  mkdirSync(destination, { recursive: true });
  for (const pkg of packages) {
    if (pkg.name === 'koffi') {
      for (const file of [
        'index.cjs',
        'src/koffi/index.cjs',
        'src/koffi/src/static.cjs',
        'package.json',
        'LICENSE.txt',
      ]) {
        const target = join(destination, pkg.name, file);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(pkg.root, file), target);
      }

      continue;
    }

    cpSync(pkg.root, join(destination, pkg.name), {
      recursive: true,
      filter: (source) => source !== join(pkg.root, 'node_modules'),
    });
  }

  return packages;
}
