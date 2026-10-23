import { useTranslation } from 'react-i18next';
import { Alert } from '@nevo/ui';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { OperationProgress } from '../../../../shared/operations/progress/OperationProgress';
import type { OperationProgressView } from '../../../../shared/operations/progress/useOperationProgress';
import { createFailureTitleKey } from '../errors/CreateFailureAlert';
import {
  createCompletedSteps,
  createNeutralProgress,
  createProgressLabel,
  createProgressSteps,
} from './createProgress';
import type { CreateFailure } from '../errors/createFailure';

/**
 * The step checklist of the progress page: the named steps the Runtime reported (or ONE neutral
 * row while none is known, calmer still when the live stream is unavailable; steps are never
 * simulated) and, best effort, the failure code the stream reported. The running step carries the
 * page's only spinner. A finished Create shows every step done. Presentation only: the page owns
 * the stream (`useCreateOperationProgress`).
 */
export function CreateOperationProgress({
  progress,
  reportedFailure,
  target,
  working,
  completed,
  commits = false,
  monitoring,
}: {
  progress: OperationProgressView;
  reportedFailure: CreateFailure | undefined;
  /** The request's target, when this page knows the request (it sizes the finished checklist). */
  target: CreateSpecRequest['target'];
  working: boolean;
  completed: boolean;
  /** The Engine commits the scaffold (Git enabled): a finished checklist includes that step. */
  commits?: boolean;
  /** The Runtime accepted the operation and it is watched through the inspection endpoint. */
  monitoring: boolean;
}) {
  const { t } = useTranslation();
  if (completed)
    return (
      <OperationProgress
        steps={createCompletedSteps(target, commits)}
        label={createProgressLabel}
      />
    );
  if (!working) return null;
  return (
    <>
      <OperationProgress
        steps={createProgressSteps(progress.steps)}
        label={createProgressLabel}
        neutral={createNeutralProgress(monitoring && progress.lost)}
      />
      {reportedFailure && (
        <Alert role="status" tone="attention" title={t('create.monitoring.reportedTitle')}>
          <p>
            {t('create.monitoring.reportedBody', {
              reason: t(createFailureTitleKey(reportedFailure)),
            })}
          </p>
        </Alert>
      )}
    </>
  );
}
