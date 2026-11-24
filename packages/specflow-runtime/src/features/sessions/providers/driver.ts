import type {
  CreateSession,
  StartTurn,
  ProviderDescriptor,
  RespondInteraction,
  TelemetryGroup,
} from '@nevo/specflow-contracts/sessions';
import type { DriverFact, MeasurementFact } from '../persistence/protocol';
import type { NativeProcessIdentity } from './process/process-identity';
import { PROVIDER_DISCOVERY_BUDGET_MS } from '@nevo/specflow-contracts/sessions';

export interface ProviderTelemetryBinding {
  accountScope: string;
  credentialGeneration: string;
}
export interface ProviderTelemetry {
  readonly refreshableGroups: readonly TelemetryGroup[];
  /** Read-only identity checks, bounded with refresh by the caller's shared deadline. */
  binding(signal: AbortSignal): Promise<ProviderTelemetryBinding>;
  /** No prompt, thread start/resume, authentication repair or model mutation. */
  refresh(
    request: {
      groups: readonly TelemetryGroup[];
      binding: ProviderTelemetryBinding;
    },
    signal: AbortSignal,
  ): Promise<MeasurementFact[]>;
}

export interface Invocation {
  sessionId: string;
  turnId: string;
  invocationId: string;
  request: StartTurn;
  selection: Pick<CreateSession, 'providerId' | 'mode' | 'providerModeId' | 'modelId' | 'effort'>;
  executionContext:
    | { kind: 'no-effects' }
    | {
        kind: 'read-only';
        workspace: string;
        temporaryRoot: string;
        workspaceIdentity?: string;
        /** The Specification whose workspace this is (a Session associated with it). */
        specId?: string;
      }
    | {
        kind: 'workspace-write';
        workspace: string;
        temporaryRoot: string;
        workspaceIdentity: string;
        specId?: string;
        /** The Engine claim: `workspace` is the root it claimed, the only folder a write may use. */
        admission: { operationId: string; scope: 'project'; workspace: string };
      };
  providerContext?: { nativeSessionId: string; resume: boolean; scope?: string };
  /**
   * Per-invocation `NEVO_*` entries of the provider process environment (a write Turn's broker
   * endpoint and invocation capability, D11), and the values its diagnostics must redact. A writable
   * driver merges `values` into the environment of the process it launches for this invocation.
   */
  runtimeEnvironment?: {
    readonly values: Readonly<Record<string, string>>;
    readonly secrets: readonly string[];
  };
  /**
   * The provider's own allowlist for this Turn (agent step execution, D20): tool rules it may use without a
   * prompt, already limited to the rules the Runtime recognises. Never merged with owner or project
   * permissions. Read only by a driver with `supportsPermissionAllowlist`.
   */
  permissions?: { readonly allow: readonly string[] };
  beforeDispatch?: () => Promise<void>;
  /**
   * Durably records the native-stop evidence of the invocation's provider process; a driver passes
   * it as `record` to the launch of that process (never to discovery helpers). Present with
   * `beforeDispatch`.
   */
  recordProcess?: (identity: NativeProcessIdentity) => Promise<void>;
}
export type EmitFact = (fact: DriverFact) => Promise<void>;
/** Discovery may initialize several bounded native mode profiles on a cold machine. */
export const ProviderTimeouts = {
  discoveryMs: PROVIDER_DISCOVERY_BUDGET_MS,
  initializeMs: 10000,
} as const;
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
  readonly telemetryGroups?: readonly TelemetryGroup[];
  readonly telemetry?: ProviderTelemetry;
  /** Some native protocols allocate the persistent context during thread/start.
   * Its identity must be durably correlated before any user input is dispatched. */
  readonly nativeContextMode?: 'reserved' | 'provider-assigned';
  supportsManagedWrites?: boolean;
  /** The driver turns `Invocation.permissions` into its provider's native allowlist. */
  supportsPermissionAllowlist?: boolean;
  /**
   * The driver runs a read-only invocation in the verified workspace its execution context names
   * (a Specification's worktree), not only in the Runtime's own checkout.
   */
  supportsSessionWorkspaces?: boolean;
  describe(): ProviderDescriptor;
  /** `recheck`: discover the executable again from scratch and probe again (an explicit recheck). */
  refresh?(signal: AbortSignal, options?: { recheck?: boolean }): Promise<ProviderDescriptor>;
  contextScope?(): string;
  /**
   * Ends the driver's own background work (a discovery the Runtime started at start or behind a
   * read): aborts it and resolves once its provider processes have settled. Later reads start none.
   */
  close?(): Promise<void>;
  validate(selection: Invocation['selection'], signal?: AbortSignal): void | Promise<void>;
  start(invocation: Invocation, emit: EmitFact, signal: AbortSignal): ProviderOperation;
}
