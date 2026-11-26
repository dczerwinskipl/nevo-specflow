import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import { useWorkflowHistory } from './useWorkflowHistory';
import { workflowTimeline } from './workflowTimeline';

/**
 * The Specification's workflow history as Activity history entries ({@link workflowTimeline}),
 * with what an entry needs to render: the whole history, whether older records were cut off and
 * how a changed document opens. A history that cannot be read gives no entries and never blocks
 * the Activity history.
 */
export function useSpecificationWorkflowTimeline(
  specId: string,
  /** Opens a registered document of the Specification by its id. */
  onOpenDoc?: (docId: string) => void,
) {
  const { specificationApi } = useAppServices();
  const workspace = useSpecificationWorkspace(specId, specificationApi).data;
  const history = useWorkflowHistory({ specId });
  const items = history.data?.items ?? [];
  const { entries, sessionIds } = workflowTimeline(history.data);

  // A changed document opens by its registry id: its path is the Specification folder + filename.
  const openDocument = onOpenDoc
    ? (path: string) => {
        const directory = items.find(
          (item) => item.kind === 'attempt' && item.agent?.work.changes?.directory,
        );
        const folder =
          directory?.kind === 'attempt' ? directory.agent?.work.changes?.directory : undefined;
        const found = workspace?.documents.find(
          (document) => document.filename && `${folder}/${document.filename}` === path,
        );
        if (!found) {
          return false;
        }

        onOpenDoc(found.id);

        return true;
      }
    : undefined;

  return {
    entries,
    sessionIds,
    items,
    truncated: history.data?.truncated === true,
    openDocument,
  };
}
