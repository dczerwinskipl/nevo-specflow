import { useQuery } from '@tanstack/react-query';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import type { WorkflowSubjectRef } from '../api';
import type { AttemptCommitView } from './AttemptCommitNote';
import { POLL_MS } from './usePolling';

/** The history read of one subject; refreshed with the subject after a command. */
export const workflowHistoryKey = (specId: string, taskId: string | undefined) =>
  ['workflow', 'history', specId, taskId ?? null] as const;

/** The commit the attempt made: its id and how many documents and files it holds, when reported. */
export function committedFacts(commit: {
  readonly sha?: string | undefined;
  readonly documents?: number | undefined;
  readonly files?: number | undefined;
}) {
  return {
    ...(commit.sha ? { sha: commit.sha } : {}),
    ...(commit.documents !== undefined ? { documents: commit.documents } : {}),
    ...(commit.files !== undefined ? { files: commit.files } : {}),
  };
}

/**
 * What became of the work of the agent attempt that finished the step before: read from the
 * workflow history only when the last hand-off is an agent's (the Now block of a person's step reads
 * nothing). The attempt's commit is `committed` or `failed`; nothing is said while it is pending or
 * when the attempt did not finish with its own result.
 */
export function useFinishedAttemptCommit(
  subject: WorkflowSubjectRef,
  projection: WorkflowActionProjection,
): AttemptCommitView | undefined {
  const { workflowExecutionApi, specificationApi } = useAppServices();
  const { position, handoff } = projection;
  const from =
    handoff?.kind === 'transition' && handoff.from.actor?.class === 'agent'
      ? handoff.from
      : undefined;
  const enabled =
    from !== undefined && position.kind !== 'active' && position.kind !== 'awaiting-confirmation';
  const history = useQuery({
    queryKey: workflowHistoryKey(subject.specId, subject.taskId),
    queryFn: ({ signal }) => workflowExecutionApi.history(subject, signal),
    enabled,
    retry: false,
    // A commit still running changes by itself: read it again until it settles.
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (candidate) =>
          candidate.kind === 'attempt' &&
          candidate.step === from?.step &&
          candidate.attempt === from.attempt &&
          candidate.agent?.work.commit.state === 'pending',
      )
        ? POLL_MS
        : false,
    refetchIntervalInBackground: false,
  });
  const branch = useSpecificationWorkspace(subject.specId, specificationApi).data?.repoContext
    ?.branch;
  if (!enabled || !from) {
    return undefined;
  }

  const item = history.data?.items.find(
    (candidate) =>
      candidate.kind === 'attempt' &&
      candidate.step === from.step &&
      candidate.attempt === from.attempt &&
      candidate.agent !== undefined,
  );
  if (item?.kind !== 'attempt' || !item.agent) {
    return undefined;
  }

  const { work } = item.agent;
  const stepTitle = from.title || from.step;
  if (work.commit.state === 'committed') {
    return {
      state: 'committed',
      stepTitle,
      ...(branch ? { branch } : {}),
      ...committedFacts(work.commit),
    };
  }

  if (work.commit.state !== 'failed') {
    return undefined;
  }

  const paths = [...new Set([...work.documents, ...work.mixed, ...work.declared])];
  const next = position.kind === 'ready' ? position.next.step : undefined;

  return {
    state: 'failed',
    step: from.step,
    attempt: from.attempt,
    stepTitle,
    ...(next ? { nextTitle: next.title || next.id } : {}),
    code: work.commit.code ?? 'COMMIT_FAILED',
    ...(branch ? { branch } : {}),
    paths,
  };
}
