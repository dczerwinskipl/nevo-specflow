import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FinishWorkflowRequest,
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

  const start = useMutation({
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

  return { start, finish, returnTo };
}
