import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../hash';
import { writeJsonAtomically, writeTextAtomically } from '../../project/fs/atomic-json';
import { removeFileWindowsSafe } from '../../project/fs/windows-safe-fs';
import { isValidSpecificationId } from '../../specs/model';
import type { AttentionItem } from '../attention/model';
import { WorkflowError } from '../errors';
import { isValidTaskId } from '../limits';
import {
  parseAttention,
  parseSpecificationRecord,
  parseTaskRecord,
  serializeAttention,
  serializeSpecificationRecord,
  serializeTaskRecord,
} from './codec';
import { subjectKey } from './model';
import type { ExecutionChange, ExecutionSnapshot, Versioned, WorkflowStore } from './store';

/**
 * Filesystem {@link WorkflowStore}.
 *
 * - Canonical, Git-tracked: `<specification>/.execution/specification.yaml` and
 *   `<specification>/.execution/tasks/<taskId>.yaml`. The leading dot keeps the folder out of the
 *   Specification's document tree; it moves with the Specification on archive.
 * - Local: `<stateRoot>/engine/workflow/attention/<specId>.json` and the change journal
 *   `<stateRoot>/engine/operations/workflow/<specId>.json`.
 *
 * A change is first written whole to the journal, then to its files, then the journal is removed.
 * Reads overlay a pending journal and the next change finishes it, so a crash between the files
 * never exposes half a change. Every journal target records the revision it replaces: a pending
 * journal is only honoured while each target still holds that revision or already the new text, so
 * state changed outside the Engine (a branch switch, a hand edit) is never overwritten by a replay:
 * every read fails closed with `WORKFLOW_STATE_CONFLICT`, naming the journal file the owner deletes
 * by hand to keep the records as they are.
 *
 * Every record is checked against the codec while the change is built, before the journal is
 * written, so an invalid record is never stored. Stage files of an interrupted atomic write
 * (`.<name>.<uuid>.tmp`) are ignored by reads; the next change removes those in `.execution/`.
 *
 * In `.execution/tasks/` only `<name>.yaml` files that are not dot-files are records; every other
 * name (editor swap files, `Thumbs.db`, `desktop.ini`, `.gitkeep`, merge leftovers) is ignored. A
 * record name that is not a valid Task id still fails closed.
 */

export const EXECUTION_DIRECTORY = '.execution';
const SPECIFICATION_FILE = 'specification.yaml';
const TASKS_DIRECTORY = 'tasks';
const TASK_FILE_SUFFIX = '.yaml';
const JOURNAL_VERSION = 1;

export interface FilesystemWorkflowStoreOptions {
  /** `<home>/.nevo/local/state` of the Project Home. */
  readonly stateRoot: string;
  /** The verified directory of a Specification in the checkout that owns it. */
  readonly specificationDirectory: (specId: string) => Promise<string>;
}

/** `expected`: sha256 of the text the write replaces, `null` when the file did not exist. */
type JournalWrite = { readonly text: string; readonly expected: string | null } & (
  | { readonly target: 'specification' }
  | { readonly target: 'task'; readonly taskId: string }
  | { readonly target: 'attention' }
);

interface Journal {
  readonly version: number;
  readonly specId: string;
  readonly writes: readonly JournalWrite[];
}

/**
 * Stage file of `writeTextAtomically` (`.<name>.<uuid>.tmp`). A crash between its creation and the
 * rename leaves it behind; it is never a record (precedent: `isStrayJournalTempName`).
 */
const STAGE_FILE = /^\..+\.[0-9a-f-]{36}\.tmp$/iu;

const revisionOf = (text: string | undefined) => (text === undefined ? null : sha256Hex(text));

function isAbsent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isAbsent(error)) {
      return undefined;
    }

    throw error;
  }
}

async function listNames(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (isAbsent(error)) {
      return [];
    }

    throw error;
  }
}

function assertSpecId(specId: string): void {
  if (!isValidSpecificationId(specId)) {
    throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'Invalid Specification identity.');
  }
}

function versioned<T>(text: string, parse: (source: string) => T): Versioned<T> {
  return { value: parse(text), revision: sha256Hex(text) };
}

export function createFilesystemWorkflowStore(
  options: FilesystemWorkflowStoreOptions,
): WorkflowStore {
  const attentionDirectory = join(options.stateRoot, 'engine', 'workflow', 'attention');
  const journalDirectory = join(options.stateRoot, 'engine', 'operations', 'workflow');
  const attentionPath = (specId: string) => join(attentionDirectory, `${specId}.json`);
  const journalPath = (specId: string) => join(journalDirectory, `${specId}.json`);
  const executionDirectory = async (specId: string) =>
    join(await options.specificationDirectory(specId), EXECUTION_DIRECTORY);

  async function readJournal(specId: string): Promise<Journal | undefined> {
    const text = await readOptional(journalPath(specId));
    if (text === undefined) {
      return undefined;
    }

    try {
      const journal = JSON.parse(text) as Journal;
      if (
        journal.version === JOURNAL_VERSION &&
        journal.specId === specId &&
        Array.isArray(journal.writes) &&
        journal.writes.every(isJournalWrite)
      ) {
        return journal;
      }
    } catch {
      // Reported below: an unreadable journal is never skipped silently.
    }

    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The workflow change journal is not valid.');
  }

  /** The files as they are, without a pending journal. */
  async function readFiles(specId: string) {
    const directory = await executionDirectory(specId);
    const tasks = new Map<string, string>();
    for (const name of (await listNames(join(directory, TASKS_DIRECTORY))).sort()) {
      // Stage files are dot-files too.
      if (name.startsWith('.') || !name.endsWith(TASK_FILE_SUFFIX)) {
        continue;
      }

      const taskId = name.slice(0, -TASK_FILE_SUFFIX.length);
      if (!isValidTaskId(taskId)) {
        throw new WorkflowError(
          'WORKFLOW_STATE_CORRUPT',
          `Unexpected file "${name}" among the Tasks.`,
        );
      }

      const text = await readOptional(join(directory, TASKS_DIRECTORY, name));
      if (text !== undefined) {
        tasks.set(taskId, text);
      }
    }

    return {
      directory,
      specification: await readOptional(join(directory, SPECIFICATION_FILE)),
      tasks,
      attention: await readOptional(attentionPath(specId)),
    };
  }

  /**
   * The current state: the files with a pending journal laid over them. A journal whose targets no
   * longer hold the revision it was planned against (nor its new text) fails closed.
   */
  async function readTexts(specId: string) {
    const files = await readFiles(specId);
    const journal = await readJournal(specId);
    const tasks = new Map(files.tasks);
    let specification = files.specification;
    let attention = files.attention;
    if (journal && !replayable(files, journal)) {
      throw new WorkflowError(
        'WORKFLOW_STATE_CONFLICT',
        `The execution state changed outside the Engine while a change was pending, so the pending change is not applied. Delete the local journal "${journalPath(specId)}" to keep the records as they are.`,
      );
    }

    for (const write of journal?.writes ?? []) {
      if (write.target === 'specification') {
        specification = write.text;
      } else if (write.target === 'task') {
        tasks.set(write.taskId, write.text);
      } else {
        attention = write.text;
      }
    }

    return {
      directory: files.directory,
      specification,
      tasks: new Map([...tasks].sort(([left], [right]) => (left < right ? -1 : 1))),
      attention,
      journal,
    };
  }

  /**
   * Remove stage files a crashed atomic write left behind in `.execution/` (the Git-tracked folder).
   * Runs inside the control lock.
   */
  async function removeStageFiles(directory: string): Promise<void> {
    for (const folder of [directory, join(directory, TASKS_DIRECTORY)]) {
      for (const name of (await listNames(folder)).filter((entry) => STAGE_FILE.test(entry))) {
        await removeFileWindowsSafe(join(folder, name)).catch((error: unknown) => {
          if (!isAbsent(error)) {
            throw error;
          }
        });
      }
    }
  }

  async function publish(specId: string, directory: string, writes: readonly JournalWrite[]) {
    for (const write of writes) {
      if (write.target === 'specification') {
        await mkdir(directory, { recursive: true });
        await writeTextAtomically(join(directory, SPECIFICATION_FILE), write.text);
      } else if (write.target === 'task') {
        await mkdir(join(directory, TASKS_DIRECTORY), { recursive: true });
        await writeTextAtomically(
          join(directory, TASKS_DIRECTORY, `${write.taskId}${TASK_FILE_SUFFIX}`),
          write.text,
        );
      } else {
        await mkdir(attentionDirectory, { recursive: true });
        await writeTextAtomically(attentionPath(specId), write.text);
      }
    }

    await removeFileWindowsSafe(journalPath(specId)).catch((error: unknown) => {
      if (!isAbsent(error)) {
        throw error;
      }
    });
  }

  return {
    async read(specId): Promise<ExecutionSnapshot> {
      assertSpecId(specId);
      const texts = await readTexts(specId);

      return {
        ...(texts.specification !== undefined
          ? { specification: versioned(texts.specification, parseSpecificationRecord) }
          : {}),
        tasks: [...texts.tasks.values()].map((text) => versioned(text, parseTaskRecord)),
        attention: texts.attention !== undefined ? parseAttention(texts.attention) : [],
      };
    },

    async apply(specId, change: ExecutionChange): Promise<void> {
      assertSpecId(specId);
      const texts = await readTexts(specId);
      await removeStageFiles(texts.directory);
      if (texts.journal) {
        await publish(specId, texts.directory, texts.journal.writes);
      }

      const conflicts =
        (change.specification !== undefined &&
          revisionOf(texts.specification) !== change.specification.expected) ||
        change.tasks.some((write) => revisionOf(texts.tasks.get(write.taskId)) !== write.expected);
      if (conflicts) {
        throw new WorkflowError(
          'WORKFLOW_STATE_CONFLICT',
          'The execution state changed meanwhile.',
        );
      }

      // Serializing validates each record against the codec: nothing is written when one fails.
      const writes: JournalWrite[] = [
        ...(change.specification
          ? [
              {
                target: 'specification' as const,
                text: serializeSpecificationRecord(change.specification.next),
                expected: revisionOf(texts.specification),
              },
            ]
          : []),
        ...change.tasks.map((write) => {
          if (!isValidTaskId(write.taskId) || write.next.taskId !== write.taskId) {
            throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A Task write names another Task.');
          }

          return {
            target: 'task' as const,
            taskId: write.taskId,
            text: serializeTaskRecord(write.next),
            expected: revisionOf(texts.tasks.get(write.taskId)),
          };
        }),
      ];
      if (change.attention.set.length > 0 || change.attention.clear.length > 0) {
        const current = texts.attention !== undefined ? parseAttention(texts.attention) : [];
        writes.push({
          target: 'attention',
          text: serializeAttention(nextAttention(current, change)),
          expected: revisionOf(texts.attention),
        });
      }

      if (writes.length === 0) {
        return;
      }

      await mkdir(journalDirectory, { recursive: true });
      await writeJsonAtomically(journalPath(specId), { version: JOURNAL_VERSION, specId, writes });
      await publish(specId, texts.directory, writes);
    },
  };
}

/** Each target still holds the revision the journal was planned against, or already its new text. */
function replayable(
  files: {
    readonly specification: string | undefined;
    readonly tasks: ReadonlyMap<string, string>;
    readonly attention: string | undefined;
  },
  journal: Journal,
): boolean {
  return journal.writes.every((write) => {
    const current =
      write.target === 'specification'
        ? files.specification
        : write.target === 'task'
          ? files.tasks.get(write.taskId)
          : files.attention;

    return current === write.text || revisionOf(current) === write.expected;
  });
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

function nextAttention(
  current: readonly AttentionItem[],
  change: ExecutionChange,
): AttentionItem[] {
  const replaced = new Set([
    ...change.attention.clear,
    ...change.attention.set.map((item) => subjectKey(item.subject)),
  ]);

  return [
    ...current.filter((item) => !replaced.has(subjectKey(item.subject))),
    ...change.attention.set,
  ];
}
