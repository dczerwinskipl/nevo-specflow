import { sha256Hex } from '../../hash';
import { WorkflowError } from '../errors';
import { isValidTaskId, JOURNAL_BYTES_MAX } from '../limits';

/**
 * Format of the local change journal of one Specification (`<stateRoot>/engine/operations/workflow/<specId>.json`).
 *
 * A change is written whole to the journal before any record file, so a crash between the files never
 * exposes half a change. Every write records the revision it replaces: a pending journal is only
 * honoured while each target still holds that revision or already the new text. When the change is
 * published the journal is removed.
 */

const JOURNAL_VERSION = 1;

/** `expected`: sha256 of the text the write replaces, `null` when the file did not exist. */
export type JournalWrite = { readonly text: string; readonly expected: string | null } & (
  | { readonly target: 'specification' }
  | { readonly target: 'task'; readonly taskId: string }
  | { readonly target: 'attention' }
);

export interface Journal {
  readonly version: number;
  readonly specId: string;
  readonly writes: readonly JournalWrite[];
}

export const revisionOf = (text: string | undefined): string | null =>
  text === undefined ? null : sha256Hex(text);

export const targetKey = (write: JournalWrite): string =>
  write.target === 'task' ? `task:${write.taskId}` : write.target;

export function pendingJournal(specId: string, writes: readonly JournalWrite[]): Journal {
  return { version: JOURNAL_VERSION, specId, writes };
}

/** A target may be published when it still holds the planned-against revision or already the text. */
export function holdsPlannedRevision(current: string | undefined, write: JournalWrite): boolean {
  return current === write.text || revisionOf(current) === write.expected;
}

export function serializeJournal(journal: Journal): string {
  const text = `${JSON.stringify(journal, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > JOURNAL_BYTES_MAX) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The change is too large to store.');
  }

  return text;
}

export function parseJournal(text: string, specId: string): Journal {
  try {
    const journal = JSON.parse(text) as Journal;
    if (
      journal.version === JOURNAL_VERSION &&
      journal.specId === specId &&
      Array.isArray(journal.writes) &&
      journal.writes.every(isJournalWrite) &&
      new Set(journal.writes.map(targetKey)).size === journal.writes.length
    ) {
      return journal;
    }
  } catch {
    // Reported below: an unreadable journal is never skipped silently.
  }

  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The workflow change journal is not valid.');
}

function isJournalWrite(value: unknown): value is JournalWrite {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const write = value as Record<string, unknown>;
  const expected =
    write.expected === null ||
    (typeof write.expected === 'string' && /^[0-9a-f]{64}$/u.test(write.expected));

  return (
    typeof write.text === 'string' &&
    expected &&
    (write.target === 'specification' ||
      write.target === 'attention' ||
      (write.target === 'task' && typeof write.taskId === 'string' && isValidTaskId(write.taskId)))
  );
}
