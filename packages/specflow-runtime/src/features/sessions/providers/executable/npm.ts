import { win32 } from 'node:path';
import type { ProviderEnvironment } from '../process';
import type { ExecutableFiles } from './files';
import { searchPath } from './search-path';

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
 * the user's `.npmrc` or a Node version manager is honoured. npm runs through the `node.exe` found
 * on PATH and the `npm-cli.js` bundled beside it: a `.cmd` launcher would need a shell. Undefined
 * when Node or npm is not installed there or does not answer in time.
 */
export async function npmGlobalPrefix(
  environment: ProviderEnvironment,
  workspace: string,
  files: ExecutableFiles,
): Promise<string | undefined> {
  for (const directory of searchPath(environment, workspace)) {
    const node = win32.join(directory, 'node.exe');
    if (!(await regularFile(files, node))) {
      continue;
    }

    const cli = win32.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!(await regularFile(files, cli))) {
      return undefined;
    }

    try {
      const output = (
        await files.run(node, [cli, 'prefix', '--global'], { environment, timeoutMs: 5000 })
      ).trim();

      return output && !output.includes('\n') && win32.isAbsolute(output)
        ? win32.resolve(output)
        : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
