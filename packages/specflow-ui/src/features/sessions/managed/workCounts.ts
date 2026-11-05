import type { WorkSummary } from '@nevo/specflow-contracts/sessions';

// Mirrors a proposed, not-yet-implemented extension to `WorkPage` documented at
// docs/reference/api/sessions.md ("Proposed Work aggregate counts") — swap to
// @nevo/specflow-contracts/sessions once the real server-side projection exists.
//
// session-chat-v10-design.md §3 requires that a Work summary-by-type count come from a bounded
// server projection, never from scanning the client's own loaded page (which only ever holds a
// bounded tail/window, never the Turn's true total). The real `WorkPage` has no such field yet:
// this is a product-owned local mirror of the documented proposal, used only so WorkInspector's
// summary row has something honest to render against demo fixtures until the real field exists.
// Do not compute this from `items.length` anywhere in product code — hide the whole summary row
// when it is absent (graceful degradation, no zeros/placeholders), the same discipline
// `isTelemetryVisible` applies for Session telemetry.

/** One filterable canonical Work kind. Never the mockup's finer reads/writes/commands/search
 * taxonomy — workGrouping.ts's own header comment already establishes that no such server-side
 * sub-kind exists; this aggregate must not invent one either. */
export type WorkKind = WorkSummary['kind'];

/** Bounded, server-projected Work aggregate for the whole Turn (not just the loaded page). */
export interface WorkCounts {
  /** Turn-wide total; never `items.length` of whatever page happens to be loaded. */
  total: number;
  /** Count of Work currently in the `active` state — the one state WorkInspector's own
   * `stateTone` already gives a distinct tone, so this mirrors an existing UI distinction rather
   * than inventing a new one. */
  inProgress: number;
  byKind: Record<WorkKind, number>;
}

/** A `WorkPage`/`ActionPage`-shaped value extended with the proposed, optional `counts`
 * projection — real HTTP responses never populate it; only fixtures do, until the backend
 * projection exists. */
export type WithWorkCounts<TPage> = TPage & { counts?: WorkCounts };

/**
 * PROPOSED, NOT YET BACKEND — what the agent actually did in a Turn, by tool sub-kind
 * (session-work-inspector-ui-spec.md §10-11's read/edit/write/list/search/command/test/web/other).
 * The canonical contract carries no tool sub-kind or state on a conversation entry (see `WorkKind`
 * above and `ConversationEntrySchema`), so this exists only as a demo-fixture extension of a
 * `work-summary` `ConversationEntry`, documented in session-chat-v10-design.md §3.1 ("Proposed Work
 * digest"). The Turn's latest entry carrying one wins. Real responses never populate it; the chat's
 * Work block then shows only the honest count of tool Work it has loaded.
 */
export type ToolActivityKind =
  'read' | 'edit' | 'write' | 'list' | 'search' | 'command' | 'test' | 'web' | 'other';

/** Display order: what changed the workspace and what verified it first, lookups after. */
export const toolActivityKinds: readonly ToolActivityKind[] = [
  'edit',
  'write',
  'command',
  'test',
  'read',
  'search',
  'list',
  'web',
  'other',
];

/** Every kind counts tool actions (not files); a Turn's own interruption is its outcome, not a
 * digest field, so the fact is shown once. */
export interface WorkDigest {
  /** Tool actions that finished successfully, per sub-kind. */
  done: Partial<Record<ToolActivityKind, number>>;
  /** Tool actions that failed, per sub-kind — the exceptional Work §4.5 says must stand out. */
  failed?: Partial<Record<ToolActivityKind, number>>;
}

export type WithWorkDigest<TEntry> = TEntry & { digest?: WorkDigest };
