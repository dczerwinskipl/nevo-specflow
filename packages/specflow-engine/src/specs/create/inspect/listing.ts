import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { UUID, parseCreateJournal } from '../journal/codec';
import { classifyCreateJournalText } from '../journal/unsupported';
import { CREATE_JOURNAL_LISTING_MAX_FILES, CREATE_JOURNAL_MAX_BYTES } from '../limits';
import { CREATE_JOURNAL_RELATIVE_DIR } from '../journal/store';
import { createStepForStage, type PublicCreateStepId } from './step-mapping';

export type PublicCreateListingState = 'in-progress' | 'recovery-required' | 'completed';

/**
 * One row of the read-only Create listing. Deliberately narrow: no paths, no instance ids, no
 * commit ids, no raw stage and never the journal `reason` (internal text).
 */
export interface PublicCreateListingRow {
  readonly operationId: string;
  readonly kind: 'specification-create';
  /** Persisted progress, NOT the liveness of any writer. */
  readonly state: PublicCreateListingState;
  /** The journal could not be read or validated: only the id is known. */
  readonly unreadable?: true;
  /** Stable code of the cause when it is known (an older-format journal). */
  readonly code?: 'CREATE_JOURNAL_UNSUPPORTED';
  readonly specId?: string;
  readonly slug?: string;
  readonly title?: string;
  readonly target?: {
    readonly kind: 'existing' | 'new-worktree';
    readonly workspaceId: string;
    readonly branch?: string;
  };
  /** `Boolean(journal.commit)`: the checklist then includes `committing-specification`. */
  readonly commits?: boolean;
  /** Public step the persisted stage maps to; absent when terminal or unknown. */
  readonly currentStep?: PublicCreateStepId;
  /** Journal `startedAt`, else absent. */
  readonly startedAt?: string;
  /** Last write of the journal file (ISO). */
  readonly updatedAt: string;
}

interface Memo {
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly size: number;
  readonly ino: number;
  readonly row: PublicCreateListingRow;
}

/** Process-local memo per journal directory: only files whose stat signature changed are parsed. */
const memos = new Map<string, Map<string, Memo>>();

/**
 * Tolerant, read-only listing of the Create journals from disk. It never spawns Git, never takes
 * the Project Home control lock and never fails because of one bad file: an unreadable journal is
 * a row of its own (`unreadable`, `recovery-required`). The strict, fail-closed
 * `listCreateJournals` used by Create itself is untouched.
 */
export async function listPublicCreateOperations(
  engine: SpecFlowEngine,
): Promise<readonly PublicCreateListingRow[]> {
  const dir = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
  let names: string[];
  try {
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return [];
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  names.sort();
  names = names.slice(0, CREATE_JOURNAL_LISTING_MAX_FILES);

  const previous = memos.get(dir) ?? new Map<string, Memo>();
  const next = new Map<string, Memo>();
  const rows: PublicCreateListingRow[] = [];
  for (const name of names) {
    const operationId = name.slice(0, -5);
    // A name that is not an operation id cannot be addressed by anything: not a journal.
    if (!UUID.test(operationId)) continue;
    const path = join(dir, name);
    let stat;
    try {
      stat = await lstat(path);
    } catch (error) {
      if (isMissing(error)) continue;
      rows.push(unreadable(operationId, new Date(0)));
      continue;
    }
    const updatedAt = new Date(stat.mtimeMs);
    const known = previous.get(name);
    if (
      known?.mtimeMs === stat.mtimeMs &&
      known.ctimeMs === stat.ctimeMs &&
      known.size === stat.size &&
      known.ino === stat.ino
    ) {
      next.set(name, known);
      rows.push(known.row);
      continue;
    }
    const row = await readRow(engine, path, operationId, stat, updatedAt);
    next.set(name, {
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      size: stat.size,
      ino: stat.ino,
      row,
    });
    rows.push(row);
  }
  memos.set(dir, next);
  return rows;
}

/**
 * The listing row of ONE operation (same tolerant read as the list, never takes the lock and never
 * spawns Git); `undefined` when no journal file exists.
 */
export async function readPublicCreateOperationRow(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<PublicCreateListingRow | undefined> {
  if (!UUID.test(operationId)) return undefined;
  const path = join(
    engine.context.project.stateRoot,
    CREATE_JOURNAL_RELATIVE_DIR,
    operationId + '.json',
  );
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    return unreadable(operationId, new Date(0));
  }
  return readRow(engine, path, operationId, stat, new Date(stat.mtimeMs));
}

async function readRow(
  engine: SpecFlowEngine,
  path: string,
  operationId: string,
  stat: { isFile(): boolean; isSymbolicLink(): boolean; size: number },
  updatedAt: Date,
): Promise<PublicCreateListingRow> {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CREATE_JOURNAL_MAX_BYTES) {
    return unreadable(operationId, updatedAt);
  }
  try {
    const classified = classifyCreateJournalText(await readFile(path, 'utf8'));
    if (classified.kind === 'unsupported') return unsupported(operationId, updatedAt);
    const journal = parseCreateJournal(engine.context, classified.value, operationId);
    const commits = Boolean(journal.commit);
    const branch =
      journal.target.kind === 'new-worktree' ? journal.target.branch : journal.commit?.branch;
    const currentStep = createStepForStage(journal.stage, journal.target.kind, commits);
    return {
      operationId,
      kind: 'specification-create',
      state:
        journal.stage === 'completed'
          ? 'completed'
          : journal.stage === 'recovery-required'
            ? 'recovery-required'
            : 'in-progress',
      specId: journal.specId,
      slug: journal.slug,
      title: journal.title,
      target: {
        kind: journal.target.kind,
        workspaceId: journal.target.workspaceId,
        ...(branch ? { branch } : {}),
      },
      commits,
      ...(currentStep ? { currentStep } : {}),
      ...(journal.startedAt ? { startedAt: new Date(journal.startedAt).toISOString() } : {}),
      updatedAt: updatedAt.toISOString(),
    };
  } catch {
    return unreadable(operationId, updatedAt);
  }
}

/** A row for an older-format journal: only its id; the cause is a stable code, never its content. */
function unsupported(operationId: string, updatedAt: Date): PublicCreateListingRow {
  return { ...unreadable(operationId, updatedAt), code: 'CREATE_JOURNAL_UNSUPPORTED' };
}

function unreadable(operationId: string, updatedAt: Date): PublicCreateListingRow {
  return {
    operationId,
    kind: 'specification-create',
    state: 'recovery-required',
    unreadable: true,
    updatedAt: updatedAt.toISOString(),
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}
