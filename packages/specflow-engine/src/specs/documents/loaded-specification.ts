import { join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { parseTaskIndex, parseTaskManifest } from '../../tasks/resource/codec';
import { TASK_INDEX_FILE, TASK_MANIFEST_FILE, TASKS_FOLDER } from '../../tasks/resource/model';
import { WorkflowError } from '../../workflow/errors';
import { RECORD_BYTES_MAX } from '../../workflow/limits';
import { readBoundedBytes } from '../bounded-read';
import { resolveSpecificationForRead } from '../discovery';
import {
  SpecificationError,
  parseSpecificationManifestText,
  type SpecificationLocation,
  type SpecificationManifest,
} from '../model';
import { deriveUnclassifiedDocumentId, isDerivedDocumentId } from '../document-rules/document-ids';
import { listSpecificationFiles } from './directory-scan';
import { DocumentError } from '../document-rules/errors';
import { MANIFEST_MAX_BYTES } from './limits';
import {
  assertCanonicalDirectory,
  openVerifiedFile,
  type VerifiedFs,
} from '../document-rules/verified-file';
import {
  SPECIFICATION_CONTAINER,
  containerSubdirectory,
  isReservedContainerPath,
  isTaskContainerId,
  registryFileOf,
  type DocumentContainer,
} from './changes/plan/container';
import type { RegistryManifest } from './changes/plan/snapshot';

const MANIFEST_NAME = 'specification.yaml';

/**
 * A document container (`./changes/plan/container.ts`) as one read found it: the Specification it
 * belongs to, its verified root folder and its registry file, read and parsed once.
 */
export interface LoadedDocumentContainer {
  readonly container: DocumentContainer;
  readonly specId: string;
  readonly slug: string;
  readonly location: SpecificationLocation;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  /** Canonical physical path of the Specification directory. */
  readonly specDir: string;
  /** Canonical physical path of the container root: the Specification directory or the Task folder. */
  readonly rootDir: string;
  /** The registry file in `rootDir` (`specification.yaml` or `task.yaml`). */
  readonly registryFile: string;
  readonly manifest: RegistryManifest;
  /** The exact bytes `manifest` was parsed from (read once). */
  readonly manifestBytes: Buffer;
}

export interface LoadedSpecification extends LoadedDocumentContainer {
  readonly container: { readonly kind: 'specification' };
  readonly manifest: SpecificationManifest;
}

/** The Specification itself, or the Task of it whose documents a request names. */
export type DocumentContainerRef =
  | { readonly kind: 'specification'; readonly specId: string }
  | { readonly kind: 'task'; readonly specId: string; readonly taskId: string };

export function isLoadedSpecification(
  loaded: LoadedDocumentContainer,
): loaded is LoadedSpecification {
  return loaded.container.kind === 'specification';
}

export function containerOfRef(ref: DocumentContainerRef): DocumentContainer {
  return ref.kind === 'task' ? { kind: 'task', taskId: ref.taskId } : SPECIFICATION_CONTAINER;
}

/**
 * Resolve the Specification, verify its directory and read + parse its manifest once.
 * `DOCUMENT_NOT_FOUND` for an unknown id, `SPEC_SOURCE_UNAVAILABLE` for an unavailable workspace,
 * a missing or redirected directory or a manifest that changed identity. An invalid manifest is a
 * `SpecificationError` (`SPEC_SOURCE_INVALID`), which transports treat as an unavailable source.
 */
export async function loadSpecification(
  engine: SpecFlowEngine,
  specId: string,
  fs: VerifiedFs,
): Promise<LoadedSpecification> {
  let discovered;
  try {
    discovered = await resolveSpecificationForRead(engine, specId);
  } catch (error) {
    // An id that cannot name a Specification is as unknown as one that names none.
    if (
      error instanceof SpecificationError &&
      (error.code === 'SPEC_NOT_FOUND' || error.code === 'SPEC_VALIDATION_ERROR')
    ) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', 'The Specification does not exist.');
    }

    throw error;
  }

  if (discovered.status !== 'available') {
    throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The Specification source is unavailable.');
  }

  const { specification, workspaceRoot, workspaceId } = discovered;
  const specDir = join(workspaceRoot, 'specs', specification.location, specification.slug);
  await assertCanonicalDirectory(fs, specDir);

  const opened = await openVerifiedFile(fs, specDir, MANIFEST_NAME);
  if (opened.state !== 'opened') {
    throw new DocumentError(
      'SPEC_SOURCE_UNAVAILABLE',
      'The Specification manifest is unavailable.',
    );
  }

  let manifestBytes: Buffer;
  try {
    manifestBytes = await readBoundedBytes(opened.handle, MANIFEST_MAX_BYTES);
  } finally {
    await opened.handle.close();
  }

  const manifest = parseSpecificationManifestText(
    manifestBytes.toString('utf8'),
    specification.slug,
    specification.location,
  );
  if (manifest.specId !== specId) {
    throw new DocumentError(
      'SPEC_SOURCE_UNAVAILABLE',
      'The Specification manifest changed while it was being read.',
    );
  }

  return {
    container: { kind: 'specification' },
    specId,
    slug: specification.slug,
    location: specification.location,
    workspaceId,
    workspaceRoot,
    specDir,
    rootDir: specDir,
    registryFile: MANIFEST_NAME,
    manifest,
    manifestBytes,
  };
}

/**
 * Resolve and read a document container once: {@link loadSpecification}, and for a Task also its
 * entry in `tasks/index.yaml`, its verified folder and its `task.yaml` (the strict Task parser). A
 * Task the index does not list is `DOCUMENT_NOT_FOUND`; a listed Task whose folder or manifest is
 * missing (dangling) or damaged is `SPEC_SOURCE_UNAVAILABLE`.
 */
export async function loadDocumentContainer(
  engine: SpecFlowEngine,
  ref: DocumentContainerRef,
  fs: VerifiedFs,
): Promise<LoadedDocumentContainer> {
  if (ref.kind === 'specification') {
    return loadSpecification(engine, ref.specId, fs);
  }

  if (!isTaskContainerId(ref.taskId)) {
    throw new DocumentError('DOCUMENT_NOT_FOUND', 'The Task does not exist.');
  }

  const specification = await loadSpecification(engine, ref.specId, fs);
  const container: DocumentContainer = { kind: 'task', taskId: ref.taskId };
  const indexBytes = await readTaskBytes(
    fs,
    specification.specDir,
    `${TASKS_FOLDER}/${TASK_INDEX_FILE}`,
  );
  const listed =
    indexBytes !== undefined &&
    taskResource(() => parseTaskIndex(indexBytes.toString('utf8'))).tasks.some(
      (entry) => entry.id === ref.taskId,
    );
  if (!listed) {
    throw new DocumentError('DOCUMENT_NOT_FOUND', 'The Task does not exist.');
  }

  const rootDir = join(specification.specDir, ...containerSubdirectory(container).split('/'));
  await assertCanonicalDirectory(fs, rootDir);
  const manifestBytes = await readTaskBytes(fs, rootDir, TASK_MANIFEST_FILE);
  if (manifestBytes === undefined) {
    throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The Task manifest is unavailable.');
  }

  const task = taskResource(() => parseTaskManifest(manifestBytes.toString('utf8'), ref.taskId));

  return {
    container,
    specId: specification.specId,
    slug: specification.slug,
    location: specification.location,
    workspaceId: specification.workspaceId,
    workspaceRoot: specification.workspaceRoot,
    specDir: specification.specDir,
    rootDir,
    registryFile: registryFileOf(container),
    manifest: {
      specId: specification.specId,
      slug: specification.slug,
      location: specification.location,
      documents: task.documents,
      folders: [],
    },
    manifestBytes,
  };
}

/** A Task resource file that does not parse makes the Task's documents unavailable. */
function taskResource<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof WorkflowError) {
      throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The Task resource files are not valid.');
    }

    throw error;
  }
}

/** The bytes of a Task resource file (`undefined` when absent), at most one byte over its budget. */
async function readTaskBytes(
  fs: VerifiedFs,
  directory: string,
  relativePath: string,
): Promise<Buffer | undefined> {
  const opened = await openVerifiedFile(fs, directory, relativePath);
  if (opened.state === 'absent') {
    return undefined;
  }

  if (opened.state !== 'opened') {
    throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'A Task resource file is unavailable.');
  }

  try {
    // One byte over the budget, so that an oversized file fails the parser instead of being cut.
    return await readBoundedBytes(opened.handle, RECORD_BYTES_MAX + 1);
  } finally {
    await opened.handle.close();
  }
}

interface LocatedDocument {
  readonly id: string;
  readonly path: string;
  readonly classification: 'registered' | 'unclassified';
  readonly type?: string;
}

/**
 * Find a document by id: a registry id from the manifest, or a derived `u-` id recomputed over the
 * listed files (a registered path never answers to a derived id). `DOCUMENT_NOT_FOUND` otherwise.
 */
export async function locateDocument(
  loaded: LoadedDocumentContainer,
  documentId: string,
): Promise<LocatedDocument> {
  const entry = loaded.manifest.documents.find((document) => document.id === documentId);
  if (entry) {
    return { id: entry.id, path: entry.path, classification: 'registered', type: entry.type };
  }

  if (isDerivedDocumentId(documentId)) {
    const registeredPaths = new Set(loaded.manifest.documents.map((document) => document.path));
    const listed = await listSpecificationFiles(loaded.rootDir);
    const matches = listed.paths.filter(
      (candidate) =>
        !registeredPaths.has(candidate) &&
        !isReservedContainerPath(loaded.container, candidate) &&
        deriveUnclassifiedDocumentId(candidate) === documentId,
    );
    // Two files with one derived id cannot happen in practice (128 bits); if it ever does, neither
    // is served rather than the wrong one.
    if (matches.length > 1) {
      throw new DocumentError(
        'SPEC_SOURCE_UNAVAILABLE',
        'Two files of the Specification derive the same document id.',
      );
    }

    const path = matches[0];
    if (path !== undefined) {
      return { id: documentId, path, classification: 'unclassified' };
    }
  }

  throw new DocumentError('DOCUMENT_NOT_FOUND', 'The document does not exist.');
}
