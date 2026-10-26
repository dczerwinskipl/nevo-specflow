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
} from '@nevo/specflow-contracts/sessions';

export type DriverFact =
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
    }
  | { op: 'dispatch-intent'; sessionId: string; turnId: string; invocationId: string }
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
      op: 'respond';
      actor: string;
      sessionId: string;
      interactionId: string;
      input: RespondInteraction;
    }
  | { op: 'snapshot'; sessionId: string; actor: string }
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
  result?: unknown;
  metrics?: StoreReadMetrics;
  error?: { code: string; message: string; details?: { turnId?: string; reason?: string } };
}
export interface StoredSession {
  snapshot: SessionSnapshot;
  ordinal: number;
}
export interface StoredTurn {
  summary: TurnSummary;
  invocationId: string;
  cancelRequested: boolean;
}
