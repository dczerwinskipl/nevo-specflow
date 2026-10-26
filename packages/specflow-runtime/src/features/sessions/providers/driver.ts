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
  selection: Pick<CreateSession, 'providerId' | 'mode' | 'providerModeId' | 'modelId' | 'effort'>;
  executionContext:
    | { kind: 'no-effects' }
    | { kind: 'read-only'; workspace: string; temporaryRoot: string; workspaceIdentity?: string }
    | {
        kind: 'workspace-write';
        workspace: string;
        temporaryRoot: string;
        workspaceIdentity: string;
        admission: { operationId: string; scope: 'project' };
      };
  providerContext?: { nativeSessionId: string; resume: boolean; scope?: string };
  beforeDispatch?: () => Promise<void>;
}
export type EmitFact = (fact: DriverFact) => Promise<void>;
export interface ProviderOperation {
  done: Promise<void>;
  /** Positive liveness evidence from the process owner; required for a writable driver. */
  settlement?: Promise<{
    process: 'stopped' | 'unknown';
    source: 'native-result' | 'not-started' | 'forced-stop' | 'unverified';
    result?: Extract<DriverFact, { kind: 'outcome' }>;
  }>;
  /** Keys whose answers crossed the native transport, possibly an entire question group. */
  respond(key: string, response: RespondInteraction): Promise<{ deliveredKeys: readonly string[] }>;
}
export interface SessionDriver {
  supportsManagedWrites?: boolean;
  describe(): ProviderDescriptor;
  refresh?(signal: AbortSignal): Promise<ProviderDescriptor>;
  contextScope?(): string;
  validate(selection: Invocation['selection'], signal?: AbortSignal): void | Promise<void>;
  start(invocation: Invocation, emit: EmitFact, signal: AbortSignal): ProviderOperation;
}
