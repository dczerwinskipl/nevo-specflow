import { CATALOGUE_ID_PATTERN } from '@nevo/specflow-contracts/documents';

import {
  DocumentIdError,
  OVERVIEW_DOCUMENT_TYPE,
  allocateDocumentId,
  deriveUnclassifiedDocumentId,
  validateDocumentPath,
  validateFolderPath,
} from '../../../document-rules';
import { foldPathKey } from '../../../document-rules/document-paths';
import type { ManifestDocument } from '../../../model';
import { TEXT_CONTENT_MAX_BYTES } from '../../limits';
import { documentChangeError } from '../errors';
import {
  CREATE_DOCUMENTS_MAX_FILES,
  CREATE_DOCUMENTS_MAX_FOLDERS,
  CREATE_DOCUMENTS_MAX_TOTAL_BYTES,
} from '../limits';
import {
  assertWritable,
  collides,
  compareFolded,
  finishPlan,
  newDraft,
  occupancyAfter,
  stateOfText,
  type Occupancy,
  type PlanResult,
} from './draft';
import type { CreateRequest, FolderRequest } from './request';
import type { PlanningOptions, PlanningSnapshot } from './snapshot';

const CATALOGUE_ID = new RegExp(CATALOGUE_ID_PATTERN, 'u');

/**
 * Plan of a create: new files (content or rendered templates), registry entries for the typed ones
 * and explicit folders. Ids are allocated deterministically in request order, so a replay of the same
 * request on the same registry allocates the same ids.
 */
export function planCreate(
  snapshot: PlanningSnapshot,
  request: CreateRequest,
  options: PlanningOptions = {},
): PlanResult {
  assertWritable(snapshot);
  const documents = request.documents;
  if (documents.length === 0 && request.folders.length === 0) {
    throw documentChangeError('operation-invalid', 'Nothing to create.');
  }
  if (
    documents.length > CREATE_DOCUMENTS_MAX_FILES ||
    request.folders.length > CREATE_DOCUMENTS_MAX_FOLDERS
  ) {
    throw documentChangeError('limit-exceeded', 'Too many documents or folders in one request.');
  }
  let total = 0;
  for (const entry of documents) {
    const bytes = Buffer.byteLength(entry.content, 'utf8');
    if (bytes > TEXT_CONTENT_MAX_BYTES) {
      throw documentChangeError('too-large', 'A document exceeds the content limit.');
    }
    total += bytes;
  }
  if (total > CREATE_DOCUMENTS_MAX_TOTAL_BYTES) {
    throw documentChangeError('too-large', 'The documents exceed the total content limit.');
  }
  assertTemplatePrecondition(request, options);

  const occupancy = occupancyAfter(snapshot, () => false);
  const claimed: Claimed = { files: new Set(), folders: new Set() };
  const registry: ManifestDocument[] = [...snapshot.manifest.documents];
  const ids = new Set(registry.map((entry) => entry.id));
  const draft = newDraft();

  for (const entry of documents) {
    const path = validateDocumentPath(entry.path);
    if (!path.ok) throw documentChangeError('path-invalid', 'The document path is not allowed.');
    if (!entry.content.isWellFormed()) {
      throw documentChangeError('operation-invalid', 'The content is not well-formed text.');
    }
    assertFree(occupancy, claimed, entry.path, 'file');
    const post = stateOfText(entry.content);
    draft.writes.push({ path: entry.path, pre: null, post, content: entry.content });
    if (entry.templateId !== undefined) {
      draft.templates.push({
        path: entry.path,
        templateId: entry.templateId,
        sha256: post.sha256,
      });
    }
    if (entry.type === undefined) {
      // Created unclassified: a file with no registry entry; its id is derived from the path and
      // the result still reports it, like a rename of an unclassified file does.
      draft.documents.push({
        id: deriveUnclassifiedDocumentId(entry.path),
        path: entry.path,
        ...post,
      });
      continue;
    }
    if (!CATALOGUE_ID.test(entry.type)) {
      throw documentChangeError('type-invalid', 'The document type id is not valid.');
    }
    if (entry.type === OVERVIEW_DOCUMENT_TYPE) {
      throw documentChangeError('operation-invalid', 'The overview type cannot be added.');
    }
    const id = allocate(snapshot.manifest.specId, entry.type, registry.length, ids);
    ids.add(id);
    registry.push({ id, path: entry.path, type: entry.type });
    draft.allocatedIds.push(id);
    draft.documents.push({ id, path: entry.path, type: entry.type, ...post });
  }

  const explicit = [...snapshot.manifest.folders];
  for (const folder of request.folders) {
    if (!validateFolderPath(folder).ok) {
      throw documentChangeError('path-invalid', 'The folder path is not allowed.');
    }
    assertFree(occupancy, claimed, folder, 'folder');
    explicit.push(folder);
    draft.folders.push(folder);
  }
  if (registry.length !== snapshot.manifest.documents.length || draft.folders.length > 0) {
    draft.registry = { documents: registry, folders: explicit.sort(compareFolded) };
  }
  return finishPlan(snapshot, 'create', draft);
}

/** Plan of a folder create: the registry's `folders` gains the path; no file changes. */
export function planFolder(snapshot: PlanningSnapshot, request: FolderRequest): PlanResult {
  assertWritable(snapshot);
  if (!validateFolderPath(request.path).ok) {
    throw documentChangeError('path-invalid', 'The folder path is not allowed.');
  }
  assertFree(
    occupancyAfter(snapshot, () => false),
    { files: new Set(), folders: new Set() },
    request.path,
    'folder',
  );
  const draft = newDraft();
  draft.folders.push(request.path);
  draft.registry = {
    documents: [...snapshot.manifest.documents],
    folders: [...snapshot.manifest.folders, request.path].sort(compareFolded),
  };
  return finishPlan(snapshot, 'folder', draft);
}

interface Claimed {
  readonly files: Set<string>;
  readonly folders: Set<string>;
}

/** A name that neither exists nor was already taken by an earlier entry of the same request. */
function assertFree(
  occupancy: Occupancy,
  claimed: Claimed,
  path: string,
  kind: 'file' | 'folder',
): void {
  const key = foldPathKey(path);
  const conflict = (): Error =>
    documentChangeError('path-conflict', 'The path already exists or collides.');
  if (collides(occupancy, path) || claimed.files.has(key) || claimed.folders.has(key)) {
    throw conflict();
  }
  // A file of the request is never a folder of another path of the request.
  for (const file of claimed.files) {
    if (key.startsWith(file + '/')) throw conflict();
  }
  if (kind === 'file') {
    for (const taken of [...claimed.files, ...claimed.folders]) {
      if (taken.startsWith(key + '/')) throw conflict();
    }
  }
  (kind === 'file' ? claimed.files : claimed.folders).add(key);
}

function allocate(
  specId: string,
  type: string,
  position: number,
  existingIds: ReadonlySet<string>,
): string {
  try {
    return allocateDocumentId({ specId, type, position, existingIds });
  } catch (error) {
    if (error instanceof DocumentIdError) {
      throw documentChangeError('operation-invalid', 'The document type cannot be registered.');
    }
    throw error;
  }
}

function assertTemplatePrecondition(request: CreateRequest, options: PlanningOptions): void {
  if (!request.documents.some((entry) => entry.templateId !== undefined)) return;
  if (request.catalogueRevision === undefined) {
    throw documentChangeError('operation-invalid', 'A template create needs a catalogue revision.');
  }
  if (
    options.currentCatalogueRevision !== undefined &&
    options.currentCatalogueRevision !== request.catalogueRevision
  ) {
    throw documentChangeError('catalogue-stale', 'The catalogue changed since it was read.');
  }
}
