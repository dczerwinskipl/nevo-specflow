import type { ContentKind } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { mapBounded } from '../../concurrency';
import { sha256Hex } from '../../hash';
import { deriveUnclassifiedDocumentId } from '../document-rules/document-ids';
import { isEditable } from './content-kinds';
import { isReservedContainerPath, isRequiredDocument } from './changes/plan/container';
import { listSpecificationFiles } from './directory-scan';
import { loadDocumentContainer } from './loaded-specification';
import { observe } from './observation';
import { resolveReadOptions, type DocumentReadOptions } from './read-options';

const OBSERVATION_CONCURRENCY = 8;

/** One document of a Task as {@link readTaskDocuments} lists it. */
export interface TaskDocumentListing {
  readonly id: string;
  /** Relative to the Task folder. */
  readonly path: string;
  readonly type?: string;
  /** `unclassified`: a file in the Task folder its registry does not name (derived `u-` id). */
  readonly classification: 'registered' | 'unclassified';
  /** The required `task` document: it cannot be deleted or renamed. */
  readonly required: boolean;
  /** Absent for a registered document without a (readable) file. */
  readonly file?: {
    readonly kind: ContentKind;
    readonly mediaType: string;
    readonly size: number;
    /** The revision a save names as `expectedRevision`. */
    readonly revision: string;
    readonly editable: boolean;
  };
}

export interface TaskDocuments {
  readonly specId: string;
  readonly taskId: string;
  /** sha256 of the `task.yaml` bytes the registry was read from. */
  readonly registryRevision: string;
  /** False when the Specification is archived: nothing can be changed. */
  readonly writable: boolean;
  /** Registered documents in registry order, then unclassified files by path. */
  readonly documents: readonly TaskDocumentListing[];
}

/**
 * The documents of one Task (T5): its registry (`task.yaml` `documents[]`) and the files of its
 * folder, observed exactly like the planning snapshot observes them, so a listed `revision` is the
 * one a save compares. No lock, no Git. A Task the index does not list is `DOCUMENT_NOT_FOUND`.
 */
export async function readTaskDocuments(
  engine: SpecFlowEngine,
  specId: string,
  taskId: string,
  options: DocumentReadOptions = {},
): Promise<TaskDocuments> {
  const resolved = resolveReadOptions(options);
  const loaded = await loadDocumentContainer(engine, { kind: 'task', specId, taskId }, resolved.fs);
  const listed = await listSpecificationFiles(loaded.rootDir);
  const registered = loaded.manifest.documents;
  const registeredPaths = new Set(registered.map((document) => document.path));
  const unclassified = listed.paths
    .filter(
      (path) => !registeredPaths.has(path) && !isReservedContainerPath(loaded.container, path),
    )
    .sort();
  const observations = await mapBounded(
    [...registered.map((document) => document.path), ...unclassified],
    OBSERVATION_CONCURRENCY,
    (path) => observe(loaded, path, resolved),
  );
  const files = new Map(
    observations.flatMap((observation) =>
      observation.kind === 'file' ? [[observation.file.path, observation.file] as const] : [],
    ),
  );
  const writable = loaded.location === 'active';
  const fileOf = (path: string): TaskDocumentListing['file'] => {
    const file = files.get(path);

    return file === undefined
      ? undefined
      : {
          kind: file.kind,
          mediaType: file.mediaType,
          size: file.size,
          revision: file.revision,
          editable: writable && isEditable(file),
        };
  };

  const listing = (entry: Omit<TaskDocumentListing, 'file'>): TaskDocumentListing => {
    const file = fileOf(entry.path);

    return file === undefined ? entry : { ...entry, file };
  };

  return {
    specId,
    taskId,
    registryRevision: sha256Hex(loaded.manifestBytes),
    writable,
    documents: [
      ...registered.map((document) =>
        listing({
          id: document.id,
          path: document.path,
          type: document.type,
          classification: 'registered',
          required: isRequiredDocument(loaded.container, document),
        }),
      ),
      // A file that vanished since the listing is not reported.
      ...unclassified
        .filter((path) => files.has(path))
        .map((path) =>
          listing({
            id: deriveUnclassifiedDocumentId(path),
            path,
            classification: 'unclassified',
            required: false,
          }),
        ),
    ],
  };
}
