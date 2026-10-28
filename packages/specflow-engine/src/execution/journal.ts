import { lstat, mkdir, opendir, realpath, open } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomically, syncDirectoryWhenSupported } from '../project/fs/atomic-json';
import { renameWindowsSafe } from '../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../project/home/home';
import {
  parseExecutionJournal,
  WorkspaceExecutionError,
  type WorkspaceExecutionJournal,
} from './model';

const MAX_JOURNAL_BYTES = 64 * 1024;
function corrupt(): never {
  throw new WorkspaceExecutionError(
    'EXECUTION_CORRUPT',
    'External execution journal storage is invalid.',
  );
}
function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
async function directory(
  context: ResolvedProjectHome,
  create = false,
  archived = false,
): Promise<string | undefined> {
  let root = context.project.stateRoot;
  for (const segment of [
    '',
    'engine',
    'operations',
    'external-execution',
    ...(archived ? ['settled'] : []),
  ]) {
    if (segment) root = join(root, segment);
    if (create && segment)
      await mkdir(root, { mode: 0o700 }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      });
    try {
      const stat = await lstat(root);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(root)) !== root)
        corrupt();
    } catch (error) {
      if (missing(error) && !create) return undefined;
      throw error;
    }
  }
  return root;
}
function filename(operationId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId))
    corrupt();
  return operationId + '.json';
}
export async function readExecutionJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<WorkspaceExecutionJournal | undefined> {
  const active = await readLocatedJournal(context, operationId, false);
  return active ?? readLocatedJournal(context, operationId, true);
}
async function readLocatedJournal(
  context: ResolvedProjectHome,
  operationId: string,
  archived: boolean,
) {
  const name = filename(operationId);
  const root = await directory(context, false, archived);
  if (!root) return undefined;
  const path = join(root, name);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JOURNAL_BYTES) corrupt();
    const handle = await open(path, 'r');
    let raw: string;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > MAX_JOURNAL_BYTES) corrupt();
      const buffer = Buffer.alloc(MAX_JOURNAL_BYTES + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > MAX_JOURNAL_BYTES) corrupt();
      raw = buffer.toString('utf8', 0, offset);
    } finally {
      await handle.close();
    }
    const journal = parseExecutionJournal(context, operationId, JSON.parse(raw) as unknown);
    if (archived && journal.phase !== 'settled') corrupt();
    return journal;
  } catch (error) {
    if (missing(error)) return undefined;
    if (error instanceof SyntaxError) corrupt();
    throw error;
  }
}
export async function* listExecutionJournals(
  context: ResolvedProjectHome,
  strict = false,
): AsyncGenerator<WorkspaceExecutionJournal> {
  const root = await directory(context);
  if (!root) return;
  for await (const entry of await opendir(root)) {
    if (entry.name === 'settled') {
      if (!entry.isDirectory() || entry.isSymbolicLink()) corrupt();
      continue;
    }
    if (entry.name.startsWith('.') && entry.name.endsWith('.tmp')) continue;
    if (!entry.name.endsWith('.json') || !entry.isFile() || entry.isSymbolicLink()) corrupt();
    const journal = await readExecutionJournal(context, entry.name.slice(0, -5));
    // A read-only diagnostic may race an atomic settled-record archive rename.
    if (!journal && strict) corrupt();
    if (journal && journal.phase !== 'settled') yield journal;
  }
}
/** Caller holds the existing Project Home lock; this journal IS the claim. */
export async function publishExecutionJournal(
  context: ResolvedProjectHome,
  journal: WorkspaceExecutionJournal,
) {
  parseExecutionJournal(context, journal.intent.operationId, journal);
  const root = await directory(context, true);
  await writeJsonAtomically(join(root!, filename(journal.intent.operationId)), journal);
  const stored = await readExecutionJournal(context, journal.intent.operationId);
  if (JSON.stringify(stored) !== JSON.stringify(journal))
    throw new WorkspaceExecutionError(
      'EXECUTION_RECOVERY_REQUIRED',
      'Execution publication could not be verified.',
    );
  if (journal.phase === 'settled') {
    // Only a durably settled record moves; exact replay works from either location.
    const archive = await directory(context, true, true);
    const previous = await readLocatedJournal(context, journal.intent.operationId, true);
    if (previous && JSON.stringify(previous) !== JSON.stringify(journal)) corrupt();
    await renameWindowsSafe(
      join(root!, filename(journal.intent.operationId)),
      join(archive!, filename(journal.intent.operationId)),
    );
    await syncDirectoryWhenSupported(archive!);
    await syncDirectoryWhenSupported(root!);
  }
}
