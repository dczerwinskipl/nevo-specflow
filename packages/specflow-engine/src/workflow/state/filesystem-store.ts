import { join } from 'node:path';

import { sha256Hex } from '../../hash';
import { foldPathKey } from '../../specs/document-rules/document-paths';
import { TEXT_CONTENT_MAX_BYTES } from '../../specs/documents/limits';
import { isValidSpecificationId } from '../../specs/model';
import {
  parseTaskIndex,
  parseTaskManifest,
  serializeTaskIndex,
  serializeTaskManifest,
} from '../../tasks/resource/codec';
import {
  TASK_INDEX_FILE,
  TASK_MANIFEST_FILE,
  TASKS_FOLDER,
  type TaskManifest,
} from '../../tasks/resource/model';
import { WorkflowError } from '../errors';
import {
  isValidTaskId,
  JOURNAL_BYTES_MAX,
  RECORD_BYTES_MAX,
  TASKS_PER_SPECIFICATION_MAX,
} from '../limits';
import {
  parseSpecificationRecord,
  parseTaskRunRecord,
  serializeSpecificationRecord,
  serializeTaskRunRecord,
} from './codec';
import {
  JOURNAL_FOLDER_SEGMENTS,
  holdsPlannedRevision,
  isTaskDocumentPath,
  parseJournal,
  pendingJournal,
  revisionOf,
  serializeJournal,
  targetKey,
  type Journal,
  type JournalTarget,
  type JournalWrite,
} from './journal';
import {
  listFolder,
  listSubfolders,
  listTree,
  readRecordFile,
  readRecordFiles,
  removeEmptyTree,
  removeRecordFile,
  removeStageFiles,
  writeRecordFile,
  type RecordFolder,
} from './record-files';
import {
  TASK_FOLDER_FILES_LISTED,
  type ExecutionChange,
  type ExecutionSnapshot,
  type Versioned,
  type WorkflowStore,
} from './store';
import {
  assertChangeIdentity,
  assertNoNewIssues,
  nextExecutionState,
  stateOfSnapshot,
  validateExecutionState,
} from './validate';

/**
 * Filesystem {@link WorkflowStore}, the "Specification execution store".
 *
 * - Canonical, Git-tracked, next to the Specification:
 *   - `.execution/specification.yaml` (the Specification run) and `.execution/tasks/<taskId>.yaml`
 *     (Task run records). The leading dot keeps the folder out of the Specification's document tree;
 *   - `tasks/index.yaml` (which Tasks exist, in order) and `tasks/<taskId>/task.yaml` (the Task
 *     manifests), with the initial `tasks/<taskId>/task.md`. `tasks/` is reserved: the Specification
 *     documents never list it (`specs/document-rules/document-paths.ts`).
 * - Local: the change journal `<stateRoot>/engine/operations/workflow/<specId>.json` (`./journal.ts`).
 *
 * A change is first written whole to the journal, then to its files; then the journal is removed.
 * Reads overlay a pending journal and the next change finishes it, so a crash between the files
 * never exposes half a change. A pending journal is only honoured while each target still holds the
 * revision it was planned against or already its new state, and every target is checked again right
 * before it is published, so state changed outside the Engine (a branch switch, a hand edit) is not
 * overwritten: the change and every later read fail closed with `WORKFLOW_STATE_CONFLICT`, naming the
 * journal file the owner deletes by hand to keep the files as they are. A conflict found in the
 * middle of publishing leaves the journal pending; deleting it by hand then keeps a partly applied
 * change (only a concurrent external writer can cause it).
 *
 * Precondition: callers serialize the reads and changes of one Specification. The store does not
 * lock; the operations hold the project control lock (cross-process) around every read and change,
 * so a read never sees a change in the middle of being published.
 *
 * Every read checks each file strictly (the codecs), the identity of the records (a file holds the
 * record it is named after and the Specification it belongs to), the run histories, the folders and
 * files (`./record-files.ts`: no links, size bounds) and the number of Tasks; a damaged file fails the
 * read with `WORKFLOW_STATE_CORRUPT`. Inconsistencies between the Task files (a Task folder deleted
 * by hand, a run whose Task is gone) are reported as issues instead (`validateExecutionState`). A
 * change is checked whole before its journal is written: an invalid record, or a change that would
 * add an issue, writes nothing.
 *
 * In `.execution/tasks/` only `<name>.yaml` files that are not dot-files are records; below `tasks/`
 * only the index and plain directories named like a Task id are read. Every other name (editor swap
 * files, `Thumbs.db`, `.gitkeep`, merge leftovers) is ignored; a run record name that is not a valid
 * Task id still fails closed. Stage files of an interrupted atomic write of a known file
 * (`.<file>.<uuid>.tmp`) are ignored by reads and removed by the next change that touches the folder.
 */

export const EXECUTION_DIRECTORY = '.execution';
const SPECIFICATION_FILE = 'specification.yaml';
const RUNS_DIRECTORY = 'tasks';
const RUN_FILE_SUFFIX = '.yaml';

export interface FilesystemWorkflowStoreOptions {
  /** `<home>/.nevo/local/state` of the Project Home. */
  readonly stateRoot: string;
  /** The verified directory of a Specification in the checkout that owns it. */
  readonly specificationDirectory: (specId: string) => Promise<string>;
}

interface LoadedState {
  readonly folders: Folders;
  /** The current text of every target read, by `targetKey`: the files with the journal laid over. */
  readonly texts: ReadonlyMap<string, string>;
  readonly journal: Journal | undefined;
  readonly snapshot: ExecutionSnapshot;
}

interface Folders {
  readonly root: string;
  readonly execution: RecordFolder;
  readonly runs: RecordFolder;
  readonly tasks: RecordFolder;
  readonly journal: RecordFolder;
}

function assertSpecId(specId: string): void {
  if (!isValidSpecificationId(specId)) {
    throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'Invalid Specification identity.');
  }
}

const runFileName = (taskId: string) => `${taskId}${RUN_FILE_SUFFIX}`;
const isRunFileName = (name: string) =>
  name.endsWith(RUN_FILE_SUFFIX) && isValidTaskId(name.slice(0, -RUN_FILE_SUFFIX.length));
const SPECIFICATION: JournalTarget = { target: 'specification' };
const INDEX: JournalTarget = { target: 'task-index' };
const runTarget = (taskId: string): JournalTarget => ({ target: 'task-run', taskId });
const manifestTarget = (taskId: string): JournalTarget => ({ target: 'task-manifest', taskId });

function versioned<T>(text: string, parse: (source: string) => T): Versioned<T> {
  return { value: parse(text), revision: sha256Hex(text) };
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
  /** The local file name of a Specification's journal. */
  const stateFileName = (specId: string) => `${specId}.json`;

  async function foldersOf(specId: string): Promise<Folders> {
    const root = await options.specificationDirectory(specId);

    return {
      root,
      execution: { root, segments: [EXECUTION_DIRECTORY] },
      runs: { root, segments: [EXECUTION_DIRECTORY, RUNS_DIRECTORY] },
      tasks: { root, segments: [TASKS_FOLDER] },
      journal: { root: options.stateRoot, segments: [...JOURNAL_FOLDER_SEGMENTS] },
    };
  }

  const taskFolder = (folders: Folders, taskId: string): RecordFolder => ({
    root: folders.root,
    segments: [TASKS_FOLDER, taskId],
  });

  /** Where a target lives: its folder, its file name and the size bound of a read. */
  function locate(
    folders: Folders,
    target: JournalTarget,
  ): { folder: RecordFolder; name: string; maxBytes: number } {
    switch (target.target) {
      case 'specification':
        return { folder: folders.execution, name: SPECIFICATION_FILE, maxBytes: RECORD_BYTES_MAX };
      case 'task-run':
        return {
          folder: folders.runs,
          name: runFileName(target.taskId),
          maxBytes: RECORD_BYTES_MAX,
        };
      case 'task-index':
        return { folder: folders.tasks, name: TASK_INDEX_FILE, maxBytes: RECORD_BYTES_MAX };
      case 'task-manifest':
        return {
          folder: taskFolder(folders, target.taskId),
          name: TASK_MANIFEST_FILE,
          maxBytes: RECORD_BYTES_MAX,
        };
      case 'task-document': {
        const segments = target.path.split('/');
        const name = segments.pop() ?? target.path;

        return {
          folder: {
            root: folders.root,
            segments: [TASKS_FOLDER, target.taskId, ...segments],
          },
          name,
          maxBytes: TEXT_CONTENT_MAX_BYTES,
        };
      }
    }
  }

  async function readTarget(folders: Folders, target: JournalTarget): Promise<string | undefined> {
    const { folder, name, maxBytes } = locate(folders, target);

    return readRecordFile(folder, name, maxBytes);
  }

  /** The run records as they are, by Task id. */
  async function readRuns(folders: Folders): Promise<Map<string, string>> {
    // Stage files are dot-files too.
    const names = (await listFolder(folders.runs))
      .filter((name) => !name.startsWith('.') && name.endsWith(RUN_FILE_SUFFIX))
      .sort();
    for (const name of names) {
      if (!isRunFileName(name)) {
        throw new WorkflowError(
          'WORKFLOW_STATE_CORRUPT',
          `Unexpected file "${name}" among the Task runs.`,
        );
      }
    }

    if (names.length > TASKS_PER_SPECIFICATION_MAX) {
      throw new WorkflowError(
        'WORKFLOW_STATE_CORRUPT',
        'The Specification holds more Task run records than it may have.',
      );
    }

    const runs = new Map<string, string>();
    for (const [name, text] of await readRecordFiles(folders.runs, names, RECORD_BYTES_MAX)) {
      runs.set(name.slice(0, -RUN_FILE_SUFFIX.length), text);
    }

    return runs;
  }

  const readJournalText = (specId: string, folders: Folders) =>
    readRecordFile(folders.journal, stateFileName(specId), JOURNAL_BYTES_MAX);

  function conflictWithJournal(specId: string, folders: Folders): WorkflowError {
    return new WorkflowError(
      'WORKFLOW_STATE_CONFLICT',
      `The execution state changed outside the Engine while a change was pending, so the pending change is not applied. Delete the local journal "${join(options.stateRoot, ...folders.journal.segments, stateFileName(specId))}" to keep the files as they are.`,
    );
  }

  /** The current state: the files with a pending journal laid over them. */
  async function load(specId: string): Promise<LoadedState> {
    const folders = await foldersOf(specId);
    const journalText = await readJournalText(specId, folders);
    const journal = journalText === undefined ? undefined : parseJournal(journalText, specId);
    const writes = journal?.writes ?? [];
    for (const write of writes) {
      if (!holdsPlannedRevision(await readTarget(folders, write), write)) {
        throw conflictWithJournal(specId, folders);
      }
    }

    const pending = new Map(writes.map((write) => [targetKey(write), write.text]));
    const texts = new Map<string, string>();
    /** The current text of a target: the journal's when it writes the target, else the file's. */
    const current = (target: JournalTarget, fromFile?: string) => {
      const key = targetKey(target);
      const text = pending.has(key) ? (pending.get(key) ?? undefined) : fromFile;
      if (text !== undefined) {
        texts.set(key, text);
      }

      return text;
    };

    const files = await readRuns(folders);
    for (const write of writes) {
      if (write.target === 'task-run') {
        files.set(write.taskId, '');
      }
    }

    const runs: Versioned<ReturnType<typeof parseTaskRunRecord>>[] = [];
    for (const taskId of [...files.keys()].sort()) {
      const text = current(runTarget(taskId), files.get(taskId));
      if (text === undefined) {
        continue;
      }

      const entry = versioned(text, parseTaskRunRecord);
      if (entry.value.taskId !== taskId) {
        throw new WorkflowError(
          'WORKFLOW_STATE_CORRUPT',
          `The Task run record "${runFileName(taskId)}" holds another Task.`,
        );
      }

      runs.push(entry);
    }

    const specificationText = current(SPECIFICATION, await readTarget(folders, SPECIFICATION));
    const indexText = current(INDEX, await readTarget(folders, INDEX));
    const index = indexText === undefined ? undefined : versioned(indexText, parseTaskIndex);

    const manifests: Versioned<TaskManifest>[] = [];
    for (const { id } of index?.value.tasks ?? []) {
      const target = manifestTarget(id);
      const text = pending.has(targetKey(target))
        ? current(target)
        : current(target, await readTarget(folders, target));
      if (text !== undefined) {
        manifests.push(versioned(text, (source) => parseTaskManifest(source, id)));
      }
    }

    const folderNames = new Set(await listSubfolders(folders.tasks, isValidTaskId));
    for (const write of writes) {
      if (write.target === 'task-manifest' && write.text === null) {
        folderNames.delete(write.taskId);
      } else if (
        (write.target === 'task-manifest' || write.target === 'task-document') &&
        write.text !== null
      ) {
        folderNames.add(write.taskId);
      }
    }

    const snapshot: ExecutionSnapshot = {
      specId,
      ...(specificationText !== undefined
        ? { specification: versioned(specificationText, parseSpecificationRecord) }
        : {}),
      ...(index ? { index } : {}),
      manifests,
      runs,
      folders: [...folderNames].sort(),
      issues: [],
    };
    const issues = validateExecutionState(specId, stateOfSnapshot(snapshot));

    return { folders, texts, journal, snapshot: { ...snapshot, issues } };
  }

  /** Publish the journal's writes, each only while its target still holds the planned revision. */
  async function publish(specId: string, folders: Folders, journal: Journal): Promise<void> {
    for (const write of journal.writes) {
      await beforePublishTarget(write);
      const { folder, name } = locate(folders, write);
      if (!holdsPlannedRevision(await readTarget(folders, write), write)) {
        throw conflictWithJournal(specId, folders);
      }

      if (write.text === null) {
        await removeRecordFile(folder, name);
      } else {
        await writeRecordFile(folder, name, write.text);
      }
    }

    for (const write of journal.writes) {
      if (write.target === 'task-manifest' && write.text === null) {
        await removeEmptyTree(taskFolder(folders, write.taskId));
      }
    }

    await removeRecordFile(folders.journal, stateFileName(specId));
  }

  /** Remove the stage files of the folders the change touches. */
  async function removeStaleStageFiles(folders: Folders, change: ExecutionChange): Promise<void> {
    await removeStageFiles(folders.execution, (name) => name === SPECIFICATION_FILE);
    await removeStageFiles(folders.runs, isRunFileName);
    await removeStageFiles(folders.tasks, (name) => name === TASK_INDEX_FILE);
    const taskIds = new Set([
      ...(change.manifests ?? []).map((write) => write.taskId),
      ...(change.documents ?? []).map((write) => write.taskId),
    ]);
    for (const taskId of taskIds) {
      await removeStageFiles(
        taskFolder(folders, taskId),
        (name) => name === TASK_MANIFEST_FILE || isTaskDocumentPath(name),
      );
    }
  }

  async function apply(specId: string, change: ExecutionChange): Promise<void> {
    assertChangeIdentity(change);
    const current = await load(specId);
    const { folders, texts } = current;
    await removeStaleStageFiles(folders, change);
    if (current.journal) {
      await publish(specId, folders, current.journal);
    }

    // After the pending journal is published, a target's file holds its current state; texts that
    // were not read on load (a manifest of an unregistered folder, documents) are read now.
    const currentText = async (target: JournalTarget) =>
      texts.get(targetKey(target)) ??
      (target.target === 'specification' ||
      target.target === 'task-index' ||
      target.target === 'task-run'
        ? undefined
        : await readTarget(folders, target));

    const writes: JournalWrite[] = [];
    const plan = async (
      target: JournalTarget,
      expected: string | null,
      text: () => string | null,
    ) => {
      const before = await currentText(target);
      if (revisionOf(before) !== expected) {
        throw new WorkflowError(
          'WORKFLOW_STATE_CONFLICT',
          'The execution state changed meanwhile.',
        );
      }

      writes.push({ ...target, text: text(), expected });
    };

    if (change.specification) {
      const { next } = change.specification;
      await plan(SPECIFICATION, change.specification.expected, () =>
        serializeSpecificationRecord(next),
      );
    }

    if (change.index) {
      const { next } = change.index;
      await plan(INDEX, change.index.expected, () => serializeTaskIndex(next));
    }

    for (const write of change.manifests ?? []) {
      const { next } = write;
      await plan(manifestTarget(write.taskId), write.expected, () =>
        next === null ? null : serializeTaskManifest(next),
      );
    }

    for (const write of change.documents ?? []) {
      const target: JournalTarget = {
        target: 'task-document',
        taskId: write.taskId,
        path: write.path,
      };
      const before = await currentText(target);
      if (write.text !== null && before !== undefined) {
        // Not a concurrent writer: a file the snapshot does not show (for example the `task.md` left
        // in the folder of a dangling index entry) would be overwritten.
        throw new WorkflowError(
          'WORKFLOW_STATE_CORRUPT',
          `The Task folder holds "tasks/${write.taskId}/${write.path}" already, so the Task cannot be created there; restore its task.yaml or remove the file.`,
        );
      }

      if (write.text !== null || before !== undefined) {
        writes.push({ ...target, text: write.text, expected: revisionOf(before) });
      }
    }

    for (const write of change.runs ?? []) {
      const { next } = write;
      await plan(runTarget(write.taskId), write.expected, () => serializeTaskRunRecord(next));
    }

    // The whole state the change produces is checked before the journal exists.
    assertNoNewIssues(
      current.snapshot.issues,
      validateExecutionState(specId, nextExecutionState(stateOfSnapshot(current.snapshot), change)),
    );
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

    async taskFolderExists(specId, taskId): Promise<boolean> {
      assertSpecId(specId);
      const { folders, snapshot } = await load(specId);
      const names = [...(await listSubfolders(folders.tasks, () => true)), ...snapshot.folders];

      return names.some((name) => foldPathKey(name) === foldPathKey(taskId));
    },

    async taskFiles(specId, taskId): Promise<readonly string[]> {
      assertSpecId(specId);
      if (!isValidTaskId(taskId)) {
        throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'Invalid Task identity.');
      }

      const { folders, journal } = await load(specId);
      const files = new Map(
        (await listTree(taskFolder(folders, taskId), TASK_FOLDER_FILES_LISTED)).map(
          (path) => [foldPathKey(path), path] as const,
        ),
      );
      for (const write of journal?.writes ?? []) {
        const path =
          write.target === 'task-manifest' && write.taskId === taskId
            ? TASK_MANIFEST_FILE
            : write.target === 'task-document' && write.taskId === taskId
              ? write.path
              : undefined;
        if (path !== undefined && write.text === null) {
          files.delete(foldPathKey(path));
        } else if (path !== undefined) {
          files.set(foldPathKey(path), path);
        }
      }

      return [...files.values()].sort();
    },
  };
}
