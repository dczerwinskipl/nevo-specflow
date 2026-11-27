import { SpecificationBusyError } from '../../errors';
import type { AgentAttemptDependencies } from '../dependencies';
import type { AgentAttemptJournal, AgentTurnBinding } from '../journal/model';

export type TurnClaimPhase = 'admitted' | 'dispatched' | 'unknown' | 'settled' | undefined;

/** The attempt's current Turn and the phase of its execution claim (`undefined`: none exists). */
export async function currentTurnClaim(
  dependencies: Pick<AgentAttemptDependencies, 'finalize'>,
  journal: AgentAttemptJournal,
): Promise<{ readonly turn: AgentTurnBinding; readonly phase: TurnClaimPhase }> {
  const turn = journal.turns.at(-1)!;

  return { turn, phase: (await dependencies.finalize.claim(turn.invocationId))?.phase };
}

/** Whether the claim of a Turn may still let its process run: admitted, dispatched or unknown. */
export const isUnsettled = (phase: TurnClaimPhase): boolean =>
  phase !== undefined && phase !== 'settled';

/**
 * The admission of an owner's journal write while the attempt's own Turn may hold the project (A2):
 * refused while any other writer claim holds it, admitted under the attempt's own unsettled claim.
 * The step state is never written under it; only the finalize section applies what is recorded.
 */
export async function admitUnderOwnTurn(
  dependencies: Pick<AgentAttemptDependencies, 'admission'>,
  invocationId: string,
): Promise<void> {
  try {
    await dependencies.admission(undefined).admitWrite();
  } catch (error) {
    if (!(error instanceof SpecificationBusyError) || error.claim?.operationId !== invocationId) {
      throw error;
    }
  }
}
