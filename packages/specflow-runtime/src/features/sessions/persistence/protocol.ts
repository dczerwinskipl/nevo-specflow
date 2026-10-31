import type {
  CreateSession,
  StartTurn,
  RespondInteraction,
  Interaction,
  WorkSummary,
  SessionSnapshot,
  TurnSummary,
  TurnOutcome,
  SessionChange,
  RefreshTelemetry,
  TelemetryGroup,
  TelemetryContextUsage,
  TelemetryLimitWindow,
} from '@nevo/specflow-contracts/sessions';

export type MeasurementFact =
  | {
      kind: 'measurement';
      sampleId: string;
      metric: 'cost';
      basis: 'delta' | 'turn-total' | 'session-cumulative';
      /** Establishes accounting origin without claiming measured Turn spend. */
      baseline?: true;
      value: {
        currency: 'USD';
        amount: string;
        basis: 'provider-reported';
        meaning: 'api-equivalent' | 'billed' | 'unknown';
      };
    }
  | { kind: 'measurement'; sampleId: string; metric: 'context'; value: TelemetryContextUsage }
  | {
      kind: 'measurement';
      sampleId: string;
      metric: 'limits';
      /** Native push updates only these windows; full read snapshots omit this flag. */
      windowUpdate?: true;
      value: { windows: TelemetryLimitWindow[] };
    };

export type DriverFact =
  | MeasurementFact
  | { kind: 'interaction-expired'; key: string }
  | { kind: 'correlation'; providerSessionId: string }
  | { kind: 'work-open'; key: string; workKind: WorkSummary['kind']; title: string }
  | { kind: 'work-update'; key: string; state: WorkSummary['state'] }
  | { kind: 'action-open'; key: string; parentKey: string; title: string }
  | { kind: 'action-update'; key: string; state: WorkSummary['state'] }
  | {
      kind: 'usage';
      sampleId: string;
      basis: 'delta' | 'turn-total' | 'session-cumulative';
      baseline?: true;
      counters: NonNullable<TurnSummary['usage']>;
    }
  | { kind: 'progress'; activity: 'waiting' | 'responding'; label: string }
  | {
      kind: 'text';
      key: string;
      channel: 'commentary' | 'reasoning' | 'answer' | 'tool-input' | 'tool-output';
      text: string;
    }
  | {
      kind: 'interaction';
      key: string;
      interaction:
        | Omit<
            Extract<Interaction, { kind: 'question' }>,
            'interactionId' | 'turnId' | 'workId' | 'revision'
          >
        | Omit<
            Extract<Interaction, { kind: 'permission' }>,
            'interactionId' | 'turnId' | 'workId' | 'revision'
          >;
    }
  | { kind: 'outcome'; outcome: TurnOutcome; error?: { code: string; message: string } }
  | { kind: 'lost'; message: string };

export type StoreCommand =
  | {
      op: 'replay';
      actor: string;
      command: string;
      scope: string;
      requestId: string;
      input: unknown;
    }
  | { op: 'create'; actor: string; input: CreateSession }
  | {
      op: 'start';
      actor: string;
      sessionId: string;
      input: StartTurn;
      nativeWorkspace?: string;
      nativeScope?: string;
      nativeContextMode?: 'reserved' | 'provider-assigned';
      nativeWorkspaceIdentity?: string;
      effectBinding?: string;
    }
  | { op: 'dispatch-intent'; sessionId: string; turnId: string; invocationId: string }
  | { op: 'effect-candidates'; sessionId?: string; turnId?: string; afterSession?: string }
  | {
      op: 'reconcile-effect';
      sessionId: string;
      turnId: string;
      invocationId: string;
      binding: string;
      actor: string;
      requestId: string;
      source: 'native-result' | 'not-dispatched';
      outcome: TurnOutcome;
      error?: { code: string; message: string };
      recovered?: boolean;
    }
  | {
      op: 'fact';
      sessionId: string;
      turnId: string;
      invocationId: string;
      driverSeq: number;
      fact: DriverFact;
    }
  | { op: 'cancel'; actor: string; sessionId: string; turnId: string; requestId: string }
  | {
      op: 'response-delivered';
      sessionId: string;
      turnId: string;
      invocationId: string;
      nativeKeys: readonly string[];
    }
  | {
      op: 'respond';
      actor: string;
      sessionId: string;
      interactionId: string;
      input: RespondInteraction;
    }
  | { op: 'snapshot'; sessionId: string; actor: string }
  | { op: 'telemetry'; sessionId: string; expectedScope?: string }
  | { op: 'telemetry-source'; sessionId: string }
  | { op: 'telemetry-migrate' }
  | { op: 'telemetry-refresh-admit'; sessionId: string; actor: string; input: RefreshTelemetry }
  | { op: 'telemetry-refresh-replay'; sessionId: string; actor: string; input: RefreshTelemetry }
  | {
      op: 'telemetry-refresh-state';
      sessionId: string;
      state: 'queued' | 'running' | 'idle';
      groups: TelemetryGroup[];
      failed?: boolean;
      expectedGeneration?: string;
    }
  | {
      op: 'telemetry-observations';
      sessionId: string;
      measurements: Extract<DriverFact, { kind: 'measurement' }>[];
      expectedScope?: string;
      expectedGeneration?: string;
      observedAt?: string;
    }
  | { op: 'telemetry-observation-fence'; sessionId: string; scope: string; generation: string }
  | { op: 'telemetry-expire'; sessionId: string }
  | { op: 'identity'; sessionId: string }
  | { op: 'history'; sessionId: string; actor: string; before: string; limit: number }
  | { op: 'work'; sessionId: string; turnId: string; actor: string; before?: string; limit: number }
  | {
      op: 'actions';
      sessionId: string;
      workId: string;
      actor: string;
      before?: string;
      limit: number;
    }
  | {
      op: 'content';
      sessionId: string;
      contentId: string;
      revision: string;
      offset: number;
      limitBytes: number;
    }
  | { op: 'events'; sessionId: string; after: number }
  | { op: 'close' };

export interface StartAdmission {
  turnId: string;
  invocationId: string;
  fresh: boolean;
  providerContext?: { nativeSessionId: string; resume: boolean; scope: string };
}
export interface SnapshotSource {
  snapshot: SessionSnapshot;
  olderOrdinal?: number;
}
export interface EventBatch {
  events: SessionChange[];
  latest: number;
  oldest: number;
}
export interface WorkerRequest {
  id: number;
  command: StoreCommand;
}
export interface StoreReadMetrics {
  rows: number;
  contentBytes: number;
}
export interface WorkerReply {
  id: number;
  /** Sessions whose outbox changed in a committed transaction, never speculative facts. */
  changed?: string[];
  result?: unknown;
  metrics?: StoreReadMetrics;
  error?: { code: string; message: string; details?: { turnId?: string; reason?: string } };
}
export interface StoredSession {
  nativeWorkspaceIdentity?: string;
  snapshot: SessionSnapshot;
  ordinal: number;
}
export interface StoredTurn {
  nativeContextMode?: 'reserved' | 'provider-assigned';
  effectBinding?: string;
  summary: TurnSummary;
  invocationId: string;
  cancelRequested: boolean;
}
export interface EffectRecoveryCandidate {
  sessionId: string;
  turnId: string;
  invocationId: string;
  binding: string;
  nativeDispatched: boolean;
  workspace: string;
  workspaceIdentity?: string;
}
