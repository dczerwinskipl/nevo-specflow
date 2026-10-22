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
  createProgressLabel,
  createProgressPlaceholderRows,
  createProgressSteps,
} from './createProgress';
import { toOperationFailure } from './createSpecErrors';
import type { StreamHint } from './watchCreateOperation';

/**
 * What the Runtime says while a Create runs: the named steps, a calm note when the live stream is
 * unavailable, and, best effort, the failure code the stream reported before the inspection
 * endpoint (the authority) has concluded. Display only: it never decides, delays or fails the
 * operation; it only tells the owner how soon to read the inspection again.
 */
export function CreateProgressPanel({
  operationId,
  target,
  busy,
  monitoring,
  concluded,
  onStreamHint,
}: {
  /** The operation that was sent; the stream is watched only while there is one and it is `busy`. */
  operationId: string | undefined;
  target: CreateSpecRequest['target'];
  busy: boolean;
  monitoring: boolean;
  /** The inspection concluded with a failure the form already shows: nothing more to add here. */
  concluded: boolean;
  onStreamHint: (hint: StreamHint) => void;
}) {
  const { t } = useTranslation();
  const { projectCreationApi, operationsApi } = useAppServices();
  const progress = useOperationProgress({
    api: operationsApi,
    streamUrl: operationId ? projectCreationApi.operationEventsUrl(operationId) : undefined,
    enabled: busy,
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
  const checklistPossible = progress.available && !reportedFailure && progress.outcome !== 'failed';

  if (!busy || concluded) return null;
  return (
    <>
      <OperationProgress
        steps={createProgressSteps(progress.steps)}
        label={createProgressLabel}
        placeholderRows={checklistPossible ? createProgressPlaceholderRows(target) : 0}
      />
      {/* The calm note only when there is no live checklist to look at. */}
      {monitoring && progress.lost && progress.steps.length === 0 && !reportedFailure && (
        <Alert role="status" tone="info" title={t('create.monitoring.title')}>
          <p>{t('create.monitoring.body')}</p>
        </Alert>
      )}
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
