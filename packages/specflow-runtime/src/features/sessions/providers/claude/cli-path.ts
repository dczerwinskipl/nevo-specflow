import { realpath, stat } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

import { PRODUCT_CLI } from '@nevo/specflow-contracts/documents';

import { createIdentityHash } from './identity-hash';

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

/** The file a bare `nevo-specflow` resolved to: what an auto-approval is bound to. */
export interface ProductCliIdentity {
  /** The canonical real path (links and junctions resolved, the file system's own case). */
  readonly real: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

export type ProductCliTrust =
  | { readonly trusted: true; readonly identity: ProductCliIdentity }
  | { readonly trusted: false; readonly reason: string };

/** What the product CLI's resolution reads; a test seam. */
export interface ProductCliFiles {
  realpath(path: string): Promise<string>;
  /** Follows links; rejects for a missing path. */
  stat(
    path: string,
  ): Promise<{ isFile(): boolean; readonly size: number; readonly mtimeMs: number }>;
  /** The file's sha256, cached by its identity (see identity-hash.ts). */
  hash(path: string): Promise<string>;
}

const productCliHash = createIdentityHash();
const nativeFiles: ProductCliFiles = { realpath, stat, hash: productCliHash };

/**
 * Whether a bare `nevo-specflow` in the provider's shell resolves to the installed product CLI, and
 * which file that is. It fails closed: the host auto-approves an allowlisted call (D20) only for a
 * trusted identity. Not trusted when the effective `PATH` has a relative or empty entry (`.`, '',
 * `./x`); when any `PATH` entry, as written or as its canonical real path (links, junctions, case
 * on Windows), lies inside the Turn's workspace (an agent that may write there, for example
 * `node_modules/.bin` of a Runtime started through pnpm, could plant the command); when no
 * executable is found or it cannot be read; or when the executable's real path lies inside the
 * workspace. A `PATH` directory that does not exist is skipped: re-verification
 * ({@link productCliGuard}) notices one created later that shadows the trusted file.
 */
export async function productCliTrust(
  input: {
    readonly pathValue: string | undefined;
    readonly platform: NodeJS.Platform;
    readonly workspace: string;
  },
  files: ProductCliFiles = nativeFiles,
): Promise<ProductCliTrust> {
  const windows = input.platform === 'win32';
  const flavour = windows ? win32 : posix;
  const entries = (input.pathValue ?? '').split(windows ? ';' : ':').map((entry) => entry.trim());
  if (entries.some((entry) => entry === '' || !flavour.isAbsolute(entry))) {
    return { trusted: false, reason: 'PATH has a relative or empty entry.' };
  }

  const fold = (path: string) => (windows ? path.toLowerCase() : path);
  const canonical = async (path: string) => {
    try {
      return await files.realpath(path);
    } catch {
      return undefined;
    }
  };

  const workspace = flavour.resolve(input.workspace);
  const roots = [workspace, (await canonical(workspace)) ?? workspace].map((root) =>
    fold(flavour.resolve(root)),
  );
  const inside = (path: string) =>
    roots.some((root) => {
      const relative = flavour.relative(root, fold(flavour.resolve(path)));

      return !relative.startsWith('..') && !flavour.isAbsolute(relative);
    });

  const directories: string[] = [];
  for (const entry of entries) {
    const real = await canonical(entry);
    if (inside(entry) || (real !== undefined && inside(real))) {
      return { trusted: false, reason: "A PATH entry lies inside the Turn's workspace." };
    }

    if (real !== undefined) {
      directories.push(real);
    }
  }

  for (const directory of directories) {
    for (const extension of windows ? WINDOWS_EXTENSIONS : ['']) {
      const candidate = flavour.join(directory, PRODUCT_CLI + extension);
      const found = await files.stat(candidate).catch(() => undefined);
      if (!found?.isFile()) {
        continue;
      }

      try {
        const real = await files.realpath(candidate);
        if (inside(real)) {
          return {
            trusted: false,
            reason: `${PRODUCT_CLI} resolves to a file inside the workspace.`,
          };
        }

        const identity = await files.stat(real);
        const sha256 = await files.hash(real);

        return {
          trusted: true,
          identity: { real, size: identity.size, mtimeMs: identity.mtimeMs, sha256 },
        };
      } catch {
        return { trusted: false, reason: `${PRODUCT_CLI} on PATH could not be read.` };
      }
    }
  }

  return { trusted: false, reason: `${PRODUCT_CLI} was not found on PATH.` };
}

/**
 * The Turn's product CLI check: resolves the identity once, when created (Turn start), and at each
 * call (each auto-approval decision) resolves it again. A call is trusted only while the file a bare
 * `nevo-specflow` resolves to is still the one trusted at Turn start (same real path, size,
 * modification time and hash): a file swapped, a link repointed or a `PATH` directory created
 * ahead of it during the Turn is not auto-approved. Never rejects.
 */
export function productCliGuard(
  input: Parameters<typeof productCliTrust>[0],
  files: ProductCliFiles = nativeFiles,
): () => Promise<ProductCliTrust> {
  const resolve = () =>
    productCliTrust(input, files).catch((): ProductCliTrust => ({
      trusted: false,
      reason: `${PRODUCT_CLI} could not be resolved.`,
    }));
  const initial = resolve();

  return async () => {
    const start = await initial;
    if (!start.trusted) {
      return start;
    }

    const now = await resolve();
    if (!now.trusted) {
      return now;
    }

    const same =
      now.identity.real === start.identity.real &&
      now.identity.size === start.identity.size &&
      now.identity.mtimeMs === start.identity.mtimeMs &&
      now.identity.sha256 === start.identity.sha256;

    return same
      ? now
      : { trusted: false, reason: `${PRODUCT_CLI} on PATH changed since the Turn started.` };
  };
}
