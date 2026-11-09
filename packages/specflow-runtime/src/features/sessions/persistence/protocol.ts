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
  RenameSession,
  ArchiveSession,
  SessionInfo,
  ToolOperation,
  SessionListFilter,
} from '@nevo/specflow-contracts/sessions';
import type { WorkAggregate } from '../lifecycle/work-aggregate';
import type { AssociationWrite } from './associations';

export type { AssociationWrite, StoredAssociation } from './associations';
export type {
  SessionIdentity,
  SessionListRow,
  SessionListScan,
  SessionListSummary,
  StoredListSummary,
} from './catalogue';

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
  | {
      kind: 'action-open';
      key: string;
      parentKey: string;
      title: string;
      /** Only from the provider's own tool identity; Runtime records `other` when absent. */
      operation?: ToolOperation;
    }
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
  /** `association` is an opaque sidecar written verbatim in the same transaction. */
  | { op: 'create'; actor: string; input: CreateSession; association?: AssociationWrite }
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
  | { op: 'rename'; actor: string; sessionId: string; input: RenameSession }
  | { op: 'archive'; actor: string; sessionId: string; input: ArchiveSession }
  | { op: 'unarchive'; actor: string; sessionId: string; input: ArchiveSession }
  | { op: 'delete'; sessionId: string }
  | { op: 'telemetry'; sessionId: string; expectedScope?: string }
  | { op: 'telemetry-source'; sessionId: string }
  | { op: 'telemetry-migrate' }
  | {
      op: 'telemetry-refresh-admit';
      sessionId: string;
      actor: string;
      input: RefreshTelemetry;
      binding: { accountScope: string; credentialGeneration: string };
    }
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
  | {
      op: 'telemetry-retire-observations';
      sessionId: string;
      nativeScope: string;
      observedScope: string;
      observedGeneration: string;
      expectedFence?: { scope: string; generation: string };
    }
  | { op: 'telemetry-expiry-deadline'; sessionId: string }
  | { op: 'telemetry-expire'; sessionId: string }
  /** `SessionIdentity`, including the home `specId` of an associated Session. */
  | { op: 'identity'; sessionId: string }
  /** `SessionIdentity[]` of the known IDs; at most 500 unique IDs, one indexed query. */
  | { op: 'identities'; sessionIds: string[] }
  /** `StoredAssociation | null`. */
  | { op: 'association'; sessionId: string }
  /** In-process workflow orchestrator only; refused for another home or a standalone Session. */
  | {
      op: 'associate-tasks';
      sessionId: string;
      specId: string;
      taskIds: string[];
      origin: 'workflow';
    }
  /**
   * `SessionListScan`: at most `scanBudget` (<= 500) index rows after `after` (a created_seq) or
   * after the row a signed `cursor` of the same filter names (never both).
   */
  | { op: 'list'; filter: SessionListFilter; after?: number; cursor?: string; scanBudget: number }
  /** A signed list cursor continuing after `after`, bound to the store, project and filter. */
  | { op: 'list-cursor'; filter: SessionListFilter; after: number }
  /** `StoredListSummary[]` for at most 100 Sessions, decoding only those rows. */
  | { op: 'summaries'; sessionIds: string[] }
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
/** Current stored Session projection after a management command, before HTTP authorization. */
export interface SessionView {
  session: SessionInfo;
  activeTurn?: SessionSnapshot['activeTurn'];
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
  /** Absent for unsolicited notifications after a Worker-owned commit. */
  id?: number;
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
  /** Absent for Turns created before Runtime maintained it (never backfilled). */
  work?: WorkAggregate;
  /** The Turn's latest `work-summary` entry, which carries the current Work digest. */
  workSummaryEntryId?: string;
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
