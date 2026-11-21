import type { AgentAttemptView, AgentOption } from '@nevo/specflow-contracts/workflow';
import type { UnavailableAgent } from './agentOption';

/**
 * Where an agent's attempt stands in the Now block, from the projection's `agentAttempt` alone (the
 * Runtime's facts, never a guess from the position):
 *
 * - `working`, `stopping`, `unknown`, `session-missing`: the agent's Turn is running, was asked to
 *   stop, may still run, or never got its Session (Continue then reads "Retry start");
 * - `stopped`: the Turn ended; the owner decides (Continue). `proposal` is what the agent proposed:
 *   `refused` when the Engine did not accept it, `pending` while it is being applied.
 */
export type AgentAttemptStage =
  | { readonly stage: 'working' }
  | { readonly stage: 'stopping' }
  | { readonly stage: 'unknown' }
  | { readonly stage: 'session-missing' }
  | {
      readonly stage: 'stopped';
      readonly proposal?: NonNullable<AgentAttemptView['proposal']>;
    };

export function agentStageOf(view: AgentAttemptView): AgentAttemptStage {
  switch (view.turn.state) {
    case 'working':
      return { stage: 'working' };
    case 'stopping':
      return { stage: 'stopping' };
    case 'unknown':
      return { stage: 'unknown' };
    case 'session-missing':
      return { stage: 'session-missing' };
    case 'ended':
      return view.proposal ? { stage: 'stopped', proposal: view.proposal } : { stage: 'stopped' };
  }
}

/** Why Continue is refused now, when it is: the option's unavailable form. */
export function continueRefusal(view: AgentAttemptView): UnavailableAgent | undefined {
  return view.continue.kind === 'unavailable' ? view.continue : undefined;
}

/**
 * The refusals the Now block explains itself, with the paths or the Session they are about; every
 * other reason is the shared blocker alert (`AgentBlocker`).
 */
export function ownRefusal(
  option: AgentOption | undefined,
): 'baseline-changed' | 'session-gone' | undefined {
  if (option?.kind !== 'unavailable') {
    return undefined;
  }

  return option.reason === 'baseline-changed'
    ? 'baseline-changed'
    : option.reason === 'session-unavailable'
      ? 'session-gone'
      : undefined;
}
