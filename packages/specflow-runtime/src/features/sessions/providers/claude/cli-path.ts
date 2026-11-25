import { existsSync, realpathSync } from 'node:fs';
import { posix, win32 } from 'node:path';

import { PRODUCT_CLI } from '@nevo/specflow-contracts/documents';

const WINDOWS_EXTENSIONS = ['', '.exe', '.cmd', '.bat', '.com', '.ps1'];

/**
 * `pathValue` without its empty and relative entries (`''`, `.`, `bin`, `C:tools`), which would
 * resolve a command against the shell's current directory. A quoted Windows entry is unquoted.
 * Applied to the environment the Runtime launches Claude with (and so its shell tools), never to
 * the user's own PATH; `productCliTrust` then judges what is left.
 */
export function absolutePathEntries(pathValue: string, platform: NodeJS.Platform): string {
  const windows = platform === 'win32';
  const flavour = windows ? win32 : posix;
  const separator = windows ? ';' : ':';

  return pathValue
    .split(separator)
    .map((entry) => {
      const trimmed = entry.trim();

      return windows && /^".*"$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
    })
    .filter((entry) => entry !== '' && flavour.isAbsolute(entry))
    .join(separator);
}

/** `values` with its PATH (any case on Windows) reduced to {@link absolutePathEntries}. */
export function withAbsolutePath(
  values: Readonly<Record<string, string>>,
  platform: NodeJS.Platform,
): Record<string, string> {
  const result: Record<string, string> = { ...values };
  for (const name of Object.keys(result)) {
    if (platform === 'win32' ? name.toUpperCase() === 'PATH' : name === 'PATH') {
      result[name] = absolutePathEntries(result[name]!, platform);
    }
  }

  return result;
}

export type ProductCliTrust =
  { readonly trusted: true } | { readonly trusted: false; readonly reason: string };

/**
 * Whether a bare `nevo-specflow` in the provider's shell can only be the installed product CLI: the
 * host auto-approves an allowlisted call (D20) only then. Not trusted when the effective `PATH` has a
 * relative or empty entry (`.`, '', `./x`), when any `PATH` entry lies inside the Turn's workspace
 * (an agent that may write there, for example `node_modules/.bin` of a Runtime started through pnpm,
 * could plant the command), or when the executable `PATH` resolves lies inside the workspace (also
 * through a link). Resolved once, at Turn start; the reason is recorded in the Turn.
 */
export function productCliTrust(input: {
  readonly pathValue: string | undefined;
  readonly platform: NodeJS.Platform;
  readonly workspace: string;
  readonly exists?: (path: string) => boolean;
  readonly real?: (path: string) => string;
}): ProductCliTrust {
  const windows = input.platform === 'win32';
  const flavour = windows ? win32 : posix;
  const entries = (input.pathValue ?? '').split(windows ? ';' : ':').map((entry) => entry.trim());
  if (entries.some((entry) => entry === '' || !flavour.isAbsolute(entry))) {
    return { trusted: false, reason: 'PATH has a relative or empty entry.' };
  }

  const fold = (path: string) => (windows ? path.toLowerCase() : path);
  const root = fold(flavour.resolve(input.workspace));
  const inside = (path: string) => {
    const relative = flavour.relative(root, fold(flavour.resolve(path)));

    return !relative.startsWith('..') && !flavour.isAbsolute(relative);
  };

  if (entries.some(inside)) {
    return { trusted: false, reason: "A PATH entry lies inside the Turn's workspace." };
  }

  const exists = input.exists ?? existsSync;
  const real =
    input.real ??
    ((path: string) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    });
  for (const entry of entries) {
    for (const extension of windows ? WINDOWS_EXTENSIONS : ['']) {
      const candidate = flavour.join(entry, PRODUCT_CLI + extension);
      if (exists(candidate)) {
        return inside(real(candidate))
          ? { trusted: false, reason: `${PRODUCT_CLI} resolves to a file inside the workspace.` }
          : { trusted: true };
      }
    }
  }

  return { trusted: true };
}
