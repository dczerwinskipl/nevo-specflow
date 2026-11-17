import type { DocumentContent, SaveResult } from '@nevo/specflow-contracts/documents';
import type { TaskDocumentTree } from '@nevo/specflow-contracts/tasks';
import {
  DocumentError,
  TEXT_CONTENT_MAX_BYTES,
  deriveDocumentTitle,
  isEditable,
} from '@nevo/specflow-engine';

import type { TaskDocumentSource } from '../task/task-document-source';
import { decodeText, sha256, textFile, type DemoFile } from './model';
import { observe } from './projection';

/** The registry of a Task's manifest (`task.yaml`) and its revision, as the demo workflow holds it. */
export interface DemoTaskManifest {
  readonly revision: string;
  readonly documents: readonly {
    readonly id: string;
    readonly path: string;
    readonly type: string;
  }[];
}

/** What the Task documents read from the demo workflow state (the in-memory execution store). */
export interface DemoTaskDocumentState {
  /** The manifest of a Task the Specification lists; `undefined` when there is none. */
  manifest(specId: string, taskId: string): Promise<DemoTaskManifest | undefined>;
  /** The text of a file of the Task folder (`task.md` as created, or as last saved). */
  text(specId: string, taskId: string, path: string): Promise<string | undefined>;
  /** Replaces the text of an existing file of the Task folder; it goes with the Task. */
  save(specId: string, taskId: string, path: string, text: string): Promise<void>;
}

/** One registered document of a type with its text, for the workflow's document gates. */
export interface DemoTypedDocument {
  readonly id: string;
  readonly present: boolean;
  readonly text?: string;
}

const MAIN_DOCUMENT_ID = 'task';
const notFound = () => new DocumentError('DOCUMENT_NOT_FOUND', 'Unknown document.');

/**
 * The documents of the demo Tasks (Task-scoped Documents): the registry is the Task manifest of the
 * demo workflow state and the files are its Task folders, so a save lives and goes with its Task.
 * Reads and saves follow the real contract (revisions, conflicts); adding, renaming, moving and
 * deleting Task documents is not part of the demo: the tree says so (`capabilities.organize`) and
 * the routes refuse it.
 */
export function createDemoTaskDocuments(state: DemoTaskDocumentState) {
  const manifest = async (specId: string, taskId: string) => {
    const found = await state.manifest(specId, taskId);
    if (!found) {
      throw notFound();
    }

    return found;
  };

  const fileOf = async (
    specId: string,
    taskId: string,
    path: string,
  ): Promise<DemoFile | undefined> => {
    const text = await state.text(specId, taskId, path);

    return text === undefined ? undefined : textFile(text);
  };

  const located = async (specId: string, taskId: string, documentId: string) => {
    const entry = (await manifest(specId, taskId)).documents.find(
      (candidate) => candidate.id === documentId,
    );
    if (!entry) {
      throw notFound();
    }

    const file = await fileOf(specId, taskId, entry.path);
    if (!file) {
      throw new DocumentError('DOCUMENT_FILE_MISSING', 'The registered document has no file.');
    }

    return { entry, file };
  };

  const content = (
    entry: { id: string; path: string; type: string },
    file: DemoFile,
  ): DocumentContent => {
    const observed = observe(entry.path, file);
    const text = observed.kind === 'text' ? decodeText(file.bytes) : undefined;

    return {
      id: entry.id,
      path: entry.path,
      title: deriveDocumentTitle(entry.path, text),
      classification: 'registered',
      type: entry.type,
      kind: observed.kind,
      mediaType: observed.mediaType,
      size: observed.size,
      revision: observed.revision,
      editable: isEditable(observed),
      ...(text !== undefined ? { content: text } : {}),
    };
  };

  const unsupported = () =>
    Promise.reject(
      new DocumentError(
        'DOCUMENT_OPERATION_INVALID',
        'The demo does not add, rename, move or delete Task documents.',
      ),
    );

  const source: TaskDocumentSource = {
    async tree(specId, taskId): Promise<TaskDocumentTree> {
      const registry = await manifest(specId, taskId);
      const documents = [];
      for (const entry of registry.documents) {
        const file = await fileOf(specId, taskId, entry.path);
        const observed = file ? observe(entry.path, file) : undefined;
        documents.push({
          id: entry.id,
          path: entry.path,
          type: entry.type,
          classification: 'registered' as const,
          required: entry.id === MAIN_DOCUMENT_ID,
          ...(observed
            ? {
                file: {
                  kind: observed.kind,
                  mediaType: observed.mediaType,
                  size: observed.size,
                  revision: observed.revision,
                  editable: isEditable(observed),
                },
              }
            : {}),
        });
      }

      // The demo saves Task documents; it does not add, rename, move or delete them.
      return {
        taskId,
        registryRevision: registry.revision,
        capabilities: { save: true, organize: false },
        documents,
      };
    },
    async read(specId, taskId, documentId, revision) {
      const { entry, file } = await located(specId, taskId, documentId);
      const read = content(entry, file);
      if (revision !== undefined && revision !== read.revision) {
        throw new DocumentError(
          'DOCUMENT_REVISION_UNAVAILABLE',
          'Only the current revision can be read.',
        );
      }

      return read;
    },
    async save(specId, taskId, documentId, input): Promise<SaveResult> {
      const { entry, file } = await located(specId, taskId, documentId);
      if (!isEditable(observe(entry.path, file))) {
        throw new DocumentError('DOCUMENT_NOT_EDITABLE', 'The document is not editable.');
      }

      if (Buffer.byteLength(input.content, 'utf8') > TEXT_CONTENT_MAX_BYTES) {
        throw new DocumentError('DOCUMENT_TOO_LARGE', 'The content is above the save limit.');
      }

      if (file.revision !== input.expectedRevision) {
        throw new DocumentError(
          'DOCUMENT_REVISION_CONFLICT',
          'The document changed since it was read.',
        );
      }

      const next = textFile(input.content);
      await state.save(specId, taskId, entry.path, input.content);

      return {
        operationId: input.operationId,
        document: { id: entry.id, path: entry.path, revision: next.revision, type: entry.type },
        // The demo commits at once, like auto-commit on.
        commit: {
          state: 'committed',
          sha: sha256(input.operationId + ':' + next.revision).slice(0, 40),
        },
      };
    },
    create: unsupported,
    operate: unsupported,
  };

  return {
    source,
    /** The `task.md` of a Task and its revision (`null` when it has no file). */
    async mainDocument(specId: string, taskId: string) {
      const registry = await state.manifest(specId, taskId);
      const entry = registry?.documents.find((candidate) => candidate.id === MAIN_DOCUMENT_ID);
      const file = entry && (await fileOf(specId, taskId, entry.path));

      return file && entry ? { id: entry.id, revision: file.revision } : null;
    },
    /** The registered documents of a type of a Task, with their text (document gates). */
    async documentsOfType(
      specId: string,
      taskId: string,
      type: string,
    ): Promise<readonly DemoTypedDocument[]> {
      const registry = await state.manifest(specId, taskId);
      const documents: DemoTypedDocument[] = [];
      for (const entry of registry?.documents.filter((candidate) => candidate.type === type) ??
        []) {
        const file = await fileOf(specId, taskId, entry.path);
        documents.push(
          file
            ? { id: entry.id, present: true, text: decodeText(file.bytes) }
            : { id: entry.id, present: false },
        );
      }

      return documents;
    },
  };
}

export type DemoTaskDocuments = ReturnType<typeof createDemoTaskDocuments>;
