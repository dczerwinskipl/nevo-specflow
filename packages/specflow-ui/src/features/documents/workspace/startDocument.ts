import type { DocumentTree } from '@nevo/specflow-contracts/documents';

/**
 * The document the Documents screen opens by itself when a visit starts with nothing chosen: the
 * specification's main file (the protected overview), once per visit, on every layout (the caller
 * pushes it on a stacked workspace, so Back still returns to the tree there; on a split workspace it
 * replaces the entry instead, since Back would otherwise only reveal the idle, document-less area).
 * Not when the route names a document or a tab is open (the reader chose), and not when the main
 * file is missing.
 */
export function startDocument(options: {
  tree: Pick<DocumentTree, 'documents'>;
  documentId?: string;
  openTabs: number;
}): string | undefined {
  if (options.documentId || options.openTabs > 0) {
    return undefined;
  }

  return options.tree.documents.find((document) => document.protected)?.id;
}
