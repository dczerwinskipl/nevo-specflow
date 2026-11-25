import { useTranslation } from 'react-i18next';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';

/**
 * What the Specification's Sessions list says of one Session: its title (the shared fallback when it
 * is not listed or untitled) and the provider and model display names. The same read every link to
 * the agent's Session uses, so the Now block, the history and the hold note name it alike.
 */
export function useSessionFacts(specId: string, sessionId: string) {
  const { t } = useTranslation();
  const { specificationApi } = useAppServices();
  const session = useSpecificationWorkspace(specId, specificationApi).data?.sessions.find(
    (candidate) => candidate.id === sessionId,
  );

  return {
    title: session?.title ?? t('workflowExecution.agentAttempt.sessionFallback'),
    providerTitle: session?.providerTitle,
    modelTitle: session?.modelTitle,
    /** `attention`: the Session waits for the owner (a question or a permission). */
    status: session?.navigationStatus,
  };
}
