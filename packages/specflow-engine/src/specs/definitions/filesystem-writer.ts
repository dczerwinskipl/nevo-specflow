import { randomBytes } from 'node:crypto';
import { link, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { errnoCode, isAbsent } from '../document-rules/errno';
import { removeFileWindowsSafe, renameWindowsSafe } from '../../project/fs/windows-safe-fs';
import { samePhysicalPath } from '../document-rules/verified-file';
import { DEFINITIONS_RELATIVE_PATH } from './source';
import type { DefinitionWriter, WriteOptions } from './writer';

/**
 * Atomic writes below `<home>/.nevo/definitions`. Every directory on the way must be a real
 * directory (a symlink is refused, never followed, and never created over), a target that exists must
 * be a regular file, and the bytes go to a short staged name in the same directory, are synced and
 * renamed over the target, so a reader sees the old file or the whole new one. An exclusive write
 * publishes by hard link instead, which fails when the target appeared meanwhile.
 */

export class DefinitionWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitionWriteError';
  }
}

/** A directory on the way that exists is checked; one that does not is created. */
async function checkDirectory(directory: string): Promise<boolean> {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new DefinitionWriteError(
        'A folder on the way to the definitions is not a plain directory.',
      );
    }
    if (!samePhysicalPath(await realpath(directory), directory)) {
      throw new DefinitionWriteError('A folder on the way to the definitions is redirected.');
    }
    return true;
  } catch (error) {
    if (!isAbsent(error)) throw error;
    return false;
  }
}

async function ensureDirectory(directory: string): Promise<void> {
  if (await checkDirectory(directory)) return;
  try {
    await mkdir(directory);
  } catch (error) {
    // Another writer created it first: it still has to be a plain directory.
    if (errnoCode(error) !== 'EEXIST' || !(await checkDirectory(directory))) throw error;
  }
}

/** `homeRoot` is the Engine-verified canonical root of the Project Home. */
export function createFilesystemDefinitionWriter(homeRoot: string): DefinitionWriter {
  const definitionsRoot = join(homeRoot, ...DEFINITIONS_RELATIVE_PATH.split('/'));
  return {
    async writeAtomic(path, bytes, options: WriteOptions = {}) {
      if (
        path === '' ||
        path.startsWith('/') ||
        path.includes('\\') ||
        path.split('/').includes('..')
      ) {
        throw new DefinitionWriteError('The definition path leaves the definitions folder.');
      }
      const target = join(definitionsRoot, ...path.split('/'));
      let directory = homeRoot;
      for (const segment of [
        ...DEFINITIONS_RELATIVE_PATH.split('/'),
        ...path.split('/').slice(0, -1),
      ]) {
        directory = join(directory, segment);
        await ensureDirectory(directory);
      }
      try {
        const existing = await lstat(target);
        if (!existing.isFile() || existing.isSymbolicLink()) {
          throw new DefinitionWriteError('The definition path is not a regular file.');
        }
      } catch (error) {
        if (!isAbsent(error)) throw error;
      }

      const staged = join(dirname(target), `.${randomBytes(4).toString('hex')}.tmp`);
      let published = false;
      try {
        const handle = await open(staged, 'wx', 0o644);
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (options.exclusive === true) {
          try {
            await link(staged, target);
          } catch (error) {
            if (errnoCode(error) === 'EEXIST') {
              throw new DefinitionWriteError(
                'The definition file appeared after the install was planned.',
              );
            }
            throw error;
          }
          await removeFileWindowsSafe(staged);
        } else {
          await renameWindowsSafe(staged, target);
        }
        published = true;
      } finally {
        if (!published) await removeFileWindowsSafe(staged).catch(() => undefined);
      }
    },
  };
}
