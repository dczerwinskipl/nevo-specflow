import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppServices } from '../../../../app/useAppServices';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import type { WorkflowSubjectRef } from '../api';
import { workflowRefusalOf } from '../refusal';

/**
 * One idempotency key per request. A request whose answer was lost is sent again under the same key
 * (the Runtime returns the recorded answer); any other outcome ends it.
 */
function useRequestKey() {
  const key = useRef<string>(undefined);
  const lost = useRef(false);

  return {
    next: () => {
      key.current = lost.current && key.current ? key.current : crypto.randomUUID();

      return key.current;
    },
    settled: (error: unknown) => {
      lost.current = error !== undefined && workflowRefusalOf(error).outcomeUnknown;
    },
  };
}

export interface ConfirmRequest {
  readonly step: string;
  readonly attempt: number;
  readonly confirmsDigest: string;
}

export interface RejectRequest {
  readonly step: string;
  readonly attempt: number;
  readonly feedback: string;
}

/**
 * What the owner can do about an agent's attempt of one subject: stop it, continue it, check the
 * outcome of a Turn that may still run, retry the commit of its work, and confirm or reject its
 * result. Every command refreshes the subject afterwards (a refusal usually means the position moved).
 */
export function useAgentAttemptCommands(subject: WorkflowSubjectRef) {
  const { workflowExecutionApi, managedSessionsApi } = useAppServices();
  const queryClient = useQueryClient();
  const { specId, taskId } = subject;
  const target: WorkflowSubjectRef = taskId === undefined ? { specId } : { specId, taskId };
  const refresh = () =>
    Promise.all([
      invalidateAfterTaskChange(queryClient, specId),
      queryClient.invalidateQueries({ queryKey: ['workflow', 'history', specId] }),
    ]);
  const stopKey = useRequestKey();
  const continueKey = useRequestKey();
  const confirmKey = useRequestKey();
  const rejectKey = useRequestKey();
  const outcomeKey = useRequestKey();

  const stop = useMutation({
    mutationFn: (attemptId: string) =>
      workflowExecutionApi.stopAgentExecution(target, { requestId: stopKey.next(), attemptId }),
    onSettled: (_result, error) => {
      stopKey.settled(error ?? undefined);

      return refresh();
    },
  });
  const continueAttempt = useMutation({
    mutationFn: (expected: { readonly step: string; readonly attempt: number }) =>
      workflowExecutionApi.startAgentExecution(target, {
        requestId: continueKey.next(),
        expected,
      }),
    onSettled: (_result, error) => {
      continueKey.settled(error ?? undefined);

      return refresh();
    },
  });
  const checkOutcome = useMutation({
    mutationFn: (turn: { readonly sessionId: string; readonly turnId: string }) =>
      managedSessionsApi.reconcile(turn.sessionId, turn.turnId, outcomeKey.next()),
    onSettled: (_result, error) => {
      outcomeKey.settled(error ?? undefined);

      return refresh();
    },
  });
  const retryCommit = useMutation({
    mutationFn: (attempt: { readonly step: string; readonly attempt: number }) =>
      workflowExecutionApi.retryAttemptCommit(target, attempt),
    onSettled: refresh,
  });
  const confirm = useMutation({
    mutationFn: (request: ConfirmRequest) =>
      workflowExecutionApi.confirmResult(target, { requestId: confirmKey.next(), ...request }),
    onSettled: (_result, error) => {
      confirmKey.settled(error ?? undefined);

      return refresh();
    },
  });
  const reject = useMutation({
    mutationFn: (request: RejectRequest) =>
      workflowExecutionApi.rejectResult(target, { requestId: rejectKey.next(), ...request }),
    onSettled: (_result, error) => {
      rejectKey.settled(error ?? undefined);

      return refresh();
    },
  });

  const takeOver = useMutation({
    mutationFn: (attempt: { readonly step: string; readonly attempt: number }) =>
      workflowExecutionApi.takeOverAgentExecution(target, attempt),
    onSettled: refresh,
  });

  return { stop, continueAttempt, checkOutcome, retryCommit, confirm, reject, takeOver, refresh };
}
