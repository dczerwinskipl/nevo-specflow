import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  compareGenerations,
  generationFiles,
  parseGenerationFile,
  type GenerationFile,
} from './generation-files';
import type { WriterLockDependencies } from './writer-lock';

/**
 * Cleanup after a write. Kept: the pair just written, the previous pair (`baseKey`, for readers that
 * listed before the write) and the pair the current highest manifest names (re-listed now, in case
 * another writer wrote after this one). Removed: other pairs ranked below the written one
 * (`compareGenerations`), which it supersedes; any other generation file and temporary file only
 * once older than `staleAfterMs`, because a younger one can belong to a write in progress. A file
 * that cannot be removed (for example held open by another program) stays for a later write.
 */
export async function removeSuperseded(
  directory: string,
  written: GenerationFile,
  baseKey: string | undefined,
  lock: WriterLockDependencies,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return;
  }

  const keep = new Set([written.key, baseKey, generationFiles(names)[0]?.key]);
  for (const name of names) {
    const file = parseGenerationFile(name);
    const path = join(directory, name);
    if (file) {
      if (keep.has(file.key)) {
        continue;
      }

      if (compareGenerations(file, written) < 0 || (await isOlderThanStale(path, lock))) {
        await removeQuietly(path);
      }
    } else if (name.endsWith('.tmp') && (await isOlderThanStale(path, lock))) {
      await removeQuietly(path);
    }
  }
}

async function isOlderThanStale(path: string, lock: WriterLockDependencies): Promise<boolean> {
  try {
    return lock.now() - (await stat(path)).mtimeMs > lock.staleAfterMs;
  } catch {
    return false;
  }
}

export async function removeQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // The file stays for a later write's cleanup; no manifest that readers pick names it.
  }
}
