import { win32 } from 'node:path';
import type { ProviderEnvironment } from '../process';
import type { ExecutableFiles } from './files';
import { searchPath, trustedPath } from './search-path';

/** Where discovery may run from: the lexically trusted folders and the physical check of a file. */
export interface TrustGuard {
  readonly untrusted: readonly string[];
  trusted(path: string): Promise<boolean>;
}

async function regularFile(files: ExecutableFiles, path: string) {
  try {
    const stat = await files.stat(path);

    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * The npm global prefix as npm itself reports it (`npm prefix --global`), so a custom `prefix` in
 * the user's `.npmrc` is honoured. npm runs through the first `node.exe` on PATH and the
 * `npm-cli.js` bundled beside it (a `.cmd` launcher would need a shell). Undefined when that
 * `node.exe` has no bundled npm (for example a version manager's shim), npm does not answer in
 * time, or the prefix is in an untrusted folder.
 */
export async function npmGlobalPrefix(
  environment: ProviderEnvironment,
  guard: TrustGuard,
  files: ExecutableFiles,
): Promise<string | undefined> {
  for (const directory of searchPath(environment, guard.untrusted)) {
    const node = win32.join(directory, 'node.exe');
    if (!(await regularFile(files, node)) || !(await guard.trusted(node))) {
      continue;
    }

    const cli = win32.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!(await regularFile(files, cli)) || !(await guard.trusted(cli))) {
      return undefined;
    }

    try {
      const output = (
        await files.run(node, [cli, 'prefix', '--global'], { environment, timeoutMs: 5000 })
      ).trim();

      return output && !output.includes('\n') && trustedPath(output, guard.untrusted)
        ? win32.resolve(output)
        : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
