import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { createContext, useContext } from 'react';

/**
 * Tree operations a document tab can start (its own content or header menu): they run in the
 * explorer, which owns their dialogs and lifecycle. Provided by the Documents workspace.
 */
export interface DocumentsTreeActions {
  /** Opens Assign type for an unclassified document. */
  assignType: (id: string) => void;
  /** Asks to remove the registration of a dangling entry. */
  removeRegistration: (id: string) => void;
}

export const DocumentsTreeActionsContext = createContext<DocumentsTreeActions | null>(null);

export function useDocumentsTreeActions(): DocumentsTreeActions | null {
  return useContext(DocumentsTreeActionsContext);
}

/**
 * Assign type for the document of a tab, offered only where the Runtime can classify it (the
 * document's own action and the Specification's capability); undefined otherwise.
 */
export function assignTypeFor(
  actions: DocumentsTreeActions | null,
  tree: DocumentTree | undefined,
  documentId: string | undefined,
): ((id: string) => void) | undefined {
  const document = tree?.documents.find((item) => item.id === documentId);
  return actions &&
    document?.actions.classify.available === true &&
    tree?.capabilities.classify.available === true
    ? actions.assignType
    : undefined;
}
