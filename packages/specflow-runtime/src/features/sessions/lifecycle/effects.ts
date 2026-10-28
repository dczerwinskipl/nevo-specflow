import type { TurnOutcome } from '@nevo/specflow-contracts/sessions';
import { createHash } from 'node:crypto';
import type { Invocation } from '../providers/driver';

export interface SessionEffectIdentity {
  invocationId: string;
  sessionId: string;
  binding: string;
  workspace: string;
  workspaceIdentity?: string;
}
export interface SessionEffectClaim {
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
