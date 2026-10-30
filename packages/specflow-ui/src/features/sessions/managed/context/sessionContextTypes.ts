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
}

/**
 * Honest default for the real `ManagedSession` route: the managed Sessions contract currently has
 * no Specification/Task association projection at all, so Context has nothing to read yet. This is
 * an `unavailable` integration dependency, not a legitimately empty Context.
 */
export const unavailableSessionContext: SessionContextViewModel = { status: 'unavailable' };
