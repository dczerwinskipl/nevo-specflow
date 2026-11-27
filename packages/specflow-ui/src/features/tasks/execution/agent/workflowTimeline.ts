import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import type { AgentHistoryItem, HistoryItem } from './AgentAttemptHistory';

type AttemptItem = Extract<HistoryItem, { kind: 'attempt' }>;
type ReturnItem = Extract<HistoryItem, { kind: 'return' }>;

/**
 * One entry of a Specification's Activity history that the workflow history holds: what someone
 * achieved, never the lifecycle. `at` places it in time (an attempt by its start, a decision or a
 * return by its own time) and `order` breaks ties by the run's record order.
 */
export type WorkflowTimelineEntry =
  | {
      readonly kind: 'agent-attempt';
      readonly key: string;
      readonly at: string;
      readonly order: number;
      readonly item: AgentHistoryItem;
    }
  /** An attempt without an agent's detail: the owner's own (Start, Finish, after a take over). */
  | {
      readonly kind: 'attempt';
      readonly key: string;
      readonly at: string;
      readonly order: number;
      readonly item: AttemptItem & { readonly actor: NonNullable<AttemptItem['actor']> };
    }
  /** The owner's return while no attempt was active. */
  | {
      readonly kind: 'return';
      readonly key: string;
      readonly at: string;
      readonly order: number;
      readonly item: ReturnItem;
    };

/**
 * The workflow history as Activity history entries, and the Sessions they already represent (an
 * agent attempt's Session, reached through its Open session). A wait step's attempt (no actor) is
 * the workflow's own lifecycle and is left out. The owner's Confirm or Reject of a result stays in
 * the attempt's data and is shown with that attempt, not as an entry of its own.
 */
export function workflowTimeline(history: WorkflowHistory | undefined): {
  readonly entries: readonly WorkflowTimelineEntry[];
  readonly sessionIds: ReadonlySet<string>;
} {
  const entries: WorkflowTimelineEntry[] = [];
  const sessionIds = new Set<string>();
  for (const item of history?.items ?? []) {
    if (item.kind === 'return') {
      entries.push({
        kind: 'return',
        key: `return-${String(item.sequence)}`,
        at: item.at,
        order: item.sequence,
        item,
      });
      continue;
    }

    const key = `${item.step}-${String(item.attempt)}`;
    if (item.agent) {
      sessionIds.add(item.agent.sessionId);
      entries.push({
        kind: 'agent-attempt',
        key,
        at: item.startedAt,
        order: item.sequence,
        item: item as AgentHistoryItem,
      });
    } else if (item.actor) {
      if (item.actor.class === 'agent' && item.actor.details.sessionId) {
        sessionIds.add(item.actor.details.sessionId);
      }

      entries.push({
        kind: 'attempt',
        key,
        at: item.startedAt,
        order: item.sequence,
        item: { ...item, actor: item.actor },
      });
    }
  }

  return { entries, sessionIds };
}
