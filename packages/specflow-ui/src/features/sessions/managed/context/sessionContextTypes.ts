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
 * Every section is optional: a missing section simply does not render (graceful degradation),
 * and adding a future section (Handovers, Evidence, …) must not require reworking this shape or
 * its consumers.
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
  | { kind: 'batch'; role?: string; tasks: SessionContextTaskRef[] };

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

export interface SessionContextViewModel {
  /** `unavailable` means the projection itself could not be read (missing capability/backend
   * error), which must read differently from a legitimately empty section. */
  status: 'ready' | 'unavailable';
  specification?: { id: string; key: string; title: string };
  executionScope?: SessionContextExecutionScope;
  attention?: SessionContextAttentionItem[];
  relatedTasks?: SessionContextTaskRef[];
  /**
   * The Session's current/most-recent Turn, when one exists — the id `SessionContext`'s own
   * "Work history" row opens (reuses the same `managed-session-work` Secondary tab `ManagedSession`
   * already creates for Conversation's own compact Work summaries, full-session-screen-structure.md
   * §7.4/§8.3: one Work root tab, reused regardless of entry point, never a second instance).
   * Absent: the row does not render (same "missing fact hides the row" rule as every other optional
   * section here) — there is no cross-Turn "list all Turns" projection yet (owner decision: scope
   * v1 to the current Turn only; full history needs a new backend endpoint, a separate task).
   */
  activeTurnId?: string;
  /**
   * The Turn that is in flight right now — the Managed Sessions snapshot's `activeTurn.turnId`,
   * which the contract only carries while a Turn is running (`ActiveTurnSchema`, absent/`null`
   * once it settles). Absent when no Turn is running, even if the Session itself is still active
   * and ready for the next message. Unlike `activeTurnId` above ("current or most recent"), this
   * never names a settled Turn, so the context-window caption can tell "Current Turn" (the measured
   * Turn is this one) from "Last Turn" (the measurement belongs to a Turn that has settled).
   */
  runningTurnId?: string;
  /**
   * Low-emphasis "Session details" (§7.2/§23): token usage, cost, context occupancy, rate
   * limits. Demo data against the not-yet-merged PR #107 contract — see `sessionTelemetry.ts`.
   * Absent/fully-`unavailable` telemetry renders nothing, same as the other optional sections.
   */
  telemetry?: TelemetrySnapshot;
}

/**
 * Honest default for the real `ManagedSession` route: the managed Sessions contract currently has
 * no Specification/Task association projection at all, so Context has nothing to read yet. This is
 * an `unavailable` integration dependency, not a legitimately empty Context.
 */
export const unavailableSessionContext: SessionContextViewModel = { status: 'unavailable' };
