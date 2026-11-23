import { useQuery } from '@tanstack/react-query';
import type { AgentAttemptWork, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
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

  const next = position.kind === 'ready' ? position.next.step : undefined;
  const view = commitViewOf(item.agent.work, {
    step: from.step,
    attempt: from.attempt,
    stepTitle: from.title || from.step,
    ...(branch ? { branch } : {}),
    ...(next ? { nextTitle: next.title || next.id } : {}),
  });

  // Nothing is said here while the commit is pending.
  return view?.state === 'pending' ? undefined : view;
}

interface CommitOf {
  readonly step: string;
  readonly attempt: number;
  readonly stepTitle: string;
  readonly branch?: string;
  readonly nextTitle?: string;
  readonly waits?: 'confirm';
  /** The code the projection names for a failed commit, before the history read has it. */
  readonly code?: string;
}

/** The attempt commit of an agent's work as the note says it; `undefined` when it has none. */
function commitViewOf(
  work: AgentAttemptWork | undefined,
  of: CommitOf,
): AttemptCommitView | undefined {
  const { stepTitle, branch } = of;
  const commit = work?.commit;
  if (commit?.state === 'committed') {
    return {
      state: 'committed',
      stepTitle,
      ...(branch ? { branch } : {}),
      ...committedFacts(commit),
    };
  }

  if (commit?.state === 'pending') {
    return { state: 'pending', stepTitle };
  }

  if (commit?.state !== 'failed' && of.code === undefined) {
    return undefined;
  }

  const paths = work ? [...new Set([...work.documents, ...work.mixed, ...work.declared])] : [];

  return {
    state: 'failed',
    step: of.step,
    attempt: of.attempt,
    stepTitle,
    ...(of.nextTitle ? { nextTitle: of.nextTitle } : {}),
    ...(of.waits ? { waits: of.waits } : {}),
    code: commit?.code ?? of.code ?? 'COMMIT_FAILED',
    ...(branch ? { branch } : {}),
    paths,
  };
}

/**
 * The attempt commit of the agent's result that waits for the owner's confirmation (the commit ran
 * when the agent finished): committed, still running, or failed with Retry commit. The projection's
 * `actions.confirm.unavailable` says whether Confirm waits for it; the history read adds the commit
 * and the files it holds. The projection is polled while the commit runs (`needsPolling`).
 */
export function useConfirmationAttemptCommit(
  subject: WorkflowSubjectRef,
  projection: WorkflowActionProjection,
): AttemptCommitView | undefined {
  const { workflowExecutionApi, specificationApi } = useAppServices();
  const { position, actions } = projection;
  const confirmation = position.kind === 'awaiting-confirmation' ? position : undefined;
  const history = useQuery({
    queryKey: workflowHistoryKey(subject.specId, subject.taskId),
    queryFn: ({ signal }) => workflowExecutionApi.history(subject, signal),
    enabled: confirmation?.attempt.actor.class === 'agent',
    retry: false,
  });
  const branch = useSpecificationWorkspace(subject.specId, specificationApi).data?.repoContext
    ?.branch;
  if (!confirmation) {
    return undefined;
  }

  const step = confirmation.step.id;
  const attempt = confirmation.attempt.number;
  const stepTitle = confirmation.step.title || step;
  const item = history.data?.items.find(
    (candidate) =>
      candidate.kind === 'attempt' && candidate.step === step && candidate.attempt === attempt,
  );
  const work = item?.kind === 'attempt' ? item.agent?.work : undefined;
  const unavailable = actions.confirm?.unavailable;
  // The projection decides whether Confirm waits; the history read may lag behind it.
  if (unavailable?.reason === 'attempt-commit-pending') {
    return { state: 'pending', stepTitle };
  }

  const of = { step, attempt, stepTitle, ...(branch ? { branch } : {}) };
  if (unavailable?.reason === 'attempt-commit-failed') {
    return commitViewOf(work?.commit.state === 'failed' ? work : undefined, {
      ...of,
      waits: 'confirm',
      code: unavailable.code ?? 'COMMIT_FAILED',
    });
  }

  const view = commitViewOf(work, of);

  return view?.state === 'committed' ? view : undefined;
}
