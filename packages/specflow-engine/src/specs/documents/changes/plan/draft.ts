import { sha256Hex } from '../../../../hash';
import { deriveUnclassifiedDocumentId } from '../../../document-rules';
import {
  ancestorFolders,
  deriveFolders,
  foldPathKey,
} from '../../../document-rules/document-paths';
import { aliasedPhysicalPath } from '../../../document-rules/verified-file';
import { SpecificationError, type ManifestDocument } from '../../../model';
import { updateManifestRegistry } from '../../../manifest-serializer';
import { documentChangeError } from '../errors';
import { DOCUMENT_BATCH_MAX_PATHS } from '../limits';
import type {
  DocumentChangeAction,
  DocumentChangePlan,
  FileState,
  PlanPayload,
  PlannedDocument,
  PlannedPath,
  PlannedTemplate,
} from './model';
import { DOCUMENT_CHANGE_PLAN_VERSION } from './model';
import type { ObservedFile, PlanningSnapshot } from './snapshot';

/** What a planner returns: the plan and the content the writer must make durable first. */
export interface PlanResult {
  readonly plan: DocumentChangePlan;
  readonly payloads: readonly PlanPayload[];
}

export function stateOfText(content: string): { sha256: string; bytes: number } {
  return { sha256: sha256Hex(content), bytes: Buffer.byteLength(content, 'utf8') };
}

export function stateOfFile(file: ObservedFile): FileState {
  return { sha256: file.sha256, bytes: file.bytes };
}

/** A path the operation writes: new content (`content`) or the bytes of a path it removes (`movedFrom`). */
export interface DraftWrite {
  readonly path: string;
  readonly pre: FileState;
  readonly post: { readonly sha256: string; readonly bytes: number };
  readonly content?: string;
  readonly movedFrom?: string;
}

export interface DraftRemoval {
  readonly path: string;
  readonly pre: FileState;
}

/** The mutable result of a planner before it is assembled into a plan. */
export interface Draft {
  readonly writes: DraftWrite[];
  readonly removals: DraftRemoval[];
  readonly documents: PlannedDocument[];
  readonly removedDocumentIds: string[];
  readonly folders: string[];
  readonly allocatedIds: string[];
  readonly templates: PlannedTemplate[];
  /** The registry after the operation; `undefined` leaves the manifest as it is. */
  registry?: { documents: ManifestDocument[]; folders: string[] };
  /** A folder delete: the folder it removes. */
  removedFolder?: string;
}

export function newDraft(): Draft {
  return {
    writes: [],
    removals: [],
    documents: [],
    removedDocumentIds: [],
    folders: [],
    allocatedIds: [],
    templates: [],
  };
}

export function specDirectory(snapshot: PlanningSnapshot): string {
  return 'specs/active/' + snapshot.manifest.slug;
}

/** The refusal for an archived Specification; every action calls it first. */
export function assertWritable(snapshot: PlanningSnapshot): void {
  if (snapshot.manifest.location !== 'active') {
    throw documentChangeError('archived', 'The Specification is archived and read-only.');
  }
}

/** A registered document, or the unclassified file whose derived id this is. */
export type ResolvedDocument =
  | { readonly kind: 'registered'; readonly entry: ManifestDocument; readonly file?: ObservedFile }
  | { readonly kind: 'unclassified'; readonly id: string; readonly file: ObservedFile };

export function resolveDocument(
  snapshot: PlanningSnapshot,
  documentId: string,
): ResolvedDocument | undefined {
  const entry = snapshot.manifest.documents.find((candidate) => candidate.id === documentId);
  if (entry !== undefined) {
    return {
      kind: 'registered',
      entry,
      file: snapshot.files.find((file) => file.path === entry.path),
    };
  }

  const registered = new Set(snapshot.manifest.documents.map((item) => item.path));
  for (const file of snapshot.files) {
    if (!registered.has(file.path) && deriveUnclassifiedDocumentId(file.path) === documentId) {
      return { kind: 'unclassified', id: documentId, file };
    }
  }

  return undefined;
}

/** Every path and folder name the Specification occupies, minus what an operation vacates. */
export interface Occupancy {
  /** Fold keys of files (observed and registered) that stay. */
  readonly files: ReadonlySet<string>;
  /** Fold keys of folders that stay (derived from the remaining files plus remaining explicit ones). */
  readonly folders: ReadonlySet<string>;
}

export function occupancyAfter(
  snapshot: PlanningSnapshot,
  vacated: (path: string) => boolean,
  vacatedFolder: (folder: string) => boolean = () => false,
): Occupancy {
  const filePaths = new Set<string>();
  for (const file of snapshot.files) {
    if (!vacated(file.path)) {
      filePaths.add(file.path);
    }
  }

  for (const entry of snapshot.manifest.documents) {
    if (!vacated(entry.path)) {
      filePaths.add(entry.path);
    }
  }

  const explicit = snapshot.manifest.folders.filter((folder) => !vacatedFolder(folder));

  return {
    files: new Set([...filePaths].map(foldPathKey)),
    folders: new Set(deriveFolders([...filePaths], explicit).map(foldPathKey)),
  };
}

/**
 * Whether `path` (a file or a folder) cannot be created: a file or folder of that name exists
 * ignoring case, or one of its ancestors is a file.
 */
export function collides(occupancy: Occupancy, path: string): boolean {
  const key = foldPathKey(path);
  if (occupancy.files.has(key) || occupancy.folders.has(key)) {
    return true;
  }

  return ancestorFolders(path + '/x').some((ancestor) =>
    occupancy.files.has(foldPathKey(ancestor)),
  );
}

export function compareFolded(left: string, right: string): number {
  const a = foldPathKey(left);
  const b = foldPathKey(right);
  if (a !== b) {
    return a < b ? -1 : 1;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Assembles a draft into a plan. Paths are listed in write order: creations and replacements, then
 * removals, then the manifest. The manifest is rewritten from the current text, so everything the
 * registry rewrite preserves is preserved; when the rewrite changes nothing the manifest is not a
 * planned path at all.
 */
export function finishPlan(
  snapshot: PlanningSnapshot,
  action: DocumentChangeAction,
  draft: Draft,
): PlanResult {
  const directory = specDirectory(snapshot);
  const full = (path: string): string => directory + '/' + path;
  const paths: PlannedPath[] = [];
  const payloads = new Map<string, PlanPayload>();

  for (const write of draft.writes) {
    if (write.movedFrom !== undefined) {
      paths.push({
        path: full(write.path),
        role: 'document',
        pre: write.pre,
        post: write.post,
        source: { kind: 'moved-from', path: full(write.movedFrom) },
      });
    } else {
      paths.push({
        path: full(write.path),
        role: 'document',
        pre: write.pre,
        post: write.post,
        source: { kind: 'payload' },
      });
      if (write.content !== undefined && !payloads.has(write.post.sha256)) {
        payloads.set(write.post.sha256, { sha256: write.post.sha256, content: write.content });
      }
    }
  }

  for (const removal of draft.removals) {
    paths.push({
      path: full(removal.path),
      role: 'document',
      pre: removal.pre,
      post: null,
      source: { kind: 'none' },
    });
  }

  let registry: DocumentChangePlan['registry'];
  if (draft.registry !== undefined) {
    const text = renderManifest(snapshot, draft.registry);
    if (text !== snapshot.manifestText) {
      const post = stateOfText(text);
      paths.push({
        path: full('specification.yaml'),
        role: 'manifest',
        pre: stateOfText(snapshot.manifestText),
        post,
        source: { kind: 'payload' },
      });
      payloads.set(post.sha256, { sha256: post.sha256, content: text });
      registry = { documents: draft.registry.documents, folders: draft.registry.folders };
    }
  }

  // The paths are applied one after the other (writes before removals): two of them naming one file
  // would write it and then remove it. The planners refuse such requests with a precise cause first;
  // this guards everything they do not single out.
  if (aliasedPhysicalPath(paths.map((planned) => planned.path)) !== undefined) {
    throw documentChangeError('operation-invalid', 'The operation names one file twice.');
  }

  if (paths.length > DOCUMENT_BATCH_MAX_PATHS) {
    throw documentChangeError(
      'folder-expansion-limit',
      `The operation changes more than ${DOCUMENT_BATCH_MAX_PATHS} paths.`,
    );
  }

  const plan: DocumentChangePlan = {
    version: DOCUMENT_CHANGE_PLAN_VERSION,
    action,
    specId: snapshot.manifest.specId,
    slug: snapshot.manifest.slug,
    directory,
    paths,
    documents: draft.documents,
    removedDocumentIds: draft.removedDocumentIds,
    folders: draft.folders,
    allocatedIds: draft.allocatedIds,
    templates: draft.templates,
    ...(registry !== undefined ? { registry } : {}),
    ...(draft.removedFolder !== undefined ? { removedFolder: draft.removedFolder } : {}),
  };

  return { plan, payloads: [...payloads.values()] };
}

function renderManifest(
  snapshot: PlanningSnapshot,
  registry: { documents: ManifestDocument[]; folders: string[] },
): string {
  try {
    return updateManifestRegistry(
      snapshot.manifestText,
      snapshot.manifest.slug,
      snapshot.manifest.location,
      { documents: registry.documents, folders: registry.folders },
    );
  } catch (error) {
    // The strict parser refuses a registry that could not be read back (for example a second
    // overview type): the request asked for something the manifest cannot hold.
    if (error instanceof SpecificationError) {
      throw documentChangeError('operation-invalid', 'The registry cannot hold this change.');
    }

    throw error;
  }
}
