import { BATCH_SAVE_MAX_DOCUMENTS } from '@nevo/specflow-contracts/documents';

import { extensionOf, isEditableExtension } from '../../content-kinds';
import { TEXT_CONTENT_MAX_BYTES } from '../../limits';
import { documentChangeError } from '../errors';
import { BATCH_SAVE_MAX_TOTAL_BYTES } from '../limits';
import {
  assertWritable,
  finishPlan,
  newDraft,
  resolveDocument,
  stateOfFile,
  stateOfText,
  type PlanResult,
} from './draft';
import type { SaveAllEntry, SaveAllRequest, SaveRequest } from './request';
import type { ObservedFile, PlanningSnapshot } from './snapshot';

interface SaveTarget {
  readonly id: string;
  readonly type?: string;
  readonly file: ObservedFile;
}

/** Plan of a single save: one path, no registry change. */
export function planSave(snapshot: PlanningSnapshot, request: SaveRequest): PlanResult {
  assertWritable(snapshot);
  const target = saveTarget(snapshot, request);
  if (target.file.revision !== request.expectedRevision) {
    throw documentChangeError('revision-conflict', 'The document changed since it was read.');
  }
  return planSaves(snapshot, 'save', [{ target, content: request.content }]);
}

/**
 * Plan of a batch save. Every document is resolved and every `expectedRevision` is checked before a
 * plan exists; stale ones are reported together (the current revisions, at most 25).
 */
export function planSaveAll(snapshot: PlanningSnapshot, request: SaveAllRequest): PlanResult {
  assertWritable(snapshot);
  const entries = request.documents;
  if (entries.length < 1 || entries.length > BATCH_SAVE_MAX_DOCUMENTS) {
    throw documentChangeError(
      'limit-exceeded',
      `A batch save names 1 to ${BATCH_SAVE_MAX_DOCUMENTS} documents.`,
    );
  }
  if (new Set(entries.map((entry) => entry.documentId)).size !== entries.length) {
    throw documentChangeError('operation-invalid', 'A document appears twice in the batch.');
  }
  const total = entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.content, 'utf8'), 0);
  if (total > BATCH_SAVE_MAX_TOTAL_BYTES) {
    throw documentChangeError('too-large', 'The batch exceeds the total content limit.');
  }
  const resolved = entries.map((entry) => ({ entry, target: saveTarget(snapshot, entry) }));
  const conflicts = resolved
    .filter(({ entry, target }) => target.file.revision !== entry.expectedRevision)
    .map(({ target }) => ({ documentId: target.id, revision: target.file.revision }));
  if (conflicts.length > 0) {
    throw documentChangeError('revision-conflict', 'Documents changed since they were read.', {
      conflicts,
    });
  }
  return planSaves(
    snapshot,
    'save-all',
    resolved.map(({ entry, target }) => ({ target, content: entry.content })),
  );
}

function saveTarget(
  snapshot: PlanningSnapshot,
  entry: Pick<SaveAllEntry, 'documentId' | 'content'>,
): SaveTarget {
  const document = resolveDocument(snapshot, entry.documentId);
  if (document === undefined) {
    throw documentChangeError('document-not-found', 'No such document.');
  }
  if (document.file === undefined) {
    throw documentChangeError('file-missing', 'The registered document has no file.');
  }
  const path = document.kind === 'registered' ? document.entry.path : document.file.path;
  if (!isEditableExtension(extensionOf(path))) {
    throw documentChangeError('not-editable', 'This kind of file is not editable.');
  }
  if (Buffer.byteLength(entry.content, 'utf8') > TEXT_CONTENT_MAX_BYTES) {
    throw documentChangeError('too-large', 'The content exceeds the save limit.');
  }
  if (!entry.content.isWellFormed()) {
    throw documentChangeError('operation-invalid', 'The content is not well-formed text.');
  }
  return {
    id: document.kind === 'registered' ? document.entry.id : document.id,
    ...(document.kind === 'registered' ? { type: document.entry.type } : {}),
    file: document.file,
  };
}

function planSaves(
  snapshot: PlanningSnapshot,
  action: 'save' | 'save-all',
  saves: readonly { target: SaveTarget; content: string }[],
): PlanResult {
  const draft = newDraft();
  for (const { target, content } of saves) {
    const post = stateOfText(content);
    draft.writes.push({ path: target.file.path, pre: stateOfFile(target.file), post, content });
    draft.documents.push({
      id: target.id,
      path: target.file.path,
      ...(target.type !== undefined ? { type: target.type } : {}),
      ...post,
    });
  }
  return finishPlan(snapshot, action, draft);
}
