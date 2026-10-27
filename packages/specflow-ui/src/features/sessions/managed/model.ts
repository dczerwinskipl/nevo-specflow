import type {
  ConversationEntry,
  HistoryPage,
  SessionChange,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';

export const conversationWindow = 200;
export function mergeEntries(
  current: readonly ConversationEntry[],
  incoming: readonly ConversationEntry[],
): ConversationEntry[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const old = map.get(item.id);
    if (!old || old.revision < item.revision) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => a.ordinal - b.ordinal);
}
export function applySessionEvent(
  snapshot: SessionSnapshot,
  event: SessionChange,
): SessionSnapshot {
  if (snapshot.session.sessionId !== event.sessionId || event.eventSeq <= snapshot.eventSeq)
    return snapshot;
  if (event.eventSeq !== snapshot.eventSeq + 1) throw new Error('Session replay gap.');
  const next = {
    ...snapshot,
    eventSeq: event.eventSeq,
    revision: Math.max(snapshot.revision, event.eventSeq),
  };
  if (event.kind === 'session') next.session = event.changes.session;
  else if (event.kind === 'conversation')
    next.entries = mergeEntries(snapshot.entries, event.changes.entries);
  if (event.kind !== 'session' && 'projection' in event.changes && event.changes.projection) {
    const p = event.changes.projection;
    next.session = p.session;
    if (p.activeTurn) next.activeTurn = p.activeTurn;
    else delete next.activeTurn;
    if (p.currentActivity) next.currentActivity = p.currentActivity;
    else delete next.currentActivity;
    if (p.interaction) next.interaction = p.interaction;
    else delete next.interaction;
  }
  return next;
}
export function prependHistory(snapshot: SessionSnapshot, page: HistoryPage): SessionSnapshot {
  if (page.sessionId !== snapshot.session.sessionId) return snapshot;
  return {
    ...snapshot,
    entries: mergeEntries(snapshot.entries, page.entries),
    history: page.history,
  };
}
