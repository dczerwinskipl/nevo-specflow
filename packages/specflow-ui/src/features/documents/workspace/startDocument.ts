import type { DocumentTree } from '@nevo/specflow-contracts/documents';

/**
 * The document the Documents screen opens by itself when a visit starts with nothing chosen: the
 * specification's main file (the protected overview), once per visit. Not when the route names a
 * document or a tab is open (the reader chose), not on a stacked (narrow) workspace, where the tree
 * is the first view, and not when the main file is missing.
 */
export function startDocument(options: {
  tree: Pick<DocumentTree, 'documents'>;
  documentId?: string;
  openTabs: number;
  /** The workspace splits (tree beside the document). */
  split: boolean;
}): string | undefined {
  if (options.documentId || options.openTabs > 0 || !options.split) {
    return undefined;
  }

  return options.tree.documents.find((document) => document.protected)?.id;
}
