import type {
  CreateSession,
  StartTurn,
  ProviderDescriptor,
  RespondInteraction,
} from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../persistence/protocol';

export interface Invocation {
  sessionId: string;
  turnId: string;
  invocationId: string;
  request: StartTurn;
  selection: Pick<CreateSession, 'providerId' | 'mode' | 'modelId' | 'effort'>;
  executionContext: { kind: 'no-effects' };
}
export type EmitFact = (fact: DriverFact) => Promise<void>;
export interface ProviderOperation {
  done: Promise<void>;
  respond(key: string, response: RespondInteraction): Promise<void>;
}
export interface SessionDriver {
  describe(): ProviderDescriptor;
  validate(selection: Invocation['selection']): void;
  start(invocation: Invocation, emit: EmitFact, signal: AbortSignal): ProviderOperation;
}
