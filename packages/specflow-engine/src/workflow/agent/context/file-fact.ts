import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import { sha256Hex } from '../../../hash';
import { AGENT_CONTEXT_REFERENCE_BYTES_MAX } from '../../limits';
import type { ContextFileFact, HashBudget } from '../../operations/agent-step-context';

/**
 * A reference is a checkout-relative path with `/` separators: no leading `/`, no drive letter, no
 * backslash and no empty, `.` or `..` segment. Anything else never names a file of the checkout.
 */
export function isCheckoutRelative(path: string): boolean {
  return (
    path !== '' &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !/^[A-Za-z]:/u.test(path) &&
    !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

/** Failures that mean "no such file here": the path cannot name one (or names none). */
const ABSENT_CODES = new Set(['ENOENT', 'ENOTDIR', 'EINVAL', 'ENAMETOOLONG']);

/**
 * A regular file inside the checkout as a reference sees it: its size and the digest of the bytes
 * that were read (size and digest come from the same read). The digest is left out when the file is
 * over the per-file budget or the remaining aggregate `budget`; the caller refuses then. A symlinked
 * file, a folder, a missing file and a path that resolves outside the checkout are not files here.
 */
export async function fileFact(
  root: string,
  path: string,
  budget: HashBudget,
): Promise<ContextFileFact | undefined> {
  if (!isCheckoutRelative(path)) {
    return undefined;
  }

  const absolute = join(root, ...path.split('/'));
  try {
    const status = await lstat(absolute);
    if (!status.isFile()) {
      return undefined;
    }

    const inside = relative(await realpath(root), await realpath(absolute));
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      return undefined;
    }

    const limit = Math.min(AGENT_CONTEXT_REFERENCE_BYTES_MAX, budget.remaining);
    if (status.size > limit) {
      return { path, bytes: status.size };
    }

    const bytes = await readFile(absolute);
    if (bytes.length > limit) {
      return { path, bytes: bytes.length };
    }

    budget.remaining -= bytes.length;

    return { path, bytes: bytes.length, sha256: sha256Hex(bytes) };
  } catch (error) {
    if (error instanceof Error && 'code' in error && ABSENT_CODES.has(String(error.code))) {
      return undefined;
    }

    throw error;
  }
}
