import { TASK_MAIN_DOCUMENT } from '@nevo/specflow-contracts/documents';

import {
  OVERVIEW_DOCUMENT_TYPE,
  isProtectedDocument,
  validateDocumentPath,
} from '../../../document-rules';
import { foldPathKey, isReservedSpecificationPath } from '../../../document-rules/document-paths';
import { folderContainsProtectedDocument } from '../../../document-rules/protection';
import type { ManifestDocument } from '../../../model';
import { parseTaskManifest, serializeTaskManifest } from '../../../../tasks/resource/codec';
import { TASK_MANIFEST_FILE, TASKS_FOLDER } from '../../../../tasks/resource/model';
import { WorkflowError } from '../../../../workflow/errors';
import { isValidTaskId } from '../../../../workflow/limits';
import { documentChangeError } from '../errors';

/**
 * Where a set of documents lives: the Specification itself, or one Task of it (D03, T5). Each
 * container has its own root folder and its own registry file; the documents layer reads, plans,
 * writes, journals and commits both the same way. Pure: the rules here read nothing.
 *
 * | Container       | Root (below the checkout)              | Registry file        | Required document          |
 * | --------------- | -------------------------------------- | -------------------- | -------------------------- |
 * | `specification` | `specs/active/<slug>`                  | `specification.yaml` | `overview` (`overview.md`) |
 * | `task`          | `specs/active/<slug>/tasks/<taskId>`   | `task.yaml`          | `task` (`task.md`)         |
 *
 * A Task container has no folders: a new document is a file directly in the Task folder, and the
 * actions are save, batch save, create (typed documents only), rename and delete of a document.
 */
export type DocumentContainer =
  { readonly kind: 'specification' } | { readonly kind: 'task'; readonly taskId: string };

export const SPECIFICATION_CONTAINER: DocumentContainer = { kind: 'specification' };

const SPECIFICATION_REGISTRY_FILE = 'specification.yaml';

/** The container's registry file name, in its root folder. */
export function registryFileOf(container: DocumentContainer): string {
  return container.kind === 'task' ? TASK_MANIFEST_FILE : SPECIFICATION_REGISTRY_FILE;
}

/** The container root relative to the Specification directory (`''` for the Specification). */
export function containerSubdirectory(container: DocumentContainer): string {
  return container.kind === 'task' ? `${TASKS_FOLDER}/${container.taskId}` : '';
}

/** The checkout-relative root of the container of an active Specification. */
export function containerDirectory(slug: string, container: DocumentContainer): string {
  const sub = containerSubdirectory(container);

  return 'specs/active/' + slug + (sub === '' ? '' : '/' + sub);
}

/** A Task id a container may name (the Task resource pattern). */
export function isTaskContainerId(taskId: string): boolean {
  return isValidTaskId(taskId);
}

/**
 * A path that is never a document of the container: for the Specification its reserved root names
 * and `tasks/`; for a Task the same names and its `task.yaml`.
 */
export function isReservedContainerPath(container: DocumentContainer, path: string): boolean {
  return (
    isReservedSpecificationPath(path) ||
    (container.kind === 'task' && foldPathKey(path) === TASK_MANIFEST_FILE)
  );
}

/** A document path the container may hold (the portable path rules plus the container's own). */
export function isContainerDocumentPath(container: DocumentContainer, path: string): boolean {
  return validateDocumentPath(path).ok && !isReservedContainerPath(container, path);
}

/**
 * Whether a create may put a document at `path`: a Task has no folders, so a new Task document is
 * a file directly in the Task folder. (A registered document below a folder, which the Task format
 * allows, can still be saved, renamed in place and deleted.)
 */
export function isCreatablePath(container: DocumentContainer, path: string): boolean {
  return (
    isContainerDocumentPath(container, path) && (container.kind !== 'task' || !path.includes('/'))
  );
}

/** The required document of the container, which cannot be deleted, renamed or moved. */
export function isRequiredDocument(
  container: DocumentContainer,
  document: { readonly id: string; readonly path?: string },
): boolean {
  if (container.kind === 'specification') {
    return isProtectedDocument(document);
  }

  return (
    document.id === TASK_MAIN_DOCUMENT.id ||
    (document.path !== undefined &&
      foldPathKey(document.path) === foldPathKey(TASK_MAIN_DOCUMENT.path))
  );
}

/** Whether deleting or moving `folder` would take the required document with it. */
export function folderHoldsRequiredDocument(container: DocumentContainer, folder: string): boolean {
  return container.kind === 'specification' && folderContainsProtectedDocument(folder);
}

/** The document type only the required document has; no other document may be given it. */
export function requiredDocumentType(container: DocumentContainer): string {
  return container.kind === 'task' ? TASK_MAIN_DOCUMENT.type : OVERVIEW_DOCUMENT_TYPE;
}

/** The message of the `protected` refusal. */
export function requiredDocumentMessage(container: DocumentContainer): string {
  return container.kind === 'task'
    ? 'The task document cannot be changed this way.'
    : 'The overview document cannot be changed this way.';
}

/**
 * The Task registry file after a change of its `documents[]`: the current `task.yaml` parsed with
 * the strict Task manifest parser, its registry replaced, and the result serialized and read back by
 * the same parser, so `task.yaml` stays a valid Task manifest. A document that the Task's context
 * names (`task-document`) cannot leave the registry. Everything else in the file is kept.
 */
export function renderTaskRegistry(
  manifestText: string,
  taskId: string,
  documents: readonly ManifestDocument[],
): string {
  let manifest;
  try {
    manifest = parseTaskManifest(manifestText, taskId);
  } catch (error) {
    if (error instanceof WorkflowError) {
      throw documentChangeError('source-unavailable', 'The Task manifest is not valid.');
    }

    throw error;
  }

  const ids = new Set(documents.map((document) => document.id));
  const named = (manifest.context ?? []).find(
    (entry) => entry.kind === 'task-document' && !ids.has(entry.id),
  );
  if (named !== undefined) {
    throw documentChangeError(
      'operation-invalid',
      "The document is part of the Task's context; remove it from the context first.",
    );
  }

  try {
    return serializeTaskManifest({
      ...manifest,
      documents: documents.map((document) => ({
        id: document.id,
        path: document.path,
        type: document.type,
      })),
    });
  } catch (error) {
    // The strict parser refuses a registry it could not read back (too many documents).
    if (error instanceof WorkflowError) {
      throw documentChangeError('operation-invalid', 'The Task registry cannot hold this change.');
    }

    throw error;
  }
}
