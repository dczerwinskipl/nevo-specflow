import { join } from 'node:path';

import { sha256Hex } from '../../hash';
import { isValidSpecificationId } from '../../specs/model';
import type { AttentionItem } from '../attention/model';
import { WorkflowError } from '../errors';
import {
  ATTENTION_BYTES_MAX,
  isValidTaskId,
  JOURNAL_BYTES_MAX,
  RECORD_BYTES_MAX,
  TASKS_PER_SPECIFICATION_MAX,
} from '../limits';
import {
  parseAttention,
  parseSpecificationRecord,
  parseTaskRecord,
  serializeAttention,
  serializeSpecificationRecord,
  serializeTaskRecord,
} from './codec';
import {
  holdsPlannedRevision,
  parseJournal,
  pendingJournal,
  revisionOf,
  serializeJournal,
  type Journal,
  type JournalWrite,
} from './journal';
import { subjectKey, type TaskRecord } from './model';
import {
  listFolder,
  readRecordFile,
  readRecordFiles,
  removeRecordFile,
  removeStageFiles,
  writeRecordFile,
  type RecordFolder,
} from './record-files';
import type { ExecutionChange, ExecutionSnapshot, Versioned, WorkflowStore } from './store';
import { stateOfSnapshot, validateExecutionSnapshot } from './validate';

/**
 * Filesystem {@link WorkflowStore}.
 *
 * - Canonical, Git-tracked: `<specification>/.execution/specification.yaml` and
 *   `<specification>/.execution/tasks/<taskId>.yaml`. The leading dot keeps the folder out of the
 *   Specification's document tree; it moves with the Specification on archive.
 * - Local: `<stateRoot>/engine/workflow/attention/<specId>.json` and the change journal
 *   `<stateRoot>/engine/operations/workflow/<specId>.json` (`./journal.ts`).
 *
 * A change is first written whole to the journal, then to its files; then the journal is removed.
 * Reads overlay a pending journal and the next change finishes it, so a crash between the files
 * never exposes half a change. A pending journal is only honoured while each target still
 * holds the revision it was planned against or already the new text, and every target is checked
 * again right before it is published, so state changed outside the Engine (a branch switch, a hand
 * edit) is not overwritten: the change and every later read fail closed with
 * `WORKFLOW_STATE_CONFLICT`, naming the journal file the owner deletes by hand to keep the records
 * as they are. A conflict found in the middle of publishing leaves the journal pending; deleting it
 * by hand then keeps a partly applied change (only a concurrent external writer can cause it).
 *
 * Precondition: callers serialize the reads and changes of one Specification. The store does not
 * lock; the operations hold the project control lock (cross-process) around every read and change,
 * so a read never sees a change in the middle of being published.
 *
 * Every read and every change checks the identity of the records (a Task file holds the Task it is
 * named after, every record belongs to the Specification), their coherence
 * ({@link validateExecutionSnapshot}), the folders and files (`./record-files.ts`: no links, size
 * bounds) and the number of Tasks; a change is checked whole before its journal is written, so an
 * invalid record is never stored.
 *
 * In `.execution/tasks/` only `<name>.yaml` files that are not dot-files are records; every other
 * name (editor swap files, `Thumbs.db`, `desktop.ini`, `.gitkeep`, merge leftovers) is ignored. A
 * record name that is not a valid Task id still fails closed. Stage files of an interrupted atomic
 * write of a known record (`.<record>.<uuid>.tmp`) are ignored by reads and removed by the next
 * change; other dot-files are left alone.
 */

export const EXECUTION_DIRECTORY = '.execution';
const SPECIFICATION_FILE = 'specification.yaml';
const TASKS_DIRECTORY = 'tasks';
const TASK_FILE_SUFFIX = '.yaml';

export interface FilesystemWorkflowStoreOptions {
  /** `<home>/.nevo/local/state` of the Project Home. */
  readonly stateRoot: string;
  /** The verified directory of a Specification in the checkout that owns it. */
  readonly specificationDirectory: (specId: string) => Promise<string>;
}

interface Texts {
  readonly specification: string | undefined;
  readonly tasks: ReadonlyMap<string, string>;
  readonly attention: string | undefined;
}

interface LoadedState {
  readonly folders: Folders;
  /** The current texts: the files with a pending journal laid over them. */
  readonly texts: Texts;
  readonly journal: Journal | undefined;
  readonly snapshot: ExecutionSnapshot;
}

interface Folders {
  readonly execution: RecordFolder;
  readonly tasks: RecordFolder;
  readonly attention: RecordFolder;
  readonly journal: RecordFolder;
}

function assertSpecId(specId: string): void {
  if (!isValidSpecificationId(specId)) {
    throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'Invalid Specification identity.');
  }
}

const taskFileName = (taskId: string) => `${taskId}${TASK_FILE_SUFFIX}`;
const isTaskFileName = (name: string) =>
  name.endsWith(TASK_FILE_SUFFIX) && isValidTaskId(name.slice(0, -TASK_FILE_SUFFIX.length));

function versioned<T>(text: string, parse: (source: string) => T): Versioned<T> {
  return { value: parse(text), revision: sha256Hex(text) };
}

function currentText(texts: Texts, write: JournalWrite): string | undefined {
  return write.target === 'specification'
    ? texts.specification
    : write.target === 'task'
      ? texts.tasks.get(write.taskId)
      : texts.attention;
}

export function createFilesystemWorkflowStore(
  options: FilesystemWorkflowStoreOptions,
): WorkflowStore {
  return createStore(options, () => Promise.resolve());
}

/**
 * Tests only, not exported from the package: {@link createFilesystemWorkflowStore} that runs
 * `beforePublishTarget` before each target is published, so a test can interleave another writer.
 */
export function createFilesystemWorkflowStoreForTest(
  options: FilesystemWorkflowStoreOptions,
  beforePublishTarget: (write: JournalWrite) => Promise<void>,
): WorkflowStore {
  return createStore(options, beforePublishTarget);
}

function createStore(
  options: FilesystemWorkflowStoreOptions,
  beforePublishTarget: (write: JournalWrite) => Promise<void>,
): WorkflowStore {
  const stateFolder = (...segments: string[]): RecordFolder => ({
    root: options.stateRoot,
    segments,
  });
  /** The attention list and the journal of a Specification share its local file name. */
  const stateFileName = (specId: string) => `${specId}.json`;

  async function foldersOf(specId: string): Promise<Folders> {
    const root = await options.specificationDirectory(specId);

    return {
      execution: { root, segments: [EXECUTION_DIRECTORY] },
      tasks: { root, segments: [EXECUTION_DIRECTORY, TASKS_DIRECTORY] },
      attention: stateFolder('engine', 'workflow', 'attention'),
      journal: stateFolder('engine', 'operations', 'workflow'),
    };
  }

  /** The files as they are, without a pending journal. */
  async function readFiles(specId: string, folders: Folders): Promise<Texts> {
    const tasks = new Map<string, string>();
    // Stage files are dot-files too.
    const names = (await listFolder(folders.tasks))
      .filter((name) => !name.startsWith('.') && name.endsWith(TASK_FILE_SUFFIX))
      .sort();
    for (const name of names) {
      if (!isTaskFileName(name)) {
        throw new WorkflowError(
          'WORKFLOW_STATE_CORRUPT',
          `Unexpected file "${name}" among the Tasks.`,
        );
      }
    }

    if (names.length > TASKS_PER_SPECIFICATION_MAX) {
      throw new WorkflowError(
        'WORKFLOW_STATE_CORRUPT',
        'The Specification holds more Task records than it may have.',
      );
    }

    for (const [name, text] of await readRecordFiles(folders.tasks, names, RECORD_BYTES_MAX)) {
      tasks.set(name.slice(0, -TASK_FILE_SUFFIX.length), text);
    }

    return {
      specification: await readRecordFile(folders.execution, SPECIFICATION_FILE, RECORD_BYTES_MAX),
      tasks,
      attention: await readRecordFile(
        folders.attention,
        stateFileName(specId),
        ATTENTION_BYTES_MAX,
      ),
    };
  }

  const readJournalText = (specId: string, folders: Folders) =>
    readRecordFile(folders.journal, stateFileName(specId), JOURNAL_BYTES_MAX);

  function conflictWithJournal(specId: string, folders: Folders): WorkflowError {
    return new WorkflowError(
      'WORKFLOW_STATE_CONFLICT',
      `The execution state changed outside the Engine while a change was pending, so the pending change is not applied. Delete the local journal "${join(options.stateRoot, ...folders.journal.segments, stateFileName(specId))}" to keep the records as they are.`,
    );
  }

  function snapshotOf(specId: string, texts: Texts): ExecutionSnapshot {
    const tasks = [...texts.tasks]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([taskId, text]) => {
        const entry = versioned(text, parseTaskRecord);
        if (entry.value.taskId !== taskId) {
          throw new WorkflowError(
            'WORKFLOW_STATE_CORRUPT',
            `The Task record "${taskFileName(taskId)}" holds another Task.`,
          );
        }

        return entry;
      });
    const snapshot: ExecutionSnapshot = {
      ...(texts.specification !== undefined
        ? { specification: versioned(texts.specification, parseSpecificationRecord) }
        : {}),
      tasks,
      attention: texts.attention !== undefined ? parseAttention(texts.attention) : [],
    };
    validateExecutionSnapshot(specId, stateOfSnapshot(snapshot));

    return snapshot;
  }

  /** The current state: the files with a pending journal laid over them. */
  async function load(specId: string): Promise<LoadedState> {
    const folders = await foldersOf(specId);
    const journalText = await readJournalText(specId, folders);
    const journal = journalText === undefined ? undefined : parseJournal(journalText, specId);
    const files = await readFiles(specId, folders);
    const writes = journal?.writes ?? [];
    if (!writes.every((write) => holdsPlannedRevision(currentText(files, write), write))) {
      throw conflictWithJournal(specId, folders);
    }

    const tasks = new Map(files.tasks);
    let specification = files.specification;
    let attention = files.attention;
    for (const write of writes) {
      if (write.target === 'specification') {
        specification = write.text;
      } else if (write.target === 'task') {
        tasks.set(write.taskId, write.text);
      } else {
        attention = write.text;
      }
    }

    const texts = { specification, tasks, attention };

    return { folders, texts, journal, snapshot: snapshotOf(specId, texts) };
  }

  /** Publish the journal's writes, each only while its target still holds the planned revision. */
  async function publish(specId: string, folders: Folders, journal: Journal): Promise<void> {
    for (const write of journal.writes) {
      await beforePublishTarget(write);
      const [folder, name, maxBytes] =
        write.target === 'specification'
          ? [folders.execution, SPECIFICATION_FILE, RECORD_BYTES_MAX]
          : write.target === 'task'
            ? [folders.tasks, taskFileName(write.taskId), RECORD_BYTES_MAX]
            : [folders.attention, stateFileName(specId), ATTENTION_BYTES_MAX];
      if (!holdsPlannedRevision(await readRecordFile(folder, name, maxBytes), write)) {
        throw conflictWithJournal(specId, folders);
      }

      await writeRecordFile(folder, name, write.text);
    }

    await removeRecordFile(folders.journal, stateFileName(specId));
  }

  async function apply(specId: string, change: ExecutionChange): Promise<void> {
    const current = await load(specId);
    const { folders, texts } = current;
    await removeStageFiles(folders.execution, (name) => name === SPECIFICATION_FILE);
    await removeStageFiles(folders.tasks, isTaskFileName);
    if (current.journal) {
      await publish(specId, folders, current.journal);
    }

    const conflicts =
      (change.specification !== undefined &&
        revisionOf(texts.specification) !== change.specification.expected) ||
      change.tasks.some((write) => revisionOf(texts.tasks.get(write.taskId)) !== write.expected);
    if (conflicts) {
      throw new WorkflowError('WORKFLOW_STATE_CONFLICT', 'The execution state changed meanwhile.');
    }

    for (const write of change.tasks) {
      if (!isValidTaskId(write.taskId) || write.next.taskId !== write.taskId) {
        throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A Task write names another Task.');
      }
    }

    const changesAttention = change.attention.set.length > 0 || change.attention.clear.length > 0;
    const attention = nextAttention(current.snapshot.attention, change);
    const tasks = new Map<string, TaskRecord>(
      current.snapshot.tasks.map((entry) => [entry.value.taskId, entry.value]),
    );
    for (const write of change.tasks) {
      tasks.set(write.taskId, write.next);
    }

    const specification = change.specification?.next ?? current.snapshot.specification?.value;
    validateExecutionSnapshot(specId, {
      ...(specification ? { specification } : {}),
      tasks: [...tasks.values()],
      attention,
    });

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
      ...change.tasks.map((write) => ({
        target: 'task' as const,
        taskId: write.taskId,
        text: serializeTaskRecord(write.next),
        expected: revisionOf(texts.tasks.get(write.taskId)),
      })),
      ...(changesAttention
        ? [
            {
              target: 'attention' as const,
              text: serializeAttention(attention),
              expected: revisionOf(texts.attention),
            },
          ]
        : []),
    ];
    if (writes.length === 0) {
      return;
    }

    const journal = pendingJournal(specId, writes);
    await writeRecordFile(folders.journal, stateFileName(specId), serializeJournal(journal));
    await publish(specId, folders, journal);
  }

  return {
    async read(specId): Promise<ExecutionSnapshot> {
      assertSpecId(specId);

      return (await load(specId)).snapshot;
    },

    async apply(specId, change): Promise<void> {
      assertSpecId(specId);

      await apply(specId, change);
    },
  };
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
