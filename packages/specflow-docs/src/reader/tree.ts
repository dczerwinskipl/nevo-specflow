// The tree of a workspace's documentation: what the reader lists, from one loaded corpus.

import { asString } from '../frontmatter/contract';
import type { DocsChunks } from '../semantic-index/chunk-source';
import { skippedUnderDocsRoot, underDocsRoot } from './paths';

export interface TreeDocument {
  readonly documentId: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  /** Relative to `docs.root`. */
  readonly path: string;
  readonly summary: string;
  readonly proposal: boolean;
}

export interface TreeInactiveDocument {
  readonly documentId: string;
  readonly path: string;
  readonly status: string;
  readonly supersededBy?: string;
}

export interface TreeSkippedDocument {
  readonly path: string;
  readonly error: string;
}

export interface DocsTree {
  readonly revision: string;
  /** `<docs.root>/README.md`, when it is an active, readable document. */
  readonly rootIndexDocumentId?: string;
  readonly documents: readonly TreeDocument[];
  readonly inactive: readonly TreeInactiveDocument[];
  readonly skipped: readonly TreeSkippedDocument[];
}

export function projectDocsTree(snapshot: DocsChunks, root: string): DocsTree {
  const rootIndexFile = `${root}/README.md`;
  const documents = snapshot.documents.map(({ record, proposal }): TreeDocument => {
    const summary = typeof record.summary === 'string' ? record.summary.trim() : '';

    return {
      documentId: asString(record.id),
      title: asString(record.title),
      type: asString(record.type),
      status: asString(record.status),
      path: underDocsRoot(root, record.file),
      summary,
      proposal,
    };
  });
  const rootIndex = snapshot.documents.find(({ record }) => record.file === rootIndexFile);

  return {
    revision: snapshot.revision,
    ...(rootIndex ? { rootIndexDocumentId: asString(rootIndex.record.id) } : {}),
    documents,
    inactive: snapshot.inactive.map((record): TreeInactiveDocument => {
      const supersededBy =
        typeof record.superseded_by === 'string' && record.superseded_by !== ''
          ? record.superseded_by
          : undefined;

      return {
        documentId: asString(record.id),
        path: underDocsRoot(root, record.file),
        status: asString(record.status),
        ...(supersededBy === undefined ? {} : { supersededBy }),
      };
    }),
    skipped: skippedUnderDocsRoot(root, snapshot.skipped),
  };
}
