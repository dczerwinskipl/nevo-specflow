import type { Action, DocumentContent, DocumentTree } from '@nevo/specflow-contracts/documents';
import {
  DocumentError,
  TEXT_CONTENT_MAX_BYTES,
  classifyContent,
  deriveDocumentTitle,
  deriveUnclassifiedDocumentId,
  extensionOf,
  isEditable,
  projectDocumentTree,
  type ObservedFile,
} from '@nevo/specflow-engine';
import {
  decodeText,
  manifestBytes,
  type DemoFile,
  type DemoRegistryEntry,
  type DemoSpecDocuments,
} from './model';

/** Bytes the Engine inspects to tell text from binary. */
const SNIFF_BYTES = 8 * 1024;

export function observe(path: string, file: DemoFile): ObservedFile {
  const { kind, mediaType } = classifyContent(
    extensionOf(path),
    file.bytes.subarray(0, SNIFF_BYTES),
  );
  return { path, size: file.bytes.length, revision: file.revision, kind, mediaType };
}

/**
 * The demo emulates the write operations the real backend does not serve yet (D4): every write
 * action the Engine reports as `not-implemented` is available, or `busy` while a write commits. Every
 * stronger reason (`archived`, `protected`, `root`, the branch policy) is kept as the Engine says.
 */
function emulateWrites(action: Action, busy: boolean): Action {
  if (action.reason !== 'not-implemented') return action;
  return busy ? { available: false, reason: 'busy' } : { available: true };
}

/** The document tree of a demo Specification: the Engine's projection of the in-memory directory. */
export function demoTree(documents: DemoSpecDocuments): DocumentTree {
  const tree = projectDocumentTree({
    manifest: {
      archetype: documents.archetype,
      documents: documents.registry,
      folders: documents.folders,
    },
    ...(documents.archetypeTitle !== undefined ? { archetypeTitle: documents.archetypeTitle } : {}),
    manifestBytes: manifestBytes(documents),
    location: documents.location,
    files: [...documents.files].map(([path, file]) => observe(path, file)),
    truncated: false,
    skippedEntries: 0,
    skippedPaths: [],
    archiveLimit: { exceeded: false },
    ...(documents.policyReason ? { policyReason: documents.policyReason } : {}),
  });
  const write = (action: Action) => emulateWrites(action, documents.busy);
  return {
    ...tree,
    // A commit in flight changes advisory reasons, so it changes the revision (and the ETag) too.
    revision: documents.busy ? tree.revision + '-busy' : tree.revision,
    folders: tree.folders.map((folder) => ({
      ...folder,
      actions: {
        rename: write(folder.actions.rename),
        move: write(folder.actions.move),
        delete: write(folder.actions.delete),
      },
    })),
    documents: tree.documents.map((document) => ({
      ...document,
      actions: {
        rename: write(document.actions.rename),
        move: write(document.actions.move),
        delete: write(document.actions.delete),
        classify: write(document.actions.classify),
      },
    })),
    dangling: tree.dangling.map((entry) => ({
      ...entry,
      actions: { delete: write(entry.actions.delete) },
    })),
    capabilities: {
      ...tree.capabilities,
      createFile: write(tree.capabilities.createFile),
      createFolder: write(tree.capabilities.createFolder),
      import: write(tree.capabilities.import),
      classify: write(tree.capabilities.classify),
    },
  };
}

export type LocatedDocument =
  | {
      readonly kind: 'file';
      readonly id: string;
      readonly path: string;
      readonly entry?: DemoRegistryEntry;
      readonly file: DemoFile;
    }
  | { readonly kind: 'dangling'; readonly entry: DemoRegistryEntry };

/**
 * A document by id, like the Engine: a registered id answers from the registry (dangling when its
 * file is absent); a `u-` id is recomputed over the files no registry entry names.
 */
export function locate(documents: DemoSpecDocuments, id: string): LocatedDocument | undefined {
  const entry = documents.registry.find((candidate) => candidate.id === id);
  if (entry) {
    const file = documents.files.get(entry.path);
    return file ? { kind: 'file', id, path: entry.path, entry, file } : { kind: 'dangling', entry };
  }
  if (!id.startsWith('u-')) return undefined;
  const registered = new Set(documents.registry.map((candidate) => candidate.path));
  for (const [path, file] of documents.files)
    if (!registered.has(path) && deriveUnclassifiedDocumentId(path) === id)
      return { kind: 'file', id, path, file };
  return undefined;
}

/** The id a file has now: its registry id, else the derived `u-` id of its path. */
export function documentIdOf(documents: Pick<DemoSpecDocuments, 'registry'>, path: string) {
  return (
    documents.registry.find((entry) => entry.path === path)?.id ??
    deriveUnclassifiedDocumentId(path)
  );
}

/** `GET .../documents/:documentId`: the real `DocumentContent` of a located file. */
export function demoContent(
  documents: DemoSpecDocuments,
  located: Extract<LocatedDocument, { kind: 'file' }>,
): DocumentContent {
  const observed = observe(located.path, located.file);
  if (observed.kind === 'text' && observed.size > TEXT_CONTENT_MAX_BYTES)
    throw new DocumentError('DOCUMENT_TOO_LARGE', 'The document is above the JSON read limit.');
  const text = observed.kind === 'text' ? decodeText(located.file.bytes) : undefined;
  return {
    id: located.id,
    path: located.path,
    title: deriveDocumentTitle(located.path, text),
    classification: located.entry ? 'registered' : 'unclassified',
    ...(located.entry ? { type: located.entry.type } : {}),
    kind: observed.kind,
    mediaType: observed.mediaType,
    size: observed.size,
    revision: observed.revision,
    editable: documents.location === 'active' && isEditable(observed),
    ...(text !== undefined ? { content: text } : {}),
  };
}
