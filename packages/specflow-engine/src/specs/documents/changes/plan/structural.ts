import { CATALOGUE_ID_PATTERN } from '@nevo/specflow-contracts/documents';

import {
  DocumentIdError,
  OVERVIEW_DOCUMENT_TYPE,
  allocateDocumentId,
  deriveUnclassifiedDocumentId,
  isProtectedDocument,
  validateDocumentPath,
  validateFolderPath,
} from '../../../document-rules';
import { deriveFolders, foldPathKey, parentFolder } from '../../../document-rules/document-paths';
import { folderContainsProtectedDocument } from '../../../document-rules/protection';
import { samePhysicalPath } from '../../../document-rules/verified-file';
import type { ManifestDocument } from '../../../model';
import { CASE_ONLY_RENAME_MESSAGE, documentChangeError } from '../errors';
import {
  assertWritable,
  collides,
  compareFolded,
  finishPlan,
  newDraft,
  occupancyAfter,
  resolveDocument,
  stateOfFile,
  type PlanResult,
  type ResolvedDocument,
} from './draft';
import type {
  ClassifyRequest,
  DeleteRequest,
  MoveRequest,
  RenameRequest,
  StructuralRequest,
} from './request';
import type { ObservedFile, PlanningOptions, PlanningSnapshot } from './snapshot';

const CATALOGUE_ID = new RegExp(CATALOGUE_ID_PATTERN, 'u');

/** Plans rename, move, delete and classify of a document or (all but classify) a folder. */
export function planStructural(
  snapshot: PlanningSnapshot,
  request: StructuralRequest,
  options: PlanningOptions = {},
): PlanResult {
  assertWritable(snapshot);
  switch (request.action) {
    case 'classify':
      return planClassify(snapshot, request);
    case 'rename':
    case 'move':
    case 'delete':
      return request.target.kind === 'document'
        ? planDocumentOperation(snapshot, request, request.target.documentId)
        : planFolderOperation(snapshot, request, request.target.path, options);
    default: {
      const exhaustive: never = request;

      return exhaustive;
    }
  }
}

type PathOperation = RenameRequest | MoveRequest | DeleteRequest;

/** Where a path ends up after the operation; `undefined` for delete. */
function destinationOf(request: PathOperation, current: string): string | undefined {
  switch (request.action) {
    case 'delete':
      return undefined;
    case 'rename':
      return joinPath(parentFolder(current), singleSegment(request.name));
    case 'move':
      return joinPath(
        request.targetFolder === '' ? '' : validFolder(request.targetFolder),
        lastSegment(current),
      );
    default: {
      const exhaustive: never = request;

      return exhaustive;
    }
  }
}

/**
 * A rename or move that only changes the letter case of the path names the SAME file (or folder) on a
 * file system that ignores case: the plan writes the new path and then removes the old one, which
 * would remove the file. This is the fast path without I/O, for Windows; the authoritative check asks
 * the file system itself before anything is reserved or written (`write/physical-aliases.ts`), so any
 * other case-insensitive volume is refused there with the same error, and a case-sensitive one renames
 * it like any other path.
 */
function assertNotCaseOnlyRename(from: string, to: string): void {
  if (from !== to && samePhysicalPath(from, to)) {
    throw documentChangeError('case-only-rename', CASE_ONLY_RENAME_MESSAGE);
  }
}

function planDocumentOperation(
  snapshot: PlanningSnapshot,
  request: PathOperation,
  documentId: string,
): PlanResult {
  const document = requireDocument(snapshot, documentId);
  const path = pathOf(document);
  if (document.kind === 'registered' && isProtectedDocument(document.entry)) {
    throw documentChangeError('protected', 'The overview document cannot be changed this way.');
  }

  const draft = newDraft();
  const registry = [...snapshot.manifest.documents];
  const id = document.kind === 'registered' ? document.entry.id : document.id;
  const destination = destinationOf(request, path);

  if (destination === undefined) {
    // Delete. A registered document whose file is gone can be removed from the registry alone.
    if (document.file !== undefined) {
      assertRevision(document.file, request.expectedRevision);
      draft.removals.push({ path, pre: stateOfFile(document.file) });
    }

    draft.removedDocumentIds.push(id);
    if (document.kind === 'registered') {
      draft.registry = {
        documents: registry.filter((entry) => entry.id !== id),
        folders: [...snapshot.manifest.folders],
      };
    }

    return finishPlan(snapshot, 'delete', draft);
  }

  if (document.file === undefined) {
    throw documentChangeError('file-missing', 'The registered document has no file.');
  }

  assertRevision(document.file, request.expectedRevision);
  if (destination === path) {
    throw documentChangeError('operation-invalid', 'The document is already there.');
  }

  assertNotCaseOnlyRename(path, destination);
  if (!validateDocumentPath(destination).ok) {
    throw documentChangeError('path-invalid', 'The target path is not allowed.');
  }

  const occupancy = occupancyAfter(snapshot, (candidate) => candidate === path);
  if (collides(occupancy, destination)) {
    throw documentChangeError('path-conflict', 'The target path already exists or collides.');
  }

  const post = stateOfFile(document.file) as { sha256: string; bytes: number };
  draft.writes.push({ path: destination, pre: null, post, movedFrom: path });
  draft.removals.push({ path, pre: stateOfFile(document.file) });
  if (document.kind === 'registered') {
    draft.registry = {
      documents: registry.map((entry) =>
        entry.id === id ? { id: entry.id, path: destination, type: entry.type } : entry,
      ),
      folders: [...snapshot.manifest.folders],
    };
    draft.documents.push({
      id,
      path: destination,
      type: document.entry.type,
      ...post,
    });
  } else {
    // An unclassified file's id is derived from its path, so it changes with the path.
    draft.documents.push({
      id: deriveUnclassifiedDocumentId(destination),
      path: destination,
      ...post,
    });
    draft.removedDocumentIds.push(id);
  }

  return finishPlan(snapshot, request.action, draft);
}

function planClassify(snapshot: PlanningSnapshot, request: ClassifyRequest): PlanResult {
  const document = requireDocument(snapshot, request.documentId);
  if (document.kind === 'registered') {
    throw documentChangeError('already-classified', 'The document is already classified.');
  }

  if (!CATALOGUE_ID.test(request.type)) {
    throw documentChangeError('type-invalid', 'The document type id is not valid.');
  }

  if (request.type === OVERVIEW_DOCUMENT_TYPE) {
    throw documentChangeError('operation-invalid', 'The overview type cannot be assigned.');
  }

  assertRevision(document.file, request.expectedRevision);
  const registry = [...snapshot.manifest.documents];
  let id: string;
  try {
    id = allocateDocumentId({
      specId: snapshot.manifest.specId,
      type: request.type,
      position: registry.length,
      existingIds: registry.map((entry) => entry.id),
    });
  } catch (error) {
    if (error instanceof DocumentIdError) {
      throw documentChangeError('operation-invalid', 'The document type cannot be registered.');
    }

    throw error;
  }

  const draft = newDraft();
  draft.allocatedIds.push(id);
  draft.removedDocumentIds.push(document.id);
  draft.documents.push({
    id,
    path: document.file.path,
    type: request.type,
    sha256: document.file.sha256,
    bytes: document.file.bytes,
  });
  draft.registry = {
    documents: [...registry, { id, path: document.file.path, type: request.type }],
    folders: [...snapshot.manifest.folders],
  };

  return finishPlan(snapshot, 'classify', draft);
}

function planFolderOperation(
  snapshot: PlanningSnapshot,
  request: PathOperation,
  folder: string,
  options: PlanningOptions,
): PlanResult {
  if (!validateFolderPath(folder).ok) {
    throw documentChangeError('path-invalid', 'The folder path is not allowed.');
  }

  const allPaths = [
    ...snapshot.files.map((file) => file.path),
    ...snapshot.manifest.documents.map((entry) => entry.path),
  ];
  const known = new Set(deriveFolders(allPaths, snapshot.manifest.folders));
  if (!known.has(folder)) {
    throw documentChangeError('document-not-found', 'No such folder.');
  }

  if (options.folderRevision === undefined) {
    throw documentChangeError('operation-invalid', 'A folder revision is required.');
  }

  if (options.folderRevision(folder) !== request.expectedRevision) {
    throw documentChangeError('revision-conflict', 'The folder changed since it was read.');
  }

  const prefix = folder + '/';
  const under = (path: string): boolean => path.startsWith(prefix);
  if (
    snapshot.manifest.documents.some((entry) => under(entry.path) && isProtectedDocument(entry)) ||
    folderContainsProtectedDocument(folder)
  ) {
    throw documentChangeError('protected', 'The folder holds the overview document.');
  }

  const destination =
    request.action === 'delete'
      ? undefined
      : request.action === 'rename'
        ? joinPath(parentFolder(folder), singleSegment(request.name))
        : joinPath(
            request.targetFolder === '' ? '' : validFolder(request.targetFolder),
            lastSegment(folder),
          );
  if (destination !== undefined) {
    if (!validateFolderPath(destination).ok) {
      throw documentChangeError('path-invalid', 'The target folder is not allowed.');
    }

    if (destination === folder) {
      throw documentChangeError('operation-invalid', 'The folder is already there.');
    }

    assertNotCaseOnlyRename(folder, destination);
    if (foldPathKey(destination).startsWith(foldPathKey(folder) + '/')) {
      throw documentChangeError('operation-invalid', 'A folder cannot move into itself.');
    }

    const occupancy = occupancyAfter(
      snapshot,
      under,
      (candidate) => candidate === folder || under(candidate),
    );
    if (collides(occupancy, destination)) {
      throw documentChangeError('path-conflict', 'The target folder already exists or collides.');
    }
  }

  const draft = newDraft();
  if (destination === undefined) {
    draft.removedFolder = folder;
  }

  const rewrite = (path: string): string => (destination ?? '') + path.slice(folder.length);
  const registry: ManifestDocument[] = [];
  const registered = new Map(snapshot.manifest.documents.map((entry) => [entry.path, entry]));
  const moved: { from: string; to: string; file: ObservedFile }[] = [];
  for (const file of [...snapshot.files].sort((a, b) => compareFolded(a.path, b.path))) {
    if (!under(file.path)) {
      continue;
    }

    const entry = registered.get(file.path);
    if (destination === undefined) {
      draft.removals.push({ path: file.path, pre: stateOfFile(file) });
      draft.removedDocumentIds.push(entry?.id ?? deriveUnclassifiedDocumentId(file.path));
    } else {
      const to = rewrite(file.path);
      if (!validateDocumentPath(to).ok) {
        throw documentChangeError('path-invalid', 'A moved path is not allowed.');
      }

      moved.push({ from: file.path, to, file });
    }
  }

  for (const { from, to, file } of moved) {
    const post = stateOfFile(file) as { sha256: string; bytes: number };
    draft.writes.push({ path: to, pre: null, post, movedFrom: from });
    const entry = registered.get(from);
    draft.documents.push({
      id: entry?.id ?? deriveUnclassifiedDocumentId(to),
      path: to,
      ...(entry !== undefined ? { type: entry.type } : {}),
      ...post,
    });
    if (entry === undefined) {
      draft.removedDocumentIds.push(deriveUnclassifiedDocumentId(from));
    }
  }

  for (const { from, file } of moved) {
    draft.removals.push({ path: from, pre: stateOfFile(file) });
  }

  // Registry: entries below the folder follow it (or leave with a delete), including dangling ones.
  for (const entry of snapshot.manifest.documents) {
    if (!under(entry.path)) {
      registry.push(entry);
    } else if (destination !== undefined) {
      const to = rewrite(entry.path);
      if (!validateDocumentPath(to).ok) {
        throw documentChangeError('path-invalid', 'A moved path is not allowed.');
      }

      registry.push({ id: entry.id, path: to, type: entry.type });
    } else if (!draft.removedDocumentIds.includes(entry.id)) {
      draft.removedDocumentIds.push(entry.id);
    }
  }

  const explicit = snapshot.manifest.folders.flatMap((candidate): string[] => {
    if (candidate !== folder && !under(candidate)) {
      return [candidate];
    }

    return destination === undefined ? [] : [rewrite(candidate)];
  });
  if (destination !== undefined) {
    draft.folders.push(destination);
    // The destination stays a folder even when it holds no file (an empty folder that was moved).
    if (!moved.some((item) => item.to.startsWith(destination + '/'))) {
      explicit.push(destination);
    }
  }

  draft.registry = { documents: registry, folders: [...new Set(explicit)].sort(compareFolded) };

  return finishPlan(snapshot, request.action, draft);
}

function requireDocument(snapshot: PlanningSnapshot, documentId: string): ResolvedDocument {
  const document = resolveDocument(snapshot, documentId);
  if (document === undefined) {
    throw documentChangeError('document-not-found', 'No such document.');
  }

  return document;
}

function pathOf(document: ResolvedDocument): string {
  return document.kind === 'registered' ? document.entry.path : document.file.path;
}

function assertRevision(file: ObservedFile, expectedRevision: string): void {
  if (file.revision !== expectedRevision) {
    throw documentChangeError('revision-conflict', 'The document changed since it was read.');
  }
}

function singleSegment(name: string): string {
  if (name.length === 0 || name.includes('/')) {
    throw documentChangeError('path-invalid', 'A name is a single path segment.');
  }

  return name;
}

function validFolder(folder: string): string {
  if (!validateFolderPath(folder).ok) {
    throw documentChangeError('path-invalid', 'The target folder is not allowed.');
  }

  return folder;
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function joinPath(folder: string, name: string): string {
  return folder === '' ? name : folder + '/' + name;
}
