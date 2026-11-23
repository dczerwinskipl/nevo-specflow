import type { DocumentTree } from '@nevo/specflow-contracts/documents';

/**
 * The document the Documents screen opens by itself when a visit starts with nothing chosen: the
 * specification's main file (the protected overview) on split layouts. On stacked layouts the
 * tree is the entry point, with its search and type filter.
 * Not when the route names a document or a tab is open (the reader chose), and not when the main
 * file is missing.
 */
export function startDocument(options: {
  tree: Pick<DocumentTree, 'documents'>;
  documentId?: string;
  openTabs: number;
  supportsSplit: boolean;
}): string | undefined {
  if (!options.supportsSplit || options.documentId || options.openTabs > 0) {
    return undefined;
  }

  return options.tree.documents.find((document) => document.protected)?.id;
}
