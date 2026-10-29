import { readFile } from 'node:fs/promises';

import type { SpecFlowEngine } from '../../../application';
import {
  listJournalRowsTolerant,
  readJournalRowTolerant,
  type TolerantJournalReader,
} from '../../durable';
import { parseCreateJournal } from '../journal/codec';
import { CREATE_JOURNAL_KIND } from '../journal/kind';
import { classifyCreateJournalText } from '../journal/unsupported';
import { CREATE_JOURNAL_MAX_BYTES } from '../limits';
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
  /** Stable code of the cause when it is known (an unreadable journal). */
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

/**
 * Tolerant, read-only listing of the Create journals from disk. It never spawns Git, never takes
 * the Project Home control lock and never fails because of one bad file: an unreadable journal is
 * a row of its own (`unreadable`, `recovery-required`). The strict, fail-closed
 * `listCreateJournals` used by Create itself is untouched.
 */
export async function listPublicCreateOperations(
  engine: SpecFlowEngine,
): Promise<readonly PublicCreateListingRow[]> {
  return listJournalRowsTolerant(engine.context, CREATE_JOURNAL_KIND, readerOf(engine));
}

/**
 * The listing row of ONE operation (same tolerant read as the list, never takes the lock and never
 * spawns Git); `undefined` when no journal file exists.
 */
export async function readPublicCreateOperationRow(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<PublicCreateListingRow | undefined> {
  return readJournalRowTolerant(engine.context, CREATE_JOURNAL_KIND, operationId, readerOf(engine));
}

function readerOf(engine: SpecFlowEngine): TolerantJournalReader<PublicCreateListingRow> {
  return {
    readRow: (path, operationId, stat, updatedAt) =>
      readRow(engine, path, operationId, stat, updatedAt),
    unreadable,
  };
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
    if (classified.kind === 'unsupported') {
      return unsupported(operationId, updatedAt);
    }

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

/** A row for an unreadable journal: only its id; the cause is a stable code, never its content. */
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
