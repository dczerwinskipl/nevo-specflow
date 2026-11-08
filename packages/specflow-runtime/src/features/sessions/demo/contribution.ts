import type { DemoSpecification } from '../../demo-catalogue';
export interface SessionSummary {
  id: string;
  title: string;
  status: 'active' | 'attention' | 'quiet' | 'unknown';
  taskIds: string[];
}
export function buildDemoSessions(record: DemoSpecification): SessionSummary[] {
  if (!record.currentExecutions) {
    return [];
  }

  const sessions = new Map<string, SessionSummary>();
  for (const execution of record.currentExecutions) {
    sessions.set(execution.sessionId, {
      id: execution.sessionId,
      title: execution.agentRole + ' · ' + record.title,
      status: 'active',
      taskIds: [...execution.taskIds],
    });
  }

  for (const signal of record.signals ?? []) {
    if (signal.target.kind !== 'session') {
      continue;
    }

    const id = signal.target.sessionId;
    if (!sessions.has(id)) {
      sessions.set(id, {
        id,
        title: signal.label,
        status: signal.kind === 'attention' ? 'attention' : 'quiet',
        taskIds: [],
      });
    }
  }

  return [...sessions.values()];
}

/**
 * Recommendation candidates: attention, then active, then the rest in section order (the demo
 * catalogue has no update time, so section order stands in for recency).
 */
export function rankDemoSessions(
  items: readonly Pick<SessionSummary, 'id' | 'status'>[],
): string[] {
  const rank = (status: SessionSummary['status']) =>
    status === 'attention' ? 0 : status === 'active' ? 1 : 2;

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.status) - rank(b.item.status) || a.index - b.index)
    .map(({ item }) => item.id);
}

export function buildDemoSessionContribution(record: DemoSpecification) {
  const items = buildDemoSessions(record);
  const attention = (record.signals ?? []).flatMap((signal) =>
    signal.kind === 'attention' && signal.target.kind === 'session'
      ? [
          {
            id: signal.id,
            kind: 'session' as const,
            title: signal.label,
            reason: signal.reason ?? signal.label,
            targetId: signal.target.sessionId,
            priority: signal.attentionReason === 'input' ? ('high' as const) : ('normal' as const),
          },
        ]
      : [],
  );

  return {
    section: { state: 'available' as const, data: { items, attention } },
    recommendedSessionIds: rankDemoSessions(items),
  };
}
