/**
 * Product-owned mock view model for the Full Session Context Secondary (V1 scope).
 *
 * The real Managed Sessions contract (`@nevo/specflow-contracts/sessions`) has no
 * Specification/Task association today: `SessionInfo.projectId` is a trusted hosting scope,
 * not a Specification, and there is no execution-scope/attention/related-Task projection.
 * This shape is therefore NOT a backend contract — it is the product-level read model Context
 * needs, used here with representative fixtures (see `sessionContextFixtures.ts`) until a real
 * Runtime projection exists. See the Full Session UX report for the flagged backend dependency.
 *
 * Every section is optional and carries a `ContextFact`: a section the Session has no association
 * with is absent (it simply does not render), while a section whose data is loading, unreadable or
 * missing says so (see `sessionContextAvailability.ts`, full-session-screen-structure.md §7.6).
 * Adding a future section (Handovers, Evidence, …) must not require reworking this shape.
 */

import type { TelemetrySnapshot } from './sessionTelemetry';

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
 * when the reference itself is known).
 */
export type ContextFact<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'unreadable' }
  | { status: 'missing'; ref?: { key?: string } };

/**
 * What kind of Session this is, which decides which sections are present and which are required.
 * `unknown` is the real route today: the Runtime contract carries no Specification/Task
 * association yet, so we must not infer one (`not-provided`) or could not read it (`unreadable`).
 */
export type SessionScope =
  | { kind: 'unknown'; reason: 'not-provided' | 'unreadable' }
  | { kind: 'standalone' }
  | { kind: 'specification' }
  | { kind: 'task'; taskCount: number };

/** The Specification a Specification-/Task-scoped Session belongs to. */
export interface ContextSpecification {
  id: string;
  key: string;
  title: string;
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
   * limits. Demo data against the not-yet-merged PR #107 contract — see `sessionTelemetry.ts`.
   * Absent/fully-`unavailable` telemetry renders nothing.
   */
  telemetry?: TelemetrySnapshot;
}

/**
 * Honest default for the real `ManagedSession` route: the managed Sessions contract has no
 * Specification/Task association projection, so the scope is unknown (not provided) and only the
 * facts the screen can derive itself (executor, work history) are shown.
 */
export const realRouteSessionContext: SessionContextViewModel = {
  scope: { kind: 'unknown', reason: 'not-provided' },
};
