import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomically } from '../../../project/atomic-json';
import { readFileWindowsSafe } from '../../../project/windows-safe-fs';
import type { ResolvedProjectHome } from '../../../project/project-home';
import { CLOSE_UUID, isCloseJournal } from './codec';
import { CloseOperationError, type CloseJournal } from '../model';

const JOURNAL_DIR = 'engine/operations/close';

export function closeJournalPath(context: ResolvedProjectHome, operationId: string): string {
  if (!CLOSE_UUID.test(operationId)) throw invalid();
  return join(context.project.stateRoot, JOURNAL_DIR, operationId + '.json');
}

export async function listCloseJournals(
  context: ResolvedProjectHome,
): Promise<readonly CloseJournal[]> {
  const directory = join(context.project.stateRoot, JOURNAL_DIR);
  try {
    await requireRealDirectory(directory);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const records: CloseJournal[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) throw invalid();
    const record = await readCloseJournal(context, entry.name.slice(0, -5));
    if (!record) throw invalid();
    records.push(record);
  }
  return records;
}

export async function readCloseJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<CloseJournal | undefined> {
  const path = closeJournalPath(context, operationId);
  try {
    // A symlinked ancestor is a redirected journal namespace, not a missing record.
    await requireRealDirectory(join(context.project.stateRoot, 'engine'));
    await requireRealDirectory(join(context.project.stateRoot, 'engine', 'operations'));
    await requireRealDirectory(join(context.project.stateRoot, JOURNAL_DIR));
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw invalid();
    const parsed = JSON.parse(await readFileWindowsSafe(path)) as unknown;
    if (!isCloseJournal(context, parsed, operationId)) throw invalid();
    return parsed;
  } catch (error) {
    if (isMissing(error)) return undefined;
    if (error instanceof SyntaxError) throw invalid();
    throw error;
  }
}

/** Mutations only while holding the Project Home control lock. */
export async function publishCloseJournal(
  context: ResolvedProjectHome,
  journal: CloseJournal,
): Promise<void> {
  if (!isCloseJournal(context, journal, journal.plan.operationId)) throw invalid();
  const directory = join(context.project.stateRoot, JOURNAL_DIR);
  let ancestor = context.project.stateRoot;
  for (const part of ['engine', 'operations', 'close']) {
    ancestor = join(ancestor, part);
    try {
      await mkdir(ancestor, { mode: 0o700 });
    } catch (error) {
      if (!isExists(error)) throw error;
    }
    await requireRealDirectory(ancestor);
  }
  await requireRealDirectory(directory);
  await writeJsonAtomically(closeJournalPath(context, journal.plan.operationId), journal);
}

async function requireRealDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path)
    throw invalid();
}

function invalid(): CloseOperationError {
  return new CloseOperationError(
    'CLOSE_JOURNAL_CORRUPT',
    'Close journal is corrupt, redirected or unsupported.',
  );
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
