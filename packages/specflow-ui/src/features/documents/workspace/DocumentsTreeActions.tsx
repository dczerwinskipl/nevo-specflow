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
