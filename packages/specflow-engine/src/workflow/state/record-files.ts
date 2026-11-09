import type { BigIntStats } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import { writeTextAtomically } from '../../project/fs/atomic-json';
import { removeFileWindowsSafe, retryTransientFs } from '../../project/fs/windows-safe-fs';
import { errnoCode, isAbsent } from '../../specs/document-rules/errno';
import {
  READ_OPEN_FLAGS,
  readAt,
  samePhysicalPath,
} from '../../specs/document-rules/verified-file';
import { WorkflowError } from '../errors';

/**
 * Access to the files of the execution state below a trusted root (the Specification directory or
 * the local state root). A folder is addressed by its segments below the root and must be a real
 * directory at exactly that physical place: a symlink or junction anywhere below the root, or a
 * record that is not a regular file, fails closed with `WORKFLOW_STATE_CORRUPT` before anything is
 * read, written or removed. A file is read only after its size was checked against a bound, and
 * the opened file must be the one that was checked (the guard of `specs/document-rules/verified-file.ts`,
 * best effort on Windows, which has no `O_NOFOLLOW`).
 *
 * Callers serialize the reads and writes of a Specification (the operations hold the project control
 * lock), so these checks guard against links and foreign files, not against a concurrent writer.
 */

export interface RecordFolder {
  readonly root: string;
  readonly segments: readonly string[];
}

const pathOf = (folder: RecordFolder, name?: string) =>
  join(folder.root, ...folder.segments, ...(name === undefined ? [] : [name]));

function corrupt(message: string): never {
  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', message);
}

async function lstatOptional(path: string): Promise<BigIntStats | undefined> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (isAbsent(error)) {
      return undefined;
    }

    throw error;
  }
}

/** `absent` when the folder (or an ancestor below the root) does not exist yet. */
async function inspectFolder(folder: RecordFolder): Promise<'present' | 'absent'> {
  let current = folder.root;
  for (const segment of folder.segments) {
    current = join(current, segment);
    const stat = await lstatOptional(current);
    if (stat === undefined) {
      return 'absent';
    }

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      corrupt(`The execution state folder "${current}" is not a plain directory.`);
    }
  }

  const [real, rootReal] = await Promise.all([realpath(current), realpath(folder.root)]);
  if (!samePhysicalPath(real, join(rootReal, ...folder.segments))) {
    corrupt(`The execution state folder "${current}" resolves elsewhere.`);
  }

  return 'present';
}

/** Create the folder below its root, one plain directory at a time. */
export async function ensureFolder(folder: RecordFolder): Promise<void> {
  await mkdir(folder.root, { recursive: true });
  let current = folder.root;
  for (const segment of folder.segments) {
    current = join(current, segment);
    if ((await lstatOptional(current)) === undefined) {
      await mkdir(current).catch((error: unknown) => {
        if (errnoCode(error) !== 'EEXIST') {
          throw error;
        }
      });
    }
  }

  await inspectFolder(folder);
}

export async function listFolder(folder: RecordFolder): Promise<string[]> {
  if ((await inspectFolder(folder)) === 'absent') {
    return [];
  }

  return readdir(pathOf(folder));
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  // Some Windows filesystems report inode 0 for both: the identity then rests on the device alone.
  return left.dev === right.dev && left.ino === right.ino;
}

function regularFile(stat: BigIntStats | undefined, path: string): stat is BigIntStats {
  if (stat !== undefined && (!stat.isFile() || stat.isSymbolicLink())) {
    corrupt(`The execution state file "${path}" is not a regular file.`);
  }

  return stat !== undefined;
}

/** The text of a record file, `undefined` when it does not exist; over `maxBytes` fails closed. */
export async function readRecordFile(
  folder: RecordFolder,
  name: string,
  maxBytes: number,
): Promise<string | undefined> {
  return (await readRecordFiles(folder, [name], maxBytes)).get(name);
}

/** {@link readRecordFile} for several files of one folder, which is checked once. */
export async function readRecordFiles(
  folder: RecordFolder,
  names: readonly string[],
  maxBytes: number,
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  if ((await inspectFolder(folder)) === 'present') {
    for (const name of names) {
      const text = await readCheckedFile(pathOf(folder, name), maxBytes);
      if (text !== undefined) {
        texts.set(name, text);
      }
    }
  }

  return texts;
}

async function readCheckedFile(path: string, maxBytes: number): Promise<string | undefined> {
  const checked = await lstatOptional(path);
  if (!regularFile(checked, path)) {
    return undefined;
  }

  const tooLarge = () => corrupt(`The execution state file "${path}" is larger than allowed.`);
  if (checked.size > BigInt(maxBytes)) {
    tooLarge();
  }

  let handle: FileHandle;
  try {
    handle = await retryTransientFs(() => open(path, READ_OPEN_FLAGS));
  } catch (error) {
    if (isAbsent(error)) {
      return undefined;
    }

    if (errnoCode(error) === 'ELOOP') {
      corrupt(`The execution state file "${path}" is not a regular file.`);
    }

    throw error;
  }

  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameFile(checked, opened)) {
      throw new WorkflowError(
        'WORKFLOW_STATE_CONFLICT',
        `The execution state file "${path}" changed while it was opened.`,
      );
    }

    const bytes = await readAt(handle, 0, maxBytes + 1);
    if (bytes.length > maxBytes) {
      tooLarge();
    }

    return bytes.toString('utf8');
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** Publish a record file atomically; the folder and an existing file must be plain. */
export async function writeRecordFile(
  folder: RecordFolder,
  name: string,
  text: string,
): Promise<void> {
  await ensureFolder(folder);
  const path = pathOf(folder, name);
  regularFile(await lstatOptional(path), path);
  await writeTextAtomically(path, text);
}

/** Remove a record file if it exists; the folder and the file must be plain. */
export async function removeRecordFile(folder: RecordFolder, name: string): Promise<void> {
  if ((await inspectFolder(folder)) === 'absent') {
    return;
  }

  const path = pathOf(folder, name);
  if (regularFile(await lstatOptional(path), path)) {
    await removeFileWindowsSafe(path).catch((error: unknown) => {
      if (!isAbsent(error)) {
        throw error;
      }
    });
  }
}

/**
 * Stage file of `writeTextAtomically` (`.<name>.<uuid>.tmp`). A crash between its creation and the
 * rename leaves it behind; it is never a record.
 */
const STAGE_FILE = /^\.(.+)\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u;

/** Remove the stage files of the records `isRecordName` accepts; every other name is left alone. */
export async function removeStageFiles(
  folder: RecordFolder,
  isRecordName: (name: string) => boolean,
): Promise<void> {
  for (const name of await listFolder(folder)) {
    const record = STAGE_FILE.exec(name)?.[1];
    if (record === undefined || !isRecordName(record)) {
      continue;
    }

    const path = pathOf(folder, name);
    if (regularFile(await lstatOptional(path), path)) {
      await removeFileWindowsSafe(path);
    }
  }
}
