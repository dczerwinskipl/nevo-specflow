import { useEffect } from 'react';
import { OPERATION_NOT_FOUND_CODE } from '@nevo/specflow-contracts/operations';
import { useAppServices } from '../../../app/useAppServices';
import {
  useOperationProgress,
  type OperationProgressView,
} from '../../../shared/operations/useOperationProgress';
import { toOperationFailure } from './errors/createSpecErrors';
import type { StreamHint } from './operation/watchCreateOperation';

/**
 * What the Runtime says while a Create runs (the live stream): the reported steps and, best effort,
 * the failure code the stream reported before the inspection endpoint (the authority) concluded.
 * The page owns it, so the subtitle and the checklist read the same steps. Display only: it never
 * decides, delays or fails the operation; it only tells the owner how soon to read the inspection
 * again (a terminal event hastens it, a lost stream switches to the regular backoff).
 */
export function useCreateOperationProgress({
  operationId,
  working,
  onStreamHint,
}: {
  operationId: string;
  /** The stream is watched only while the operation is working. */
  working: boolean;
  onStreamHint: (hint: StreamHint) => void;
}) {
  const { projectCreationApi, operationsApi } = useAppServices();
  const progress: OperationProgressView = useOperationProgress({
    api: operationsApi,
    streamUrl: projectCreationApi.operationEventsUrl(operationId),
    enabled: working,
  });

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

  return { progress, reportedFailure };
}
