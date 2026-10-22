import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@nevo/ui';
import { OPERATION_NOT_FOUND_CODE } from '@nevo/specflow-contracts/operations';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { useAppServices } from '../../../app/useAppServices';
import { OperationProgress } from '../../../shared/operations/OperationProgress';
import { useOperationProgress } from '../../../shared/operations/useOperationProgress';
import { createFailureTitleKey } from './CreateFailureAlert';
import {
  createCompletedSteps,
  createNeutralProgress,
  createProgressLabel,
  createProgressSteps,
} from './createProgress';
import { toOperationFailure } from './createSpecErrors';
import type { StreamHint } from './watchCreateOperation';

/**
 * The step checklist of the progress page, with what the Runtime says while a Create runs: the
 * named steps (or ONE neutral row while none is known, calmer still when the live stream is
 * unavailable; steps are never simulated) and, best effort, the failure code
 * the stream reported before the inspection endpoint (the authority) has concluded. Display only:
 * it never decides, delays or fails the operation; it only tells the owner how soon to read the
 * inspection again. A finished Create shows every step done.
 */
export function CreateOperationProgress({
  operationId,
  target,
  working,
  completed,
  commits = false,
  monitoring,
  onStreamHint,
}: {
  /** The operation shown; its stream is watched only while it is `working`. */
  operationId: string;
  /** The request's target, when this page knows the request (it sizes the placeholder rows). */
  target: CreateSpecRequest['target'];
  working: boolean;
  completed: boolean;
  /** The Engine commits the scaffold (Git enabled): a finished checklist includes that step. */
  commits?: boolean;
  /** The Runtime accepted the operation and it is watched through the inspection endpoint. */
  monitoring: boolean;
  onStreamHint: (hint: StreamHint) => void;
}) {
  const { t } = useTranslation();
  const { projectCreationApi, operationsApi } = useAppServices();
  const progress = useOperationProgress({
    api: operationsApi,
    streamUrl: projectCreationApi.operationEventsUrl(operationId),
    enabled: working,
  });

  // The stream only hastens the next inspection read (a terminal event) or switches the poll to the
  // regular backoff (stream lost); the inspection endpoint stays the single source of truth.
  const hint: StreamHint =
    progress.outcome !== null && progress.outcome !== 'running'
      ? 'terminal'
      : progress.lost
        ? 'lost'
        : 'live';
  useEffect(() => {
    onStreamHint(hint);
  }, [onStreamHint, hint]);

  // An id the Runtime does not know yet answers with a synthetic failure: it is no news.
  const reportedFailure =
    progress.outcome === 'failed' &&
    progress.failureCode !== undefined &&
    progress.failureCode !== OPERATION_NOT_FOUND_CODE
      ? toOperationFailure(progress.failureCode)
      : undefined;

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
