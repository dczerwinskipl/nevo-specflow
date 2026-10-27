import { describe, expect, it } from 'vitest';
import type {
  ConversationEntry,
  SessionSnapshot,
  SessionChange,
} from '@nevo/specflow-contracts/sessions';
import { applySessionEvent, mergeEntries, prependHistory } from './model';

function entry(id: string, ordinal: number, revision = 1): ConversationEntry {
  return {
    id,
    ordinal,
    revision,
    turnId: 'turn',
    kind: 'commentary',
    createdAt: 'now',
    text: { text: id, complete: true },
  };
}
const snapshot = {
  session: { sessionId: 'session' },
  revision: 3,
  eventSeq: 3,
  entries: [entry('live', 5, 4)],
  history: { hasOlder: true, before: 'cursor' },
} as SessionSnapshot;
describe('bounded Session conversation reconciliation', () => {
  it('merges older pages without regressing a newer live item', () => {
    const page = {
      sessionId: 'session',
      eventSeq: 2,
      entries: [entry('older', 1), entry('live', 5, 2)],
      history: { hasOlder: false },
    };
    const next = prependHistory(snapshot, page);
    expect(next.entries.map((e) => e.id)).toEqual(['older', 'live']);
    expect(next.entries[1]?.revision).toBe(4);
    expect(next.eventSeq).toBe(3);
  });
  it('deduplicates repeated events and rejects replay gaps', () => {
    const duplicate = {
      sessionId: 'session',
      eventSeq: 3,
      kind: 'conversation',
      changes: { entries: [entry('duplicate', 7)] },
    } as SessionChange;
    expect(applySessionEvent(snapshot, duplicate)).toBe(snapshot);
    expect(() => applySessionEvent(snapshot, { ...duplicate, eventSeq: 5 })).toThrow('gap');
  });
  it('clears expired attention from the authoritative small projection', () => {
    const event = {
      sessionId: 'session',
      eventSeq: 4,
      kind: 'interaction',
      changes: {
        projection: {
          session: snapshot.session,
          activeTurn: null,
          currentActivity: null,
          interaction: null,
        },
      },
    } as SessionChange;
    const next = applySessionEvent(
      { ...snapshot, interaction: { interactionId: 'stale' } as SessionSnapshot['interaction'] },
      event,
    );
    expect(next.interaction).toBeUndefined();
  });
  it('keeps canonical order and resource isolation', () => {
    expect(mergeEntries([entry('second', 2)], [entry('first', 1)]).map((e) => e.id)).toEqual([
      'first',
      'second',
    ]);
    expect(
      prependHistory(snapshot, {
        sessionId: 'another',
        eventSeq: 4,
        entries: [],
        history: { hasOlder: false },
      }),
    ).toBe(snapshot);
  });
});
