import type {
  DemoDocumentOperationInput,
  DemoDocumentOperationResult,
  DemoDocumentsInput,
  DemoDocumentsResult,
  DemoDocumentTree,
  DemoFolderInput,
  DemoSaveInput,
} from '@nevo/specflow-contracts/demo';
import type { DemoSpecification } from '../../demo-catalogue';
import { DemoOperationError, type DemoDocument, type DemoState } from '../../../demo/state';
import { DocumentError } from '@nevo/specflow-engine';
import type { DocumentContentSource } from '../content/read-document';
import { demoDocumentContent } from './content';
import { DocumentPathConflict, InvalidDocumentPath, planDocumentAddition } from './addition';
import { buildDemoDocumentManifest } from './contribution';
import { demoShowcaseCollection, demoShowcaseSeedDocuments, demoShowcaseSpecId } from './showcase';
import { documentTree, planDocumentOperation } from './tree-operations';

interface DocumentCollection {
  documents: Map<string, DemoDocument>;
  folders: string[];
}

/** Path of a seeded (catalogue) document inside the demo document tree. */
const seedPath = (document: { id: string }) =>
  document.id === 'spec' ? 'specification.md' : document.id + '.md';

type Find = (specId: string) => Promise<DemoSpecification | undefined>;

/**
 * Documents-owned demo operations over the shared demo state: tree, add/import, rename/move/delete,
 * read and save with revisions, and the seeded showcase content. Created specifications keep their
 * documents inside the shared `state.specifications`; seeded specifications keep added documents in
 * this module's own collections.
 */
export function createDemoDocuments(
  state: DemoState,
  options: {
    showcase?: boolean;
    /** Told after a specification's document paths changed; wired by the demo composition root. */
    onPathsChanged?: (specId: string, paths: readonly string[]) => void;
  } = {},
) {
  const addedCollections = new Map<string, DocumentCollection>();
  if (options.showcase) addedCollections.set(demoShowcaseSpecId, demoShowcaseCollection());
  const requiredSeedDocuments = new Set(
    options.showcase ? [JSON.stringify([demoShowcaseSpecId, 'spec'])] : [],
  );
  const savedSeedDocuments = options.showcase
    ? demoShowcaseSeedDocuments()
    : new Map<string, DemoDocument>();

  const isRequiredSeed = (specId: string, documentId: string) =>
    requiredSeedDocuments.has(JSON.stringify([specId, documentId]));
  const plan = (
    files: string[],
    folders: string[],
    input: { documents: DemoDocumentsInput['documents']; folders?: string[] },
  ) => {
    try {
      return planDocumentAddition(files, folders, input.documents, input.folders ?? []);
    } catch (error) {
      if (error instanceof InvalidDocumentPath)
        throw new DemoOperationError(400, 'demo_invalid_selection');
      if (error instanceof DocumentPathConflict)
        throw new DemoOperationError(409, 'demo_document_path_conflict');
      throw error;
    }
  };
  const append = (documents: Map<string, DemoDocument>, added: DemoDocumentsInput['documents']) =>
    added.map((item) => {
      const documentId = 'document-' + state.id();
      documents.set(documentId, {
        id: documentId,
        title: item.title?.trim() ?? item.path.split('/').at(-1)!,
        filename: item.path,
        content: item.content,
        revision: '1',
      });
      return documentId;
    });
  const readDocument = (specId: string, documentId: string) =>
    state.specifications.get(specId)?.documents.get(documentId) ??
    addedCollections.get(specId)?.documents.get(documentId) ??
    savedSeedDocuments.get(JSON.stringify([specId, documentId]));
  const add = (
    subject: string,
    specId: string,
    input: DemoDocumentsInput,
    reservedPaths: string[] = [],
    operation = 'documents',
  ): DemoDocumentsResult => {
    const entry = state.request(subject, operation + ':' + specId, input);
    if (entry.result) return entry.result as DemoDocumentsResult;
    const collection: DocumentCollection = state.specifications.get(specId) ??
      addedCollections.get(specId) ?? { documents: new Map<string, DemoDocument>(), folders: [] };
    const next = plan(
      [
        ...reservedPaths,
        ...[...collection.documents.values()].map((document) => document.filename!),
      ],
      collection.folders,
      input,
    );
    const documentIds = append(collection.documents, next.documents);
    collection.folders = next.folders;
    if ('treeRevision' in collection && typeof collection.treeRevision === 'string')
      collection.treeRevision += '-next';
    if (!state.specifications.has(specId)) addedCollections.set(specId, collection);
    options.onPathsChanged?.(specId, [
      ...reservedPaths,
      ...[...collection.documents.values()].map((document) => document.filename!),
    ]);
    const result = { documentIds, folders: [...next.folders] };
    entry.result = result;
    return result;
  };
  const addFolder = (
    subject: string,
    specId: string,
    input: DemoFolderInput,
    reservedPaths: string[] = [],
  ) =>
    add(
      subject,
      specId,
      { requestId: input.requestId, documents: [], folders: [input.path] },
      reservedPaths,
      'folders',
    );
  const manifestPaths = (record: DemoSpecification) =>
    buildDemoDocumentManifest(record).map(seedPath);
  const reserved = (specId: string, record: DemoSpecification) =>
    state.specifications.has(specId) ? [] : manifestPaths(record);
  const documentListItem = (document: DemoDocument) => ({
    id: document.id,
    title: document.title,
    filename: document.filename,
    required: document.required,
    revision: document.revision,
    kind: 'markdown',
  });
  const createdTree = (specId: string): DemoDocumentTree => {
    const spec = state.specifications.get(specId);
    if (!spec) throw new DemoOperationError(409, 'demo_document_operations_unavailable');
    return documentTree(spec);
  };
  const seedTree = (specId: string, record: DemoSpecification): DemoDocumentTree => {
    const extra = addedCollections.get(specId);
    const blocked = { available: false, reason: 'demo_document_operations_unavailable' };
    const actions = { rename: blocked, move: blocked, delete: blocked };
    return {
      revision: 'seed',
      folders: ['', ...(extra?.folders ?? [])].map((path) => ({ path, actions })),
      documents: [
        ...buildDemoDocumentManifest(record).map((document) => ({
          id: document.id,
          path: seedPath(document),
          ...(isRequiredSeed(specId, document.id) ? { required: true } : {}),
          revision: readDocument(specId, document.id)?.revision ?? 'demo-document-1',
          actions,
        })),
        ...[...(extra?.documents.values() ?? [])].map((document) => ({
          id: document.id,
          path: document.filename!,
          required: false,
          revision: document.revision,
          actions,
        })),
      ],
      capabilities: {
        createFile: { available: true },
        createFolder: { available: true },
        import: { available: true },
        formats: ['md', 'txt'],
      },
    };
  };

  return {
    /** Validates a batch against existing paths; throws demo errors. Narrow API for spec create. */
    plan,
    /** Appends validated documents to a collection (ids from the shared id factory). */
    append,
    /** All document paths of a specification as seen by a session context snapshot. */
    pathsFor: (specId: string, record: DemoSpecification) => {
      const created = state.specifications.get(specId);
      return created
        ? [...created.documents.values()].map((document) => document.filename!)
        : [
            ...manifestPaths(record),
            ...[...(addedCollections.get(specId)?.documents.values() ?? [])].map(
              (document) => document.filename!,
            ),
          ];
    },
    add,
    /** Imports or creates files for a specification (seeded ones reserve their manifest paths). */
    addTo(subject: string, specId: string, input: DemoDocumentsInput, record: DemoSpecification) {
      return add(subject, specId, input, reserved(specId, record));
    },
    addFolder,
    addFolderTo(
      subject: string,
      specId: string,
      input: DemoFolderInput,
      record: DemoSpecification,
    ) {
      return addFolder(subject, specId, input, reserved(specId, record));
    },
    documentTree: createdTree,
    /** Tree of a created specification, or the read-only seed tree of a catalogue one. */
    tree(specId: string, record: DemoSpecification): DemoDocumentTree {
      return state.specifications.has(specId) ? createdTree(specId) : seedTree(specId, record);
    },
    operate(
      subject: string,
      specId: string,
      input: DemoDocumentOperationInput,
    ): DemoDocumentOperationResult {
      const entry = state.request(subject, 'document-operations:' + specId, input);
      if (entry.result) return entry.result as DemoDocumentOperationResult;
      const spec = state.specifications.get(specId);
      if (!spec) throw new DemoOperationError(409, 'demo_document_operations_unavailable');
      const next = planDocumentOperation(spec, input);
      spec.documents = next.documents;
      spec.folders = next.folders;
      spec.treeRevision += '-next';
      options.onPathsChanged?.(
        specId,
        [...spec.documents.values()].map((document) => document.filename!),
      );
      const result = {
        revision: spec.treeRevision,
        documents: [...spec.documents.values()].map((document) => ({
          id: document.id,
          path: document.filename!,
          revision: document.revision,
        })),
        removedDocumentIds: next.removedDocumentIds,
        folders: [...spec.folders],
      };
      entry.result = result;
      return result;
    },
    readDocument,
    save(specId: string, document: DemoDocument, input: DemoSaveInput) {
      // The source read can overlap delete/rename/save; validate at the synchronous commit boundary.
      const existingSpec = state.specifications.get(specId);
      if (existingSpec && !existingSpec.documents.has(document.id))
        throw new DemoOperationError(404, 'specification_document_not_found');
      const current =
        state.specifications.get(specId)?.documents.get(document.id) ??
        addedCollections.get(specId)?.documents.get(document.id) ??
        savedSeedDocuments.get(JSON.stringify([specId, document.id])) ??
        document;
      if (current.revision !== input.expectedRevision)
        throw new DemoOperationError(409, 'demo_document_revision_conflict');
      state.fail('save', 'demo_document_save_failed');
      const next = { ...current, content: input.content, revision: current.revision + '-next' };
      const spec =
        state.specifications.get(specId) ??
        (addedCollections.get(specId)?.documents.has(document.id)
          ? addedCollections.get(specId)
          : undefined);
      if (spec) {
        spec.documents.set(document.id, next);
        if ('treeRevision' in spec && typeof spec.treeRevision === 'string')
          spec.treeRevision += '-next';
      } else savedSeedDocuments.set(JSON.stringify([specId, document.id]), next);
      return { revision: next.revision };
    },
    /** Workspace documents section of a specification (created, or seeded plus added). */
    async contribution(specId: string, find: Find) {
      const created = state.specifications.get(specId);
      if (created)
        return {
          state: 'available' as const,
          data: {
            folders: created.folders,
            items: [...created.documents.values()].map(documentListItem),
          },
        };
      const record = await find(specId);
      if (!record) return { state: 'unavailable' as const, reason: 'source_unavailable' as const };
      return {
        state: 'available' as const,
        data: {
          folders: addedCollections.get(specId)?.folders ?? [],
          items: [
            ...buildDemoDocumentManifest(record).map((document) =>
              isRequiredSeed(specId, document.id) ? { ...document, required: true } : document,
            ),
            ...[...(addedCollections.get(specId)?.documents.values() ?? [])].map(documentListItem),
          ],
        },
      };
    },
    /** Reads through saved/added/created documents first, then the seeded catalogue source. */
    overlaySource(seeded: DocumentContentSource): DocumentContentSource {
      return {
        async read(specId, documentId, revision) {
          const document = readDocument(specId, documentId);
          if (document) {
            if (revision !== undefined && revision !== document.revision) {
              throw new DocumentError(
                'DOCUMENT_REVISION_UNAVAILABLE',
                'The requested revision is not the current one.',
              );
            }
            return demoDocumentContent(document);
          }
          if (state.specifications.has(specId)) {
            throw new DocumentError('DOCUMENT_NOT_FOUND', 'The document does not exist.');
          }
          return seeded.read(specId, documentId, revision);
        },
      };
    },
  };
}
export type DemoDocuments = ReturnType<typeof createDemoDocuments>;
