import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppServices } from '../../../../app/useAppServices';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import type { WorkflowSubjectRef } from '../api';
import { workflowRefusalOf } from '../refusal';
import { newId } from '../../../../shared/ids/newId';

/**
 * One idempotency key per request, tied to its payload. A request whose answer was lost is sent
 * again with the same payload under the same key (the Runtime returns the recorded answer); another
 * payload is another request with a key of its own (a key is never reused for a different request).
 * Any other outcome ends it.
 */
export function useRequestKey() {
  const sent = useRef<{ readonly key: string; readonly payload: string }>(undefined);
  const lost = useRef(false);

  return {
    next: (payload: unknown) => {
      const shape = JSON.stringify(payload);
      const earlier = sent.current;
      sent.current =
        lost.current && earlier?.payload === shape ? earlier : { key: newId(), payload: shape };

      return sent.current.key;
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
export function useAgentAttemptCommands(subject: WorkflowSubjectRef, headingId?: string) {
  const { workflowExecutionApi, managedSessionsApi } = useAppServices();
  const queryClient = useQueryClient();
  const { specId, taskId } = subject;
  const target: WorkflowSubjectRef = taskId === undefined ? { specId } : { specId, taskId };
  const refresh = () =>
    Promise.all([
      invalidateAfterTaskChange(queryClient, specId),
      queryClient.invalidateQueries({ queryKey: ['workflow', 'history', specId] }),
    ]);
  // After a command settles the control that was pressed may be gone: focus moves to the Now heading.
  const settle = async () => {
    await refresh();
    if (headingId) {
      document.getElementById(headingId)?.focus({ preventScroll: true });
    }
  };

  const stopKey = useRequestKey();
  const continueKey = useRequestKey();
  const confirmKey = useRequestKey();
  const rejectKey = useRequestKey();
  const outcomeKey = useRequestKey();

  const stop = useMutation({
    mutationFn: (attemptId: string) =>
      workflowExecutionApi.stopAgentExecution(target, {
        requestId: stopKey.next(attemptId),
        attemptId,
      }),
    onSettled: (_result, error) => {
      stopKey.settled(error ?? undefined);

      return settle();
    },
  });
  const continueAttempt = useMutation({
    mutationFn: (expected: { readonly step: string; readonly attempt: number }) =>
      workflowExecutionApi.startAgentExecution(target, {
        requestId: continueKey.next(expected),
        expected,
      }),
    onSettled: (_result, error) => {
      continueKey.settled(error ?? undefined);

      return settle();
    },
  });
  const checkOutcome = useMutation({
    mutationFn: (turn: { readonly sessionId: string; readonly turnId: string }) =>
      managedSessionsApi.reconcile(turn.sessionId, turn.turnId, outcomeKey.next(turn)),
    onSettled: (_result, error) => {
      outcomeKey.settled(error ?? undefined);

      return settle();
    },
  });
  const retryCommit = useMutation({
    mutationFn: (attempt: { readonly step: string; readonly attempt: number }) =>
      workflowExecutionApi.retryAttemptCommit(target, attempt),
    onSettled: settle,
  });
  const confirm = useMutation({
    mutationFn: (request: ConfirmRequest) =>
      workflowExecutionApi.confirmResult(target, {
        requestId: confirmKey.next(request),
        ...request,
      }),
    onSettled: (_result, error) => {
      confirmKey.settled(error ?? undefined);

      return settle();
    },
  });
  const reject = useMutation({
    mutationFn: (request: RejectRequest) =>
      workflowExecutionApi.rejectResult(target, { requestId: rejectKey.next(request), ...request }),
    onSettled: (_result, error) => {
      rejectKey.settled(error ?? undefined);

      return settle();
    },
  });

  const takeOver = useMutation({
    mutationFn: (attempt: { readonly step: string; readonly attempt: number }) =>
      workflowExecutionApi.takeOverAgentExecution(target, attempt),
    onSettled: settle,
  });

  return { stop, continueAttempt, checkOutcome, retryCommit, confirm, reject, takeOver, refresh };
}
