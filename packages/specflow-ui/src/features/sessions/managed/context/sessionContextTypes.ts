/**
 * Product-owned view model of the Full Session Context Secondary.
 *
 * The Specification and Tasks sections come from the Session association read
 * (`GET /api/sessions/:sessionId/association`, mapped by `associationContext`); the executor, Work
 * history and telemetry are derived by the Session screen itself. Execution scope and Attention stay
 * in the shape for fixtures and future projections: an association is context, never current
 * execution, so the association read never fills them (session-association-ux §7).
 *
 * Every section is optional and carries a `ContextFact`: a section the Session has no association
 * with is absent (it simply does not render), while a section whose data is loading, unreadable,
 * missing or forbidden says so (see `sessionContextAvailability.ts`, full-session-screen-structure.md
 * §7.6). Adding a future section (Handovers, Evidence, …) must not require reworking this shape.
 */

import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import type { LimitsRefreshOutcome, LimitsRefreshState } from './sessionTelemetryStore';

/** The provider-limits refresh command, offered only to a user who may manage the Session. */
export interface LimitsRefreshControl extends LimitsRefreshState {
  readonly refresh: () => Promise<LimitsRefreshOutcome>;
}

export interface SessionContextTaskRef {
  id: string;
  /** Short stable key, e.g. "TASK-03". */
  key: string;
  title: string;
  /** Optional one-line state/reason shown under the title. */
  note?: string;
}

export type SessionContextExecutionScope =
  | { kind: 'generic' }
  | { kind: 'single-task'; role?: string; task: SessionContextTaskRef }
  | {
      kind: 'batch';
      role?: string;
      tasks: SessionContextTaskRef[];
      /** How many of the Session's Tasks could not be found; the `tasks` that were found still show. */
      missingTaskCount?: number;
    };

export interface SessionContextAttentionItem {
  id: string;
  tone: 'attention' | 'info' | 'neutral';
  summary: string;
  /** Present only when the item is a read-only orientation summary of a Session-owned control
   * that already lives in Primary (e.g. the pending interaction). Absent when the item instead
   * links to its own Task/Spec decision surface via `task`. */
  readOnly?: boolean;
  task?: SessionContextTaskRef;
}

/** Who runs this Session: the provider's own identity and the model (and effort) selected for the
 * next Turn, exactly as the Runtime and the composer report them — never inferred from titles. */
export interface SessionExecutor {
  providerId: string;
  providerTitle: string;
  modelTitle?: string;
  effort?: string;
}

/**
 * One piece of Context data together with what we know about it. `loading`: the read is in flight;
 * `ready`: we have the value; `unreadable`: the association exists but its data could not be read;
 * `missing`: the association exists but the referenced object cannot be found (`ref.key` names it
 * when the reference itself is known); `forbidden`: the association exists but the user may not view
 * the referenced object (no id, no title).
 */
export type ContextFact<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'unreadable' }
  | { status: 'missing'; ref?: { key?: string } }
  | { status: 'forbidden' };

/**
 * What kind of Session this is, which decides which sections are present and which are required.
 * `unknown` while the association read is in flight (`loading`: nothing is shown, a standalone
 * Session would otherwise flash sections that then vanish) or when it failed (`unreadable`).
 * An associated Session is always `specification`; `task` is never produced from the association.
 */
export type SessionScope =
  | { kind: 'unknown'; reason: 'loading' | 'unreadable' }
  | { kind: 'standalone' }
  | { kind: 'specification' }
  | { kind: 'task'; taskCount: number };

/** The Specification a Specification-/Task-scoped Session is associated with. */
export interface ContextSpecification {
  id: string;
  key: string;
  title: string;
  /** Its collection when known: links into an archived Specification carry `collection=archive`. */
  collection?: 'current' | 'archived';
}

export interface SessionContextViewModel {
  /** Replaces the former `status`: which sections are present/required for this Session. */
  scope: SessionScope;
  /** Who runs the Session (provider + selected model/effort), shown first; always required. The
   * Session screen derives it from the Runtime's provider catalogue and the composer's selection. */
  executor?: ContextFact<SessionExecutor>;
  specification?: ContextFact<ContextSpecification>;
  executionScope?: ContextFact<SessionContextExecutionScope>;
  attention?: ContextFact<SessionContextAttentionItem[]>;
  relatedTasks?: ContextFact<SessionContextTaskRef[]>;
  /** How many associated Tasks could not be found, of how many; the found ones still show. */
  relatedTasksMissing?: { count: number; total: number };
  /**
   * The Session's current/most-recent Turn — the id `SessionContext`'s own "Work history" row
   * opens (the same per-Turn Work tab Conversation's Work blocks open, full-session-screen-structure.md
   * §8.3). `loading` before the first snapshot; absent when the Session has no Turn yet. There is
   * no cross-Turn list projection yet (v1 scope: the current/last Turn only).
   */
  workHistory?: ContextFact<{ turnId: string }>;
  /**
   * The Turn that is in flight right now — the snapshot's `activeTurn.turnId`, present only while
   * a Turn runs. Lets the "Work" row and the context-window caption tell "Current Turn" from "Last
   * Turn".
   */
  runningTurnId?: string;
  /**
   * Low-emphasis "Session details" (§7.2/§23): token usage, cost, context occupancy, rate
   * limits, from `GET /api/sessions/:id/telemetry` (reference.api.session-telemetry).
   * Absent/fully-`unavailable` telemetry renders nothing.
   */
  telemetry?: TelemetrySnapshot;
  /**
   * The provider-limits refresh (full-session-screen-structure §7.7). Present only when the user may manage
   * the Session; the control itself also needs a `refreshable` limits reading.
   */
  limitsRefresh?: LimitsRefreshControl;
}
