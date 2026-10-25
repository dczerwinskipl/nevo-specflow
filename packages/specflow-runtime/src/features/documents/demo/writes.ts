import type {
  CreateDocumentsInput,
  DocumentErrorCode,
  DocumentErrorDetails,
  DocumentOperationInput,
} from '@nevo/specflow-contracts/documents';
import {
  DocumentError,
  OVERVIEW_DOCUMENT_TYPE,
  TEXT_CONTENT_MAX_BYTES,
  allocateDocumentId,
  isEditable,
  renderTemplate,
  templateValues,
  validateDocumentPath,
  validateFolderPath,
  type ResolvedCatalogue,
} from '@nevo/specflow-engine';
import {
  allFolders,
  ancestors,
  baseName,
  foldKey,
  joinPath,
  parentOf,
  textFile,
  within,
  type DemoFile,
  type DemoRegistryEntry,
  type DemoSpecDocuments,
} from './model';
import { demoTree, documentIdOf, locate, observe } from './projection';

/**
 * The demo emulation of the document write operations (D4 shapes of the contract). Every planner is
 * pure: it validates the whole request against the current directory and returns the complete next
 * state, so a refusal never leaves a partial change. The Engine's path, id, template and kind rules
 * are reused; the precise D4 Engine semantics do not exist yet (see the comments for the choices).
 */

const refuse = (code: DocumentErrorCode, message: string, details?: DocumentErrorDetails) =>
  new DocumentError(code, message, details);

/** Created and imported files are text the editor can open (`capabilities.formats`). */
const CREATABLE = /\.(md|txt)$/iu;
const MAX_CREATED_FILES = 10;
const MAX_CREATED_FOLDERS = 100;

export interface PlannedWrite {
  readonly registry: DemoRegistryEntry[];
  readonly files: Map<string, DemoFile>;
  readonly folders: string[];
  /** Paths of the documents the operation created, changed or moved (their ids are read after). */
  readonly affectedPaths: string[];
  /** Ids of the documents (and registrations) the operation removed. */
  readonly removedDocumentIds: string[];
}

/** Refuses any write the Specification cannot take now, with the reason the tree advertises. */
export function assertWritable(documents: DemoSpecDocuments): void {
  if (documents.location === 'archive')
    throw refuse('SPEC_ARCHIVED', 'The Specification is archived.', { reason: 'archived' });
  if (documents.policyReason === 'git-policy-invalid')
    throw refuse('GIT_POLICY_INVALID', 'The project Git policy is invalid.', {
      reason: 'git-policy-invalid',
    });
  if (documents.policyReason)
    throw refuse('BRANCH_PROTECTED', 'The Engine does not commit on this branch.', {
      reason: documents.policyReason,
    });
  if (documents.busy)
    throw refuse('SPEC_BUSY', 'Another write is in progress.', { reason: 'busy' });
}

function checkedFilePath(path: string): string {
  if (!validateDocumentPath(path).ok)
    throw refuse('DOCUMENT_PATH_INVALID', 'The path is not a valid document path.');
  return path;
}

function checkedFolderPath(path: string): string {
  if (!validateFolderPath(path).ok)
    throw refuse('DOCUMENT_PATH_INVALID', 'The path is not a valid folder path.');
  return path;
}

/** Every path of the directory a new entry must not reuse, ignoring case (files and folders). */
function takenPaths(files: Iterable<string>, folders: Iterable<string>) {
  const taken = new Set<string>();
  for (const path of files) taken.add(foldKey(path));
  for (const path of folders) taken.add(foldKey(path));
  return taken;
}

/**
 * Paths the registry lists whose file is missing (dangling). They stay taken: a new or moved file
 * there would give the path a second registration.
 */
function danglingPaths(documents: Pick<DemoSpecDocuments, 'files' | 'registry'>): string[] {
  return documents.registry
    .filter((entry) => !documents.files.has(entry.path))
    .map((entry) => entry.path);
}

/** A file path conflicts with a taken path, or with a file used as one of its folders. */
function assertFree(path: string, taken: ReadonlySet<string>, files: ReadonlySet<string>) {
  if (taken.has(foldKey(path)) || ancestors(path).some((folder) => files.has(foldKey(folder))))
    throw refuse('DOCUMENT_PATH_CONFLICT', 'The path conflicts with another entry.');
}

function documentType(catalogue: ResolvedCatalogue, type: string): string {
  // `overview` is the framework's own document; any other type must be in the catalogue.
  if (type === OVERVIEW_DOCUMENT_TYPE || !catalogue.findDocumentType(type))
    throw refuse('DOCUMENT_OPERATION_INVALID', 'The document type cannot be registered.');
  return type;
}

function register(
  documents: DemoSpecDocuments,
  registry: DemoRegistryEntry[],
  path: string,
  type: string,
) {
  registry.push({
    id: allocateDocumentId({
      specId: documents.allocationId,
      type,
      position: registry.length,
      existingIds: registry.map((entry) => entry.id),
    }),
    path,
    type,
  });
}

/** `PUT .../documents/:documentId`: the new bytes of one editable text document. */
export function planSave(
  documents: DemoSpecDocuments,
  documentId: string,
  input: { content: string; expectedRevision: string },
): PlannedWrite {
  const located = locate(documents, documentId);
  if (!located) throw refuse('DOCUMENT_NOT_FOUND', 'Unknown document.');
  if (located.kind === 'dangling')
    throw refuse('DOCUMENT_FILE_MISSING', 'The registered document has no file.', {
      reason: 'dangling',
    });
  if (!isEditable(observe(located.path, located.file)))
    throw refuse('DOCUMENT_NOT_EDITABLE', 'The document is not editable.', {
      reason: 'not-editable',
    });
  if (Buffer.byteLength(input.content, 'utf8') > TEXT_CONTENT_MAX_BYTES)
    throw refuse('DOCUMENT_TOO_LARGE', 'The content is above the save limit.');
  if (located.file.revision !== input.expectedRevision)
    throw refuse('DOCUMENT_REVISION_CONFLICT', 'The document changed since it was read.');
  const files = new Map(documents.files);
  files.set(located.path, textFile(input.content));
  return {
    registry: documents.registry,
    files,
    folders: documents.folders,
    affectedPaths: [located.path],
    removedDocumentIds: [],
  };
}

/**
 * `POST .../documents`: files from a template of the Specification's archetype or from content, plus
 * explicit folders. Choices: a template entry without `type` is registered with the template's
 * document type; a content entry without `type` is created unclassified. Created files are `md` or
 * `txt`.
 */
export function planCreate(
  documents: DemoSpecDocuments,
  catalogue: ResolvedCatalogue,
  input: Pick<CreateDocumentsInput, 'documents' | 'folders'>,
): PlannedWrite {
  const folders = input.folders ?? [];
  if (
    input.documents.length > MAX_CREATED_FILES ||
    folders.length > MAX_CREATED_FOLDERS ||
    (input.documents.length === 0 && folders.length === 0)
  )
    throw refuse('DOCUMENT_OPERATION_INVALID', 'The batch is empty or above the limits.');
  const fileKeys = new Set([...documents.files.keys()].map(foldKey));
  const taken = takenPaths(
    [...documents.files.keys(), ...danglingPaths(documents)],
    allFolders(documents),
  );
  const files = new Map(documents.files);
  const registry = [...documents.registry];
  const nextFolders = [...documents.folders];
  const values = templateValues({
    title: documents.title,
    slug: documents.slug,
    created: documents.created,
  });
  for (const folder of folders) {
    checkedFolderPath(folder);
    assertFree(folder, taken, fileKeys);
    taken.add(foldKey(folder));
    for (const ancestor of ancestors(folder + '/x')) taken.add(foldKey(ancestor));
    nextFolders.push(folder);
  }
  const affectedPaths: string[] = [];
  for (const entry of input.documents) {
    const path = checkedFilePath(entry.path);
    if (!CREATABLE.test(path))
      throw refuse('DOCUMENT_PATH_INVALID', 'Only md and txt documents can be created.');
    let content: string;
    let type = entry.type;
    if ('templateId' in entry) {
      const template = catalogue.findTemplate(documents.archetype.id, entry.templateId);
      if (!template) throw refuse('ARCHETYPE_UNKNOWN', 'Unknown template of the archetype.');
      content = renderTemplate(template.content, values);
      type ??= template.documentType;
    } else content = entry.content;
    if (Buffer.byteLength(content, 'utf8') > TEXT_CONTENT_MAX_BYTES)
      throw refuse('DOCUMENT_TOO_LARGE', 'The content is above the save limit.');
    assertFree(path, taken, fileKeys);
    taken.add(foldKey(path));
    fileKeys.add(foldKey(path));
    for (const ancestor of ancestors(path)) taken.add(foldKey(ancestor));
    files.set(path, textFile(content));
    if (type !== undefined) register(documents, registry, path, documentType(catalogue, type));
    affectedPaths.push(path);
  }
  return { registry, files, folders: nextFolders, affectedPaths, removedDocumentIds: [] };
}

function assertOperationShape(input: DocumentOperationInput) {
  const invalid =
    (input.kind === 'document') !== (input.documentId !== undefined) ||
    (input.kind === 'folder') !== (input.path !== undefined) ||
    (input.action === 'rename' &&
      (!input.name || input.name.includes('/') || input.targetFolder !== undefined)) ||
    (input.action === 'move' && (input.targetFolder === undefined || input.name !== undefined)) ||
    ((input.action === 'delete' || input.action === 'classify') &&
      (input.name !== undefined || input.targetFolder !== undefined)) ||
    (input.action === 'classify') !== (input.type !== undefined) ||
    (input.action === 'classify' && input.kind !== 'document');
  if (invalid) throw refuse('DOCUMENT_OPERATION_INVALID', 'Malformed operation.');
}

/**
 * `POST .../document-operations`: rename, move, delete, classify of a document (by id) or a folder
 * (by path). Choices: deleting a dangling entry removes its registration (its tree action); a
 * dangling entry has no revision, so its `expectedRevision` is the tree revision, like a folder.
 * Renaming or moving an unclassified file changes its derived `u-` id (returned in `documents`).
 */
export function planOperation(
  documents: DemoSpecDocuments,
  catalogue: ResolvedCatalogue,
  input: DocumentOperationInput,
): PlannedWrite {
  assertOperationShape(input);
  return input.kind === 'document'
    ? planDocumentOperation(documents, catalogue, input, input.documentId!)
    : planFolderOperation(documents, input, input.path!);
}

function planDocumentOperation(
  documents: DemoSpecDocuments,
  catalogue: ResolvedCatalogue,
  input: DocumentOperationInput,
  documentId: string,
): PlannedWrite {
  const located = locate(documents, documentId);
  if (!located) throw refuse('DOCUMENT_NOT_FOUND', 'Unknown document.');
  const isProtected = located.entry?.type === OVERVIEW_DOCUMENT_TYPE;
  if (located.kind === 'dangling') {
    if (input.action !== 'delete')
      throw refuse('DOCUMENT_FILE_MISSING', 'The registered document has no file.', {
        reason: 'dangling',
      });
    if (isProtected)
      throw refuse('DOCUMENT_PROTECTED', 'The overview cannot be removed.', {
        reason: 'protected',
      });
    if (demoTree(documents).revision !== input.expectedRevision)
      throw refuse('DOCUMENT_REVISION_CONFLICT', 'The tree changed since it was read.');
    return {
      registry: documents.registry.filter((candidate) => candidate !== located.entry),
      files: documents.files,
      folders: documents.folders,
      affectedPaths: [],
      removedDocumentIds: [located.entry.id],
    };
  }
  if (input.action === 'classify') {
    if (located.entry)
      throw refuse('DOCUMENT_ALREADY_CLASSIFIED', 'The document is already registered.');
  } else if (isProtected)
    throw refuse('DOCUMENT_PROTECTED', 'The overview cannot be deleted, renamed or moved.', {
      reason: 'protected',
    });
  if (located.file.revision !== input.expectedRevision)
    throw refuse('DOCUMENT_REVISION_CONFLICT', 'The document changed since it was read.');
  if (input.action === 'classify') {
    const registry = [...documents.registry];
    register(documents, registry, located.path, documentType(catalogue, input.type!));
    return {
      registry,
      files: documents.files,
      folders: documents.folders,
      affectedPaths: [located.path],
      removedDocumentIds: [],
    };
  }
  if (input.action === 'delete') {
    const files = new Map(documents.files);
    files.delete(located.path);
    return {
      registry: documents.registry.filter((candidate) => candidate.path !== located.path),
      files,
      folders: documents.folders,
      affectedPaths: [],
      removedDocumentIds: [located.id],
    };
  }
  const destination = checkedFilePath(
    input.action === 'rename'
      ? joinPath(parentOf(located.path), input.name!)
      : joinPath(targetFolder(documents, input.targetFolder!), baseName(located.path)),
  );
  return relocate(documents, (path) => (path === located.path ? destination : path), []);
}

function targetFolder(documents: DemoSpecDocuments, folder: string): string {
  if (folder !== '' && !allFolders(documents).includes(folder))
    throw refuse('DOCUMENT_PATH_INVALID', 'The target folder does not exist.');
  return folder;
}

function planFolderOperation(
  documents: DemoSpecDocuments,
  input: DocumentOperationInput,
  path: string,
): PlannedWrite {
  if (path === '')
    throw refuse('DOCUMENT_OPERATION_INVALID', 'The root folder cannot be changed.', {
      reason: 'root',
    });
  if (!allFolders(documents).includes(path)) throw refuse('DOCUMENT_NOT_FOUND', 'Unknown folder.');
  if (
    documents.registry.some(
      (entry) => entry.type === OVERVIEW_DOCUMENT_TYPE && within(entry.path, path),
    )
  )
    throw refuse('DOCUMENT_PROTECTED', 'The folder holds the overview.', { reason: 'protected' });
  if (demoTree(documents).revision !== input.expectedRevision)
    throw refuse('DOCUMENT_REVISION_CONFLICT', 'The tree changed since it was read.');
  if (input.action === 'delete') {
    const files = new Map([...documents.files].filter(([file]) => !within(file, path)));
    const removed = [...documents.files.keys()].filter((file) => within(file, path));
    // Registrations under the folder whose file is already missing go with it too.
    const dangling = documents.registry.filter(
      (entry) => !documents.files.has(entry.path) && within(entry.path, path),
    );
    return {
      registry: documents.registry.filter(
        (entry) => !removed.includes(entry.path) && !dangling.includes(entry),
      ),
      files,
      folders: documents.folders.filter((folder) => !within(folder, path)),
      affectedPaths: [],
      removedDocumentIds: [
        ...removed.map((file) => documentIdOf(documents, file)),
        ...dangling.map((entry) => entry.id),
      ],
    };
  }
  const destination = checkedFolderPath(
    input.action === 'rename'
      ? joinPath(parentOf(path), input.name!)
      : joinPath(targetFolder(documents, input.targetFolder!), baseName(path)),
  );
  if (within(destination, path) && foldKey(destination) !== foldKey(path))
    throw refuse('DOCUMENT_PATH_INVALID', 'A folder cannot move into itself.');
  const remap = (candidate: string) =>
    within(candidate, path) ? destination + candidate.slice(path.length) : candidate;
  return relocate(documents, remap, [path]);
}

/**
 * Moves every file (and explicit folder) `remap` changes, keeping registered ids. The result must be
 * conflict free ignoring case; `movedFolders` are the folders being renamed or moved themselves.
 */
function relocate(
  documents: DemoSpecDocuments,
  remap: (path: string) => string,
  movedFolders: readonly string[],
): PlannedWrite {
  const files = new Map<string, DemoFile>();
  const affectedPaths: string[] = [];
  for (const [path, file] of documents.files) {
    const next = remap(path);
    if (next !== path) affectedPaths.push(next);
    files.set(next, file);
  }
  const folders = documents.folders.map(remap);
  const keys = [...files.keys()].map(foldKey);
  if (new Set(keys).size !== keys.length || files.size !== documents.files.size)
    throw refuse('DOCUMENT_PATH_CONFLICT', 'The new path conflicts with another entry.');
  const folderKeys = new Set(allFolders({ files, folders }).map(foldKey));
  if (keys.some((key) => folderKeys.has(key)))
    throw refuse('DOCUMENT_PATH_CONFLICT', 'The new path conflicts with a folder.');
  // A dangling registration keeps its path: no file may land on it (it would be registered twice).
  const dangling = new Set(danglingPaths(documents).map((path) => foldKey(remap(path))));
  if (keys.some((key) => dangling.has(key)))
    throw refuse('DOCUMENT_PATH_CONFLICT', 'The new path is registered to a missing file.');
  for (const folder of movedFolders) {
    const next = remap(folder);
    const others = allFolders(documents).filter((candidate) => !within(candidate, folder));
    if (next !== folder && others.some((other) => foldKey(other) === foldKey(next)))
      throw refuse('DOCUMENT_PATH_CONFLICT', 'The new folder path is taken.');
  }
  return {
    registry: documents.registry.map((entry) => {
      const next = remap(entry.path);
      return next === entry.path ? entry : { ...entry, path: next };
    }),
    files,
    folders,
    affectedPaths,
    removedDocumentIds: [],
  };
}
