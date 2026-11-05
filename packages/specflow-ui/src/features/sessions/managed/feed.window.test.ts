import { describe, expect, it, vi } from 'vitest';
import type {
  ConversationEntry,
  SessionChange,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { createSessionFeed } from './feed';

function entry(ordinal: number, revision = 1): ConversationEntry {
  return {
    id: 'e' + ordinal,
    ordinal,
    revision,
    turnId: 't' + ordinal,
    kind: 'answer',
    text: { text: 'text ' + ordinal, complete: true },
    createdAt: 'now',
  } as unknown as ConversationEntry;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => entry(from + index));
const conversation = (eventSeq: number, ...entries: ConversationEntry[]): SessionChange => ({
  sessionId: 'session',
  eventSeq,
  kind: 'conversation',
  changes: { entries },
});
const live = (entries: ConversationEntry[], eventSeq = 0, hasOlder = false): SessionSnapshot =>
  ({
    session: { sessionId: 'session' },
    eventSeq,
    revision: eventSeq,
    entries,
    history: hasOlder ? { hasOlder: true, before: 'cursor' } : { hasOlder: false },
  }) as unknown as SessionSnapshot;
const olderPage = (entries: ConversationEntry[]) => ({
  sessionId: 'session',
  entries,
  history: { hasOlder: true, before: 'earlier' },
});

/** A feed over a scripted Session: `snapshots` are read in turn, `push` feeds the live stream. */
function scripted(first: SessionSnapshot, ...later: SessionSnapshot[]) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  const snapshots = [first, ...later];
  const queue: (SessionChange | undefined)[] = [];
  let wake: (() => void) | undefined;
  let reads = 0;
  const snapshotRead = vi.fn(() =>
    Promise.resolve(snapshots[Math.min(reads++, snapshots.length - 1)]!),
  );
  const history = vi.fn();
  const api = {
    snapshot: snapshotRead,
    history,
    async *watch(_id: string, _after: number, signal: AbortSignal) {
      while (!signal.aborted) {
        if (queue.length) {
          yield queue.shift();
          continue;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }
    },
  };
  const feed = createSessionFeed(api as unknown as ManagedSessionsApi, 'session', 'actor', storage);

  return {
    history,
    snapshotRead,
    feed,
    push: (event: SessionChange | undefined) => {
      queue.push(event);
      wake?.();
    },
  };
}

const seq = (feed: ReturnType<typeof scripted>['feed']) => feed.getSnapshot().snapshot?.eventSeq;

describe('Session feed window', () => {
  it('keeps the latest Turn after older history trims the newest entries out of the window', async () => {
    const { history, feed } = scripted(live(range(101, 300), 0, true));
    history.mockResolvedValue(olderPage(range(61, 100)));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().latestTurnId).toBe('t300'));
    await feed.older();
    const state = feed.getSnapshot();
    expect(state.snapshot?.entries.at(-1)?.turnId).toBe('t260');
    expect(state.latestTurnId).toBe('t300');
    expect(state.detached).toBe(true);
    feed.disconnect();
  });

  it('follows live entries and never moves back for a late revision of an older one', async () => {
    const { feed, push } = scripted(live(range(1, 3)));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().latestTurnId).toBe('t3'));
    push(conversation(1, entry(4)));
    await vi.waitFor(() => expect(feed.getSnapshot().latestTurnId).toBe('t4'));
    push(conversation(2, entry(2, 2)));
    await vi.waitFor(() => expect(seq(feed)).toBe(2));
    expect(feed.getSnapshot().latestTurnId).toBe('t4');
    feed.disconnect();
  });

  it('applies live entries for a reader who is away, and marks nothing new for a revision', async () => {
    const { feed, push } = scripted(live(range(1, 3)));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('connected'));
    feed.setAway(true);
    push(conversation(1, entry(2, 2)));
    await vi.waitFor(() => expect(seq(feed)).toBe(1));
    expect(feed.getSnapshot()).toMatchObject({ away: true, hasNew: false, detached: false });
    push(conversation(2, entry(4)));
    await vi.waitFor(() => expect(seq(feed)).toBe(2));
    expect(feed.getSnapshot().snapshot?.entries.map((e) => e.ordinal)).toEqual([1, 2, 3, 4]);
    feed.disconnect();
  });

  it('keeps the entries a reconnect brings for a reader who is away', async () => {
    const { feed, push } = scripted(live(range(1, 3)), live(range(1, 4), 5));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('connected'));
    feed.setAway(true);
    push(undefined);
    await vi.waitFor(() => expect(seq(feed)).toBe(5));
    expect(feed.getSnapshot().snapshot?.entries.map((e) => e.ordinal)).toEqual([1, 2, 3, 4]);
    feed.disconnect();
  });

  it('does not mark the reader away while older history loads, and a failed page leaves nothing behind', async () => {
    const { history, feed } = scripted(live(range(1, 3), 0, true));
    history.mockRejectedValue(new Error('offline'));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('connected'));
    const loading = feed.older();
    expect(feed.getSnapshot()).toMatchObject({ historyBusy: true, away: false, detached: false });
    await loading;
    expect(feed.getSnapshot()).toMatchObject({
      historyBusy: false,
      historyError: true,
      away: false,
      detached: false,
    });
    feed.disconnect();
  });

  it('drops live entries only while detached, flags them, and leaves no hole after Jump to latest', async () => {
    const { history, snapshotRead, feed, push } = scripted(live(range(101, 300), 0, true));
    history.mockResolvedValue(olderPage(range(61, 100)));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('connected'));
    await feed.older();
    expect(feed.getSnapshot()).toMatchObject({ detached: true, hasNew: false });
    push(conversation(1, entry(301)));
    await vi.waitFor(() => expect(seq(feed)).toBe(1));
    expect(feed.getSnapshot().hasNew).toBe(true);
    expect(feed.getSnapshot().snapshot?.entries.some((e) => e.ordinal === 301)).toBe(false);
    snapshotRead.mockResolvedValue(live(range(102, 301), 1, true));
    feed.latest();
    // The old window stays until the live end arrives: no loading or "ready" flash.
    expect(feed.getSnapshot().snapshot).toBeDefined();
    expect(feed.getSnapshot()).toMatchObject({ detached: false, hasNew: false, away: false });
    await vi.waitFor(() => expect(feed.getSnapshot().snapshot?.entries.at(-1)?.ordinal).toBe(301));
    expect(feed.getSnapshot().snapshot!.entries.map((e) => e.ordinal)).toEqual(
      range(102, 301).map((e) => e.ordinal),
    );
    feed.disconnect();
  });

  it('keeps a detached window across a reconnect and flags the entries it did not take', async () => {
    const { history, feed, push } = scripted(
      live(range(101, 300), 0, true),
      live(range(103, 302), 5, true),
    );
    history.mockResolvedValue(olderPage(range(61, 100)));
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('connected'));
    await feed.older();
    push(undefined);
    await vi.waitFor(() => expect(seq(feed)).toBe(5));
    expect(feed.getSnapshot()).toMatchObject({ detached: true, hasNew: true });
    expect(feed.getSnapshot().snapshot?.entries.at(-1)?.ordinal).toBe(260);
    expect(feed.getSnapshot().latestTurnId).toBe('t302');
    feed.disconnect();
  });
});
