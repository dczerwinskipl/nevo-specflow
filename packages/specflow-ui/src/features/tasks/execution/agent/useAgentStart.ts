import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentStepExecutionRequest,
  AgentStepExecutionResult,
} from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import type { WorkflowSubjectRef } from '../api';
import { workflowRefusalOf } from '../refusal';
import { newId } from '../../../../shared/ids/newId';

/** What the owner chose for a fresh Session; a continued Session names nothing. */
export type AgentChoice = Pick<AgentStepExecutionRequest, 'provider' | 'model' | 'effort'>;

/**
 * What a start answered: the Runtime's result, or `earlier-attempt` when a request whose answer was
 * lost turned out to have started the attempt (the owner is shown that one instead).
 */
export type AgentStartOutcome = AgentStepExecutionResult | { readonly kind: 'earlier-attempt' };

function sameChoice(request: AgentStepExecutionRequest, choice: AgentChoice): boolean {
  return (
    request.provider === choice.provider &&
    request.model === choice.model &&
    request.effort === choice.effort
  );
}

/**
 * Run with agent for one subject: the check the dialog reads when it opens (the Runtime's answer
 * about the checkout and the agent, never cached) and the start. A refusal refreshes the subject too:
 * it usually means the position moved. `handOver` (Hand to agent): the owner's attempt the start
 * ends; the agent's next attempt of the step starts.
 */
export function useAgentStart(
  subject: WorkflowSubjectRef,
  stepId: string,
  open: boolean,
  handOver?: { readonly attempt: number },
) {
  const { workflowExecutionApi } = useAppServices();
  const queryClient = useQueryClient();
  const { specId, taskId } = subject;
  const target: WorkflowSubjectRef = taskId === undefined ? { specId } : { specId, taskId };
  // The request whose answer was lost: its retry resends exactly it, under the same idempotency key.
  const lost = useRef<AgentStepExecutionRequest>(undefined);

  const check = useQuery({
    queryKey: ['workflow', 'agent-check', specId, taskId ?? null],
    queryFn: ({ signal }) => workflowExecutionApi.checkAgentExecution(target, signal),
    enabled: open,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // A refusal was not applied, so the next request is a new one; a lost answer keeps the request.
  const send = async (request: AgentStepExecutionRequest) => {
    try {
      const result = await workflowExecutionApi.startAgentExecution(target, request);
      lost.current = undefined;

      return result;
    } catch (error) {
      lost.current = workflowRefusalOf(error).outcomeUnknown ? request : undefined;

      throw error;
    }
  };

  const start = useMutation({
    mutationFn: async (choice: AgentChoice): Promise<AgentStartOutcome> => {
      const earlier = lost.current;
      if (earlier && sameChoice(earlier, choice)) {
        return send(earlier);
      }

      let position = check.data?.position;
      if (earlier) {
        // Another choice than the request whose answer was lost: that request is resolved first.
        // If it started an attempt, the attempt is shown; another one is never started beside it.
        const reread = await check.refetch({ throwOnError: true });
        lost.current = undefined;
        position = reread.data?.position;
        // A new attempt (a start, or a hand to the agent) that was made shows as the agent's attempt.
        if (
          (earlier.expected.attempt === undefined || earlier.expected.handOver === true) &&
          position?.step === stepId &&
          position.attempt !== undefined &&
          position.handOver !== true
        ) {
          return { kind: 'earlier-attempt' };
        }
      }

      const request: AgentStepExecutionRequest = {
        requestId: newId(),
        expected: {
          step: stepId,
          // Hand to agent names the owner's attempt it was opened for; a moved run is refused.
          ...(handOver
            ? { attempt: handOver.attempt, handOver: true as const }
            : position?.step === stepId && position.attempt !== undefined
              ? { attempt: position.attempt }
              : {}),
        },
        ...choice,
      };

      return send(request);
    },
    onSettled: () => invalidateAfterTaskChange(queryClient, specId),
  });

  return { check, start };
}
