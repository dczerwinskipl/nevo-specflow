import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';

import { isAbsent } from './errno';
import { READ_OPEN_FLAGS, readAt } from './verified-file';

const CHUNK_BYTES = 256 * 1024;

/**
 * What a working-tree path holds, for a caller that only needs its identity: the content hash and
 * size of a regular file, or why there is none. Never reads through a symbolic link (Git would commit
 * the link, not its target) and never reads more than `maxBytes`.
 */
export type WorkingFileHash =
  | { readonly kind: 'file'; readonly sha256: string; readonly bytes: number }
  | { readonly kind: 'absent' }
  /** A directory, a symbolic link, a special file or a file that cannot be opened. */
  | { readonly kind: 'not-regular' }
  | { readonly kind: 'too-large' };

/**
 * Hashes the regular file at `absolutePath` in chunks through one open descriptor. The size is
 * checked on the descriptor before anything is read and again while reading, so a file over
 * `maxBytes` (or one that grows) is refused without being held in memory.
 */
export async function hashWorkingFile(
  absolutePath: string,
  maxBytes: number,
): Promise<WorkingFileHash> {
  try {
    if (!(await lstat(absolutePath)).isFile()) {
      return { kind: 'not-regular' };
    }

    const handle = await open(absolutePath, READ_OPEN_FLAGS);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) {
        return { kind: 'not-regular' };
      }

      if (stat.size > maxBytes) {
        return { kind: 'too-large' };
      }

      const hash = createHash('sha256');
      let position = 0;
      for (;;) {
        const chunk = await readAt(handle, position, CHUNK_BYTES);
        if (chunk.length === 0) {
          break;
        }

        position += chunk.length;
        if (position > maxBytes) {
          return { kind: 'too-large' };
        }

        hash.update(chunk);
      }

      return { kind: 'file', sha256: hash.digest('hex'), bytes: position };
    } finally {
      await handle.close().catch(() => undefined);
    }
  } catch (error) {
    if (isAbsent(error)) {
      return { kind: 'absent' };
    }

    return { kind: 'not-regular' };
  }
}
