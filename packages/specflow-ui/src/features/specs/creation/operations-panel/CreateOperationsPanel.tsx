import { useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';

import type { RuntimeMode } from '../../../../app/useRuntimeMode';
import { OperationsPanelHost, type RenderOperationLink } from '../../../../shared/operations';
import type { OperationsApi } from '../../../../shared/operations/operationsApi';
import { specsOverviewKeys } from '../../overview/data/queries';
import { projectCreationKeys } from '../api/api.project';
import { createOperationKind, createOperationsListUrl } from './operationKind';

const kinds = [createOperationKind];

/** A link that navigates inside the app on a plain click and stays a real anchor otherwise. */
function useRouterLink(): RenderOperationLink {
  const router = useRouter({ warn: false });

  return useCallback(
    (href: string, children: ReactNode, className: string) => (
      <a
        href={href}
        className={className}
        onClick={(event) => {
          if (
            !router ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }

          event.preventDefault();
          router.history.push(href);
        }}
      >
        {children}
      </a>
    ),
    [router],
  );
}

/**
 * The Create operations panel of the Specifications list: the list URL for the Runtime mode, the
 * Create presentation, and the refresh of the specification list once a Create has completed.
 */
export function CreateOperationsPanel({
  api,
  mode,
}: {
  readonly api: OperationsApi;
  readonly mode: RuntimeMode;
}) {
  const queryClient = useQueryClient();
  const renderLink = useRouterLink();
  const onCompleted = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: specsOverviewKeys.all });
    void queryClient.invalidateQueries({ queryKey: projectCreationKeys.createOptions });
  }, [queryClient]);

  return (
    <OperationsPanelHost
      api={api}
      listUrl={createOperationsListUrl(mode)}
      kinds={kinds}
      renderLink={renderLink}
      onCompleted={onCompleted}
    />
  );
}
