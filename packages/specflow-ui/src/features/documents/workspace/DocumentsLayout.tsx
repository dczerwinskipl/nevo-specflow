import { Outlet, useParams } from '@tanstack/react-router';
import { useRuntimeMode } from '../../../app/useRuntimeMode';
import { DocumentsWorkspace } from './DocumentsWorkspace';

/**
 * Layout of `documents` and `documents/$documentId`. In demo mode it owns the whole Documents
 * workspace (explorer, open-document state, editor provider), so moving between the list and a
 * document, or between documents, only changes `documentId`: nothing unmounts and no state is
 * lost. Other modes render the child route's own page.
 */
export function DocumentsLayout() {
  const { specId, documentId } = useParams({
    strict: false,
    select: (params) => ({ specId: params.specId, documentId: params.documentId }),
  });
  const mode = useRuntimeMode();
  // Neither variant renders (and fetches) before Runtime info settles.
  if (mode === 'loading' || !specId) return null;
  // A spec switch is a new workspace: the key drops the previous spec's tree state.
  if (mode === 'demo')
    return <DocumentsWorkspace key={specId} specId={specId} documentId={documentId} />;
  return <Outlet />;
}
