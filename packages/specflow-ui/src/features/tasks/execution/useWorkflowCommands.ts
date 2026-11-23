import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import type {
  FinishWorkflowRequest,
  ReevaluateWaitRequest,
  ReturnWorkflowRequest,
  StartWorkflowRequest,
} from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../app/useAppServices';
import { invalidateAfterTaskChange } from '../authoring/queries';
import type { WorkflowSubjectRef } from './api';

/**
 * The workflow commands of one subject (start, finish, return). Each carries the subject it was
 * started for, so a late answer refreshes that subject's Specification only. A refusal refreshes
 * too: it usually means the position moved (a changed workflow, a newer attempt), and the next
 * render must show what is allowed now.
 */
export function useWorkflowCommands(subject: WorkflowSubjectRef) {
  const { workflowExecutionApi } = useAppServices();
  const queryClient = useQueryClient();
  const { specId, taskId } = subject;
  const refresh = () => invalidateAfterTaskChange(queryClient, specId);
  const target: WorkflowSubjectRef = taskId === undefined ? { specId } : { specId, taskId };

  // Mutation cache survives responsive remounts; its identity belongs to the workflow subject.
  const startKey = ['workflow', 'start', specId, taskId ?? null] as const;
  const starts = useMutationState({
    filters: { mutationKey: startKey, exact: true },
    select: ({ state }) => ({ status: state.status, error: state.error }),
  });
  const latestStart = starts.at(-1);
  const start = useMutation({
    mutationKey: startKey,
    mutationFn: (input: StartWorkflowRequest) => workflowExecutionApi.start(target, input),
    onSettled: refresh,
  });
  const finish = useMutation({
    mutationFn: (input: FinishWorkflowRequest) => workflowExecutionApi.finish(target, input),
    onSettled: refresh,
  });
  const returnTo = useMutation({
    mutationFn: (input: ReturnWorkflowRequest) => workflowExecutionApi.returnTo(target, input),
    onSettled: refresh,
  });

  const reevaluateWait = useMutation({
    mutationFn: ({ specId: targetSpecId, ...input }: ReevaluateWaitRequest & { specId: string }) =>
      workflowExecutionApi.reevaluateWait(targetSpecId, input),
    onSettled: refresh,
  });

  const resetStart = () => {
    start.reset();
    // An explicit new start clears the previous result, including a refusal inherited after a
    // remount. A running request stays in the cache until its request and refresh have settled.
    for (const mutation of queryClient
      .getMutationCache()
      .findAll({ mutationKey: startKey, exact: true })) {
      if (mutation.state.status !== 'pending') {
        queryClient.getMutationCache().remove(mutation);
      }
    }
  };

  return {
    start: {
      ...start,
      isPending: start.isPending || starts.some(({ status }) => status === 'pending'),
      isError: latestStart?.status === 'error',
      error: latestStart?.status === 'error' ? latestStart.error : null,
      reset: resetStart,
    },
    finish,
    returnTo,
    reevaluateWait,
  };
}
