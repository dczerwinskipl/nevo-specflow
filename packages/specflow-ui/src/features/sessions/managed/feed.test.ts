import { describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot, SessionChange } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { createSessionFeed } from './feed';

const snapshot = {
  session: { sessionId: 'session' },
  eventSeq: 0,
  revision: 0,
  entries: [],
  history: { hasOlder: false },
} as unknown as SessionSnapshot;
function setup() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const start = vi
    .fn()
    .mockRejectedValueOnce(new Error('Lost acknowledgement'))
    .mockResolvedValue({ turnId: 'turn' });
  const api = {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    start,
    async *watch(_id: string, _after: number, signal: AbortSignal) {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      yield undefined;
    },
  } as unknown as ManagedSessionsApi;
  return { storage, api, start };
}
describe('Session feed operation lifetime', () => {
  it('invalidates Work reads when a Turn settles or its interaction completes', async () => {
    const { storage, api } = setup();
    api.watch = async function* (_id, _after, signal) {
      const projection = {
        session: snapshot.session,
        activeTurn: null,
        currentActivity: null,
        interaction: null,
      };
      yield {
        sessionId: 'session',
        eventSeq: 1,
        kind: 'turn',
        changes: {
          turn: {
            turnId: 'turn',
            state: 'terminal',
            outcome: 'cancelled',
            revision: 2,
            createdAt: 'now',
            updatedAt: 'now',
            completedAt: 'now',
            userMessage: { text: 'request', complete: true },
          },
          projection,
        },
      } satisfies SessionChange;
      yield {
        sessionId: 'session',
        eventSeq: 2,
        kind: 'interaction',
        changes: {
          projection: {
            ...projection,
            activeTurn: { turnId: 'another', state: 'active', revision: 2, startedAt: 'now' },
          },
        },
      } satisfies SessionChange;
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    const refresh = vi.fn();
    feed.subscribeWork(refresh);
    feed.connect();
    try {
      await vi.waitFor(() => expect(refresh.mock.calls).toEqual([['turn'], ['another']]));
    } finally {
      feed.disconnect();
    }
  });
  it('does not clear a newer owner draft or command when an unmounted request settles', async () => {
    const { storage, api } = setup();
    let accept: () => void = () => {
      throw new Error('Not started');
    };
    api.start = vi.fn(
      () =>
        new Promise<{ turnId: string }>((resolve) => {
          accept = () => resolve({ turnId: 'turn' });
        }),
    );
    const first = createSessionFeed(api, 'session', 'actor', storage);
    first.setDraft('Old command');
    const request = first.send();
    first.disconnect();
    const second = createSessionFeed(api, 'session', 'actor', storage);
    second.setDraft('New unsent draft');
    accept();
    await request;
    expect(createSessionFeed(api, 'session', 'actor', storage).getSnapshot().draft).toBe(
      'New unsent draft',
    );
  });
  it('retains the exact command across a failed request and route remount', async () => {
    const { storage, api, start } = setup();
    const first = createSessionFeed(api, 'session', 'actor', storage);
    first.setDraft('Unsent text');
    await first.send();
    expect(first.getSnapshot().pending).toBeDefined();
    const second = createSessionFeed(api, 'session', 'actor', storage);
    await second.send();
    expect(start.mock.calls[0]).toEqual(start.mock.calls[1]);
    expect(second.getSnapshot().draft).toBe('');
    expect(second.getSnapshot().pending).toBeUndefined();
  });
  it('partitions private browser drafts by authenticated identity', () => {
    const { storage, api } = setup();
    createSessionFeed(api, 'session', 'alice', storage).setDraft('Private');
    expect(createSessionFeed(api, 'session', 'bob', storage).getSnapshot().draft).toBe('');
  });
  it('does not clear a changed draft after the old command settles', async () => {
    const { storage, api } = setup();
    let accepted: () => void = () => {
      throw new Error('Command has not started');
    };
    api.start = vi.fn(
      () =>
        new Promise<{ turnId: string }>((resolve) => {
          accepted = () => resolve({ turnId: 'turn' });
        }),
    );
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('First');
    const sent = feed.send();
    feed.setDraft('New text');
    accepted();
    await sent;
    expect(feed.getSnapshot().draft).toBe('New text');
  });
  it('disconnects the latest retry connection when its owner unmounts', async () => {
    const { storage, api } = setup();
    const signals: AbortSignal[] = [];
    api.watch = async function* (_id, _after, signal) {
      signals.push(signal);
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      yield undefined;
    };
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    feed.connect();
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    feed.disconnect();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});
