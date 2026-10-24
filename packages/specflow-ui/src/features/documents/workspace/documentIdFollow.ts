import type {
  DocumentOperationInput,
  DocumentOperationResult,
  DocumentTree,
} from '@nevo/specflow-contracts/documents';

/** A document whose id changed in an operation: what its tab, draft and route move to. */
export interface FollowedDocument {
  from: string;
  to: string;
  path: string;
  revision: string;
  /** Set when the operation registered the document (classify). */
  type?: string;
}

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const baseOf = (path: string) => path.split('/').at(-1) ?? path;
const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/**
 * The documents an operation gave a new id: classifying a file (`u-…` becomes a registered id),
 * renaming or moving an unclassified file, or renaming or moving the folder of unclassified files
 * (their ids derive from their paths). `before` is the tree the operation was started on; the old
 * id of a document in a moved folder is found there by its old path.
 */
export function followedDocuments(
  before: Pick<DocumentTree, 'documents'> | undefined,
  operation: Omit<DocumentOperationInput, 'operationId'>,
  result: Pick<DocumentOperationResult, 'documents'>,
): FollowedDocument[] {
  const followed = (from: string, record: DocumentOperationResult['documents'][number]) => ({
    from,
    to: record.id,
    path: record.path,
    revision: record.revision,
    ...(operation.action === 'classify' && record.type ? { type: record.type } : {}),
  });
  if (operation.kind === 'document') {
    const record = result.documents[0];
    return operation.documentId && record && record.id !== operation.documentId
      ? [followed(operation.documentId, record)]
      : [];
  }
  if (!operation.path || (operation.action !== 'rename' && operation.action !== 'move')) return [];
  const oldFolder = operation.path;
  const newFolder =
    operation.action === 'rename'
      ? join(parentOf(oldFolder), operation.name ?? baseOf(oldFolder))
      : join(operation.targetFolder ?? '', baseOf(oldFolder));
  const prefix = newFolder.toLowerCase() + '/';
  return result.documents.flatMap((record) => {
    if (!record.path.toLowerCase().startsWith(prefix)) return [];
    const oldPath = oldFolder + record.path.slice(newFolder.length);
    const previous = before?.documents.find((document) => document.path === oldPath);
    return previous && previous.id !== record.id ? [followed(previous.id, record)] : [];
  });
}

/** The cached tree with the followed documents under their new ids (until it is read again). */
export function treeWithFollowed(
  tree: DocumentTree,
  moves: readonly FollowedDocument[],
): DocumentTree {
  if (moves.length === 0) return tree;
  return {
    ...tree,
    documents: tree.documents.map((document) => {
      const move = moves.find((candidate) => candidate.from === document.id);
      if (!move) return document;
      return {
        ...document,
        id: move.to,
        path: move.path,
        revision: move.revision,
        ...(move.type ? { type: move.type, classification: 'registered' as const } : {}),
      };
    }),
  };
}

/**
 * The revision a draft is based on after an operation changed its document's revision (classify,
 * rename, move). A draft based on the version the operation started from follows the new
 * revision; a draft based on an older version keeps its own, so its next save is checked against
 * what it really was based on and an external change is never overwritten silently.
 */
export function followedDraftRevision(
  draftRevision: string,
  revisionBefore: string | undefined,
  revisionAfter: string,
): string {
  return revisionBefore !== undefined && draftRevision === revisionBefore
    ? revisionAfter
    : draftRevision;
}
