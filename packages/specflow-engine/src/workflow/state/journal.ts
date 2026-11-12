import { sha256Hex } from '../../hash';
import { foldPathKey, validateDocumentPath } from '../../specs/document-rules/document-paths';
import { TASK_MANIFEST_FILE } from '../../tasks/resource/model';
import { WorkflowError } from '../errors';
import { isValidTaskId, JOURNAL_BYTES_MAX } from '../limits';

/**
 * Format of the local change journal of one Specification (`<stateRoot>/engine/operations/workflow/<specId>.json`).
 *
 * A change is written whole to the journal before any target file, so a crash between the files never
 * exposes half a change. Every write records the revision it replaces: a pending journal is only
 * honoured while each target still holds that revision or already the new state (the new text, or no
 * file for a removal). When the change is published the journal is removed.
 *
 * Targets: the Specification run (`.execution/specification.yaml`), a Task run record
 * (`.execution/tasks/<id>.yaml`), the Task index (`tasks/index.yaml`), a Task manifest
 * (`tasks/<id>/task.yaml`) and a file of a Task folder (`tasks/<id>/<path>`, the initial `task.md`
 * or a removal). Only Task targets can be removed (`text: null`).
 */

const JOURNAL_VERSION = 3;

export type JournalTarget =
  | { readonly target: 'specification' }
  | { readonly target: 'task-run'; readonly taskId: string }
  | { readonly target: 'task-index' }
  | { readonly target: 'task-manifest'; readonly taskId: string }
  | { readonly target: 'task-document'; readonly taskId: string; readonly path: string };

/**
 * `text`: the new content, `null` to remove the file. `expected`: sha256 of the text the write
 * replaces, `null` when the file did not exist.
 */
export type JournalWrite = JournalTarget & {
  readonly text: string | null;
  readonly expected: string | null;
};

export interface Journal {
  readonly version: number;
  readonly specId: string;
  readonly writes: readonly JournalWrite[];
}

export const revisionOf = (text: string | undefined): string | null =>
  text === undefined ? null : sha256Hex(text);

export function targetKey(target: JournalTarget): string {
  switch (target.target) {
    case 'specification':
    case 'task-index':
      return target.target;
    case 'task-run':
    case 'task-manifest':
      return `${target.target}:${target.taskId}`;
    case 'task-document':
      return `${target.target}:${target.taskId}:${foldPathKey(target.path)}`;
  }
}

/** A path of a Task document target: a portable document path below the folder, not the manifest. */
export const isTaskDocumentPath = (path: string): boolean =>
  validateDocumentPath(path).ok && foldPathKey(path) !== TASK_MANIFEST_FILE;

export function pendingJournal(specId: string, writes: readonly JournalWrite[]): Journal {
  return { version: JOURNAL_VERSION, specId, writes };
}

/** A target may be published when it still holds the planned-against revision or already the new state. */
export function holdsPlannedRevision(current: string | undefined, write: JournalWrite): boolean {
  return (
    (write.text === null ? current === undefined : current === write.text) ||
    revisionOf(current) === write.expected
  );
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
  const taskId = typeof write.taskId === 'string' && isValidTaskId(write.taskId);
  const removable = typeof write.text === 'string' || write.text === null;
  switch (write.target) {
    case 'specification':
    case 'task-index':
      return expected && typeof write.text === 'string';
    case 'task-run':
    case 'task-manifest':
      return expected && removable && taskId;
    case 'task-document':
      return (
        expected &&
        removable &&
        taskId &&
        typeof write.path === 'string' &&
        isTaskDocumentPath(write.path)
      );
    default:
      return false;
  }
}
