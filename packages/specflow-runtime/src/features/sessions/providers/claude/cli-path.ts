import { existsSync } from 'node:fs';
import { posix, win32 } from 'node:path';

import { PRODUCT_CLI } from '@nevo/specflow-contracts/documents';

const WINDOWS_EXTENSIONS = ['', '.exe', '.cmd', '.bat', '.com', '.ps1'];

/**
 * Whether a bare `nevo-specflow` in the provider's shell can only be the installed product CLI: the
 * host auto-approves an allowlisted call (D20) only then. Refused when the effective `PATH` has a
 * relative or empty entry (`.`, '', `./x`: the shell would run a file of the workspace), and on
 * Windows, where the shell may also look in the current directory, when the executable `PATH`
 * resolves lies inside the Turn's workspace. Resolved once, at Turn start.
 */
export function productCliTrusted(input: {
  readonly pathValue: string | undefined;
  readonly platform: NodeJS.Platform;
  readonly workspace: string;
  readonly exists?: (path: string) => boolean;
}): boolean {
  const windows = input.platform === 'win32';
  const flavour = windows ? win32 : posix;
  const entries = (input.pathValue ?? '').split(windows ? ';' : ':');
  if (entries.some((entry) => entry.trim() === '' || !flavour.isAbsolute(entry.trim()))) {
    return false;
  }

  if (!windows) {
    return true;
  }

  const exists = input.exists ?? existsSync;
  const root = flavour.resolve(input.workspace).toLowerCase();
  for (const entry of entries) {
    for (const extension of WINDOWS_EXTENSIONS) {
      const candidate = flavour.join(entry.trim(), PRODUCT_CLI + extension);
      if (exists(candidate)) {
        const relative = flavour.relative(root, flavour.resolve(candidate).toLowerCase());

        return relative.startsWith('..') || flavour.isAbsolute(relative);
      }
    }
  }

  return true;
}
