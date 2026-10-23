import { useOperationsList, type UseOperationsListOptions } from './useOperationsList';
import { OperationsPanel } from './OperationsPanel';
import type { RenderOperationLink } from './OperationRow';
import type { OperationKindRegistry } from './operationKinds';

export interface OperationsPanelHostProps extends UseOperationsListOptions {
  readonly kinds: OperationKindRegistry;
  readonly renderLink?: RenderOperationLink;
}

/**
 * The connected panel: reads a feature's operation list through the operations port and draws it.
 * Renders nothing while the first read is pending and when the Runtime serves no list, so the page
 * below it never waits for or depends on it.
 */
export function OperationsPanelHost({ kinds, renderLink, ...options }: OperationsPanelHostProps) {
  const view = useOperationsList(options);
  if (view.loading || view.unavailable) return null;
  return (
    <OperationsPanel
      list={view.list}
      failed={view.failed}
      onRetry={view.refetch}
      kinds={kinds}
      renderLink={renderLink}
    />
  );
}
