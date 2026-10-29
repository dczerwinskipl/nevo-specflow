import type { TurnSummary, TurnOutcome, WorkSummary } from '@nevo/specflow-contracts/sessions';

/** Terminal arbitration is pure and never turns a settled record back into live work. */
export function terminalizeTurn(
  turn: TurnSummary,
  outcome: TurnOutcome,
  at: string,
  cancelRequested: boolean,
  error?: { code: string; message: string },
): TurnSummary {
  if (turn.state === 'terminal') {
    return turn;
  }

  return {
    ...turn,
    state: 'terminal',
    outcome: cancelRequested ? 'cancelled' : outcome,
    completedAt: at,
    updatedAt: at,
    revision: turn.revision + 1,
    ...(error ? { error } : {}),
  };
}

export function transitionWork(
  work: WorkSummary,
  state: WorkSummary['state'],
  at: string,
): WorkSummary {
  if (!['queued', 'active', 'waiting'].includes(work.state)) {
    return work;
  }

  return { ...work, state, revision: work.revision + 1, updatedAt: at };
}
