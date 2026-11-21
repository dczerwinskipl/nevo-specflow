import type { TurnOutcome } from '@nevo/specflow-contracts/sessions';
import { createHash } from 'node:crypto';
import type { Invocation } from '../providers/driver';

export interface SessionEffectIdentity {
  invocationId: string;
  sessionId: string;
  binding: string;
  workspace: string;
  workspaceIdentity?: string;
  /** The Specification whose workspace is claimed: admission re-checks its binding. */
  specId?: string;
  /**
   * The agent attempt the Turn belongs to (Ask agent), recorded in the claim's durable intent. A
   * recovery identity may lack it: the recorded intent is read then.
   */
  attemptId?: string;
}
export interface SessionEffectClaim {
  /** The workspace root the Engine claimed. */
  readonly workspace: string;
  dispatch(): Promise<void>;
  abandon(): Promise<void>;
  unknown(): Promise<void>;
  settle(evidence: { process: 'stopped'; outcome: TurnOutcome }): Promise<void>;
}
export interface SessionEffects {
  admit(identity: SessionEffectIdentity): Promise<SessionEffectClaim>;
  reconcile(identity: SessionEffectIdentity & { nativeDispatched: boolean }): Promise<
    | {
        process: 'stopped';
        outcome: TurnOutcome;
        source: 'native-result' | 'not-dispatched';
      }
    | undefined
  >;
  /**
   * Settles a dispatched or unknown claim as interrupted on positive native-stop evidence (no
   * process of the recorded identity remains). Refuses anything the claim lifecycle refuses.
   */
  settleStopped(identity: SessionEffectIdentity): Promise<void>;
}
export function executionBinding(
  sessionId: string,
  requestId: string,
  selection: Invocation['selection'],
  providerScope: string,
  workspaceIdentity: string,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sessionId,
        requestId,
        providerId: selection.providerId,
        providerScope,
        workspaceIdentity,
        mode: selection.mode,
        providerModeId: selection.providerModeId ?? null,
        modelId: selection.modelId ?? null,
        effort: selection.effort ?? null,
      }),
    )
    .digest('hex');
}
