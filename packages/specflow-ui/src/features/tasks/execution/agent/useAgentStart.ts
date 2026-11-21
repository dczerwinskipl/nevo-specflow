import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentStepExecutionRequest } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import type { WorkflowSubjectRef } from '../api';
import { workflowRefusalOf } from '../refusal';

/** What the owner chose for a fresh Session; a continued Session names nothing. */
export type AgentChoice = Pick<AgentStepExecutionRequest, 'provider' | 'model' | 'effort'>;

/**
 * Run with agent for one subject: the check the dialog reads when it opens (the Runtime's answer
 * about the checkout and the agent, never cached) and the start. A refusal refreshes the subject too:
 * it usually means the position moved.
 */
export function useAgentStart(subject: WorkflowSubjectRef, stepId: string, open: boolean) {
  const { workflowExecutionApi } = useAppServices();
  const queryClient = useQueryClient();
  const { specId, taskId } = subject;
  const target: WorkflowSubjectRef = taskId === undefined ? { specId } : { specId, taskId };
  // One idempotency key per request; a lost answer is retried under the same key.
  const requestId = useRef<string>(undefined);
  const lostAnswer = useRef(false);

  const check = useQuery({
    queryKey: ['workflow', 'agent-check', specId, taskId ?? null],
    queryFn: ({ signal }) => workflowExecutionApi.checkAgentExecution(target, signal),
    enabled: open,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const start = useMutation({
    mutationFn: (choice: AgentChoice) => {
      requestId.current =
        lostAnswer.current && requestId.current ? requestId.current : crypto.randomUUID();
      const position = check.data?.position;

      return workflowExecutionApi.startAgentExecution(target, {
        requestId: requestId.current,
        expected: {
          step: stepId,
          ...(position?.step === stepId && position.attempt !== undefined
            ? { attempt: position.attempt }
            : {}),
        },
        ...choice,
      });
    },
    onError: (error) => {
      lostAnswer.current = workflowRefusalOf(error).outcomeUnknown;
    },
    onSettled: () => invalidateAfterTaskChange(queryClient, specId),
  });

  return { check, start };
}
