import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** The largest executable SpecFlow hashes (the certification budget). */
const HASH_BUDGET_BYTES = 512 * 1024 * 1024;

/** What the identity of an executable file is read from. */
export interface IdentityFiles {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{
    readonly size: number;
    readonly mtimeMs: number;
    /** The status-change time, which a process cannot set back like the modification time. */
    readonly ctimeMs?: number;
  }>;
  /** The file's sha256, streamed (never read whole, never synchronously). */
  hash(path: string): Promise<string>;
}

const nativeFiles: IdentityFiles = {
  realpath,
  stat: lstat,
  async hash(path) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(path)) {
      bytes += (chunk as Buffer).length;
      if (bytes > HASH_BUDGET_BYTES) {
        throw new Error('Executable exceeds certification budget.');
      }

      hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
  },
};

/**
 * The sha256 of an executable, cached by its identity: its real path, size, modification and status-change time.
 * A binary that changed (replaced, updated in place, a link pointing elsewhere) has another
 * identity and is hashed again, so the hash always describes the file as it is; an unchanged one is
 * hashed once (Claude's executable is about 300 MB). The identity is read again before and after the
 * hash: a file that changed while it was hashed is never cached under its earlier identity. A
 * failed hash is not cached.
 */
export function createIdentityHash(files: IdentityFiles = nativeFiles) {
  const cache = new Map<string, Promise<string>>();
  const identityOf = async (path: string) => {
    const real = await files.realpath(path);
    const stat = await files.stat(real);

    return { real, key: JSON.stringify([real, stat.size, stat.mtimeMs, stat.ctimeMs ?? null]) };
  };

  return async function identityHash(path: string): Promise<string> {
    const { real, key } = await identityOf(path);
    const known = cache.get(key);
    if (known) {
      return known;
    }

    const hashed = files.hash(real);
    cache.set(key, hashed);
    try {
      const sha256 = await hashed;
      if ((await identityOf(path)).key !== key) {
        cache.delete(key);
      }

      return sha256;
    } catch (error) {
      cache.delete(key);

      throw error;
    }
  };
}

/** The Runtime's one cache: every Claude inspection reads the executable's hash from it. */
export const claudeExecutableHash = createIdentityHash();
