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

/** The folder of the journals below the Project Home state root. */
export const JOURNAL_FOLDER_SEGMENTS = ['engine', 'operations', 'workflow'] as const;

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
  /**
   * The content the write replaces (sha256 and size, `null` for no file), kept so the commit record
   * of a change finished after a crash names its real `pre` (see {@link JournalCommit}).
   */
  readonly pre?: { readonly sha256: string; readonly bytes: number } | null;
};

/**
 * How the change is recorded for its commit (`ExecutionStateCommits`): the document operation id and
 * the words, fixed before any file is written. The record is made from the journal BEFORE the journal
 * is removed and is idempotent by `operationId`, so a crash at any point records the change exactly
 * once, with its original `pre` (the next change finishes it).
 */
export interface JournalCommit {
  readonly operationId: string;
  readonly summary: string;
}

export interface Journal {
  readonly version: number;
  readonly specId: string;
  /** Absent only in a journal written without a commit policy (tests, hand-made journals). */
  readonly commit?: JournalCommit;
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

export function pendingJournal(
  specId: string,
  writes: readonly JournalWrite[],
  commit?: JournalCommit,
): Journal {
  return { version: JOURNAL_VERSION, specId, ...(commit ? { commit } : {}), writes };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function isJournalCommit(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const commit = value as Record<string, unknown>;

  return (
    Object.keys(commit).length === 2 &&
    typeof commit.operationId === 'string' &&
    UUID.test(commit.operationId) &&
    typeof commit.summary === 'string' &&
    commit.summary.length > 0 &&
    commit.summary.length <= 200
  );
}

function isPreState(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== 'object') {
    return false;
  }

  const state = value as Record<string, unknown>;

  return (
    Object.keys(state).length === 2 &&
    typeof state.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(state.sha256) &&
    typeof state.bytes === 'number' &&
    Number.isSafeInteger(state.bytes) &&
    state.bytes >= 0
  );
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
      isJournalCommit(journal.commit) &&
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
  const pre = write.pre as { sha256: string } | null | undefined;
  const expected =
    isPreState(pre) &&
    (pre === undefined ||
      (pre === null ? write.expected === null : pre.sha256 === write.expected)) &&
    (write.expected === null ||
      (typeof write.expected === 'string' && /^[0-9a-f]{64}$/u.test(write.expected)));
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
