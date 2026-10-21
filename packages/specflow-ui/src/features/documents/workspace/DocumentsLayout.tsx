import { Outlet, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { DocumentsWorkspace } from './DocumentsWorkspace';

/** `undefined` until Runtime info settles, so neither variant renders (and fetches) prematurely. */
function useDemoMode() {
  const { runtimeInfoApi } = useAppServices();
  const runtime = useQuery({
    queryKey: ['runtime-info'],
    queryFn: ({ signal }) => runtimeInfoApi.getInfo(signal),
  });
  return runtime.isPending ? undefined : runtime.data?.dataMode === 'demo';
}

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
  const demo = useDemoMode();
  if (demo === undefined || !specId) return null;
  // A spec switch is a new workspace: the key drops the previous spec's tree state.
  if (demo) return <DocumentsWorkspace key={specId} specId={specId} documentId={documentId} />;
  return <Outlet />;
}
