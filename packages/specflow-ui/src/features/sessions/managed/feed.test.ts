import { describe, expect, it, vi } from 'vitest';
import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import type { SessionSnapshot, SessionChange } from '@nevo/specflow-contracts/sessions';
import { ApiError } from '../../../api';
import { createManagedSessionsApi, type ManagedSessionsApi } from './api';
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
  it('rechecks external login and reloads availability without replaying a retained request', async () => {
    const { storage, api, start } = setup();
    const providers = vi.fn<ManagedSessionsApi['providers']>().mockResolvedValue({ items: [] });
    api.providers = providers;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Explicit user intent');
    await feed.send();
    const pending = feed.getSnapshot().pending;
    await feed.recheckProvider();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('connected'));
    expect(providers).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(feed.getSnapshot().pending).toEqual(pending);
    expect(feed.getSnapshot().draft).toBe('Explicit user intent');
    await feed.send();
    expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
    feed.disconnect();
  });
  it('does not reconnect after a pending login recheck outlives its view', async () => {
    const { storage, api } = setup();
    const snapshotRead = vi.fn<ManagedSessionsApi['snapshot']>().mockResolvedValue(snapshot);
    api.snapshot = snapshotRead;
    const check = Promise.withResolvers<{ items: [] }>();
    api.providers = () => check.promise;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    const checking = feed.recheckProvider();
    feed.disconnect();
    check.resolve({ items: [] });
    await checking;
    expect(snapshotRead).not.toHaveBeenCalled();
    expect(feed.getSnapshot().commandBusy).toBe(false);
  });
  it.each(['remove-throws', 'remove-ignored'] as const)(
    'retains an acknowledged command until durable cleanup succeeds: %s',
    async (failure) => {
      const { storage, api } = setup();
      const start = vi.fn<ManagedSessionsApi['start']>().mockResolvedValue({ turnId: 'turn' });
      api.start = start;
      let cleanupAvailable = false;
      const intermittent = {
        ...storage,
        removeItem(key: string) {
          if (key.endsWith(':pending') && !cleanupAvailable) {
            if (failure === 'remove-throws') {
              throw new Error('Storage cleanup denied');
            }

            return;
          }

          storage.removeItem(key);
        },
      };
      const first = createSessionFeed(api, 'session', 'actor', intermittent);
      first.setDraft('First command');
      await first.send();
      const original = start.mock.calls[0]![1];
      expect(first.getSnapshot()).toMatchObject({
        pending: original,
        commandBusy: false,
        commandError: true,
      });
      const remounted = createSessionFeed(api, 'session', 'actor', intermittent);
      expect(remounted.getSnapshot().pending).toEqual(original);
      remounted.setDraft('Next command');
      await remounted.send();
      expect(start.mock.calls[1]![1]).toEqual(original);
      expect(remounted.getSnapshot().pending).toEqual(original);
      cleanupAvailable = true;
      await remounted.send();
      expect(start.mock.calls[2]![1]).toEqual(original);
      expect(remounted.getSnapshot().pending).toBeUndefined();
      expect(remounted.getSnapshot().draft).toBe('Next command');
      const recovered = createSessionFeed(api, 'session', 'actor', intermittent);
      expect(recovered.getSnapshot().pending).toBeUndefined();
      await recovered.send();
      expect(start.mock.calls[3]![1]).toMatchObject({ message: 'Next command' });
      expect(start.mock.calls[3]![1].requestId).not.toBe(original.requestId);
      expect(recovered.getSnapshot().pending).toBeUndefined();
    },
  );
  it.each(['missing', 'write-throws', 'write-ignored', 'readback-throws'] as const)(
    'does not dispatch without confirmed request retention: %s',
    async (failure) => {
      const { storage, api, start } = setup();
      let written = false;
      const blocked =
        failure === 'missing'
          ? undefined
          : {
              ...storage,
              setItem(key: string, value: string) {
                if (!key.endsWith(':pending')) {
                  return storage.setItem(key, value);
                }

                if (failure === 'write-throws') {
                  throw new Error('Storage denied');
                }

                written = true;
                if (failure !== 'write-ignored') {
                  storage.setItem(key, value);
                }
              },
              getItem(key: string) {
                if (written && key.endsWith(':pending') && failure === 'readback-throws') {
                  throw new Error('Storage read denied');
                }

                return storage.getItem(key);
              },
            };
      const feed = createSessionFeed(api, 'session', 'actor', blocked);
      feed.setDraft('Change workspace once');
      await feed.send();
      expect(start).not.toHaveBeenCalled();
      expect(feed.getSnapshot()).toMatchObject({
        draft: 'Change workspace once',
        commandBusy: false,
        commandError: true,
      });
    },
  );
  it('blocks an unreadable remount after a lost ACK and resumes the same terminal command when storage returns', async () => {
    const { storage, api } = setup();
    const executed = new Set<string>();
    let unavailable = false;
    const start = vi.fn<ManagedSessionsApi['start']>((_id, request) => {
      const duplicate = executed.has(request.requestId);
      executed.add(request.requestId);

      return duplicate
        ? Promise.resolve({ turnId: 'completed-turn' })
        : Promise.reject(new Error('Terminal outcome committed, ACK lost'));
    });
    api.start = start;
    const intermittent = {
      ...storage,
      getItem(key: string) {
        if (unavailable) {
          throw new Error('Storage denied');
        }

        return storage.getItem(key);
      },
    };
    const first = createSessionFeed(api, 'session', 'actor', intermittent);
    first.setDraft('Change workspace once');
    await first.send();
    unavailable = true;
    const unreadable = createSessionFeed(api, 'session', 'actor', intermittent);
    unreadable.setDraft('Change workspace once');
    await unreadable.send();
    expect(start).toHaveBeenCalledTimes(1);
    unavailable = false;
    const recovered = createSessionFeed(api, 'session', 'actor', intermittent);
    await recovered.send();
    expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
    expect(executed.size).toBe(1);
    expect(recovered.getSnapshot().pending).toBeUndefined();
    expect(
      createSessionFeed(api, 'session', 'actor', intermittent).getSnapshot().pending,
    ).toBeUndefined();
  });
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
  it('signals telemetry: resync after each snapshot load, then each telemetry revision', async () => {
    const { storage, api } = setup();
    api.watch = async function* (_id, _after, signal) {
      yield {
        sessionId: 'session',
        eventSeq: 1,
        kind: 'telemetry',
        changes: { telemetryRevision: 7 },
      } satisfies SessionChange;
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };

    const feed = createSessionFeed(api, 'session', 'actor', storage);
    const telemetry = vi.fn();
    feed.subscribeTelemetry(telemetry);
    feed.connect();
    try {
      await vi.waitFor(() =>
        expect(telemetry.mock.calls).toEqual([
          [{ kind: 'resync' }],
          [{ kind: 'revision', revision: 7 }],
        ]),
      );
      expect(feed.getSnapshot().snapshot?.eventSeq).toBe(1);
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
  it('threads the selected next-Turn model/effort override into StartTurn', async () => {
    const { storage, api } = setup();
    const start = vi.fn<ManagedSessionsApi['start']>().mockResolvedValue({ turnId: 'turn' });
    api.start = start;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Explicit next-Turn request');
    feed.setModel('model-a', 'high');
    await feed.send();
    expect(start.mock.calls[0]![1]).toMatchObject({ modelId: 'model-a', effort: 'high' });
  });
  it('omits model/effort overrides from StartTurn when the picker was never touched', async () => {
    const { storage, api } = setup();
    const start = vi.fn<ManagedSessionsApi['start']>().mockResolvedValue({ turnId: 'turn' });
    api.start = start;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Inherit the pinned Session model');
    await feed.send();
    expect(start.mock.calls[0]![1]).not.toHaveProperty('modelId');
    expect(start.mock.calls[0]![1]).not.toHaveProperty('effort');
  });
  it('clears a previously selected model/effort override once deselected', () => {
    const { storage, api } = setup();
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setModel('model-a', 'high');
    expect(feed.getSnapshot()).toMatchObject({ modelOverride: 'model-a', effortOverride: 'high' });
    feed.setModel(undefined, undefined);
    expect(feed.getSnapshot().modelOverride).toBeUndefined();
    expect(feed.getSnapshot().effortOverride).toBeUndefined();
  });
  it('threads the picked work mode into StartTurn as mode + providerModeId, over any shown default', async () => {
    const { storage, api } = setup();
    const start = vi.fn<ManagedSessionsApi['start']>().mockResolvedValue({ turnId: 'turn' });
    api.start = start;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Plan it first');
    feed.setWorkMode({ mode: 'read-only', providerModeId: 'plan' });
    await feed.send({ mode: 'workspace-write', providerModeId: 'acceptEdits' });
    expect(start.mock.calls[0]![1]).toMatchObject({ mode: 'read-only', providerModeId: 'plan' });
  });
  it("sends the shown catalogue default only when nothing is picked, and inherits the Session's mode otherwise", async () => {
    const { storage, api } = setup();
    const start = vi.fn<ManagedSessionsApi['start']>().mockResolvedValue({ turnId: 'turn' });
    api.start = start;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Use the default');
    await feed.send({ mode: 'workspace-write', providerModeId: 'acceptEdits' });
    expect(start.mock.calls[0]![1]).toMatchObject({
      mode: 'workspace-write',
      providerModeId: 'acceptEdits',
    });
    feed.setWorkMode({ mode: 'read-only', providerModeId: 'plan' });
    feed.setWorkMode(undefined);
    feed.setDraft('Inherit the Session mode');
    await feed.send();
    expect(start.mock.calls[1]![1]).not.toHaveProperty('mode');
    expect(start.mock.calls[1]![1]).not.toHaveProperty('providerModeId');
  });
  it('releases a definitely refused command: the Composer unlocks and the edited draft is a new request', async () => {
    const { storage, api } = setup();
    const refusal = new ApiError({
      kind: 'precondition',
      operation: 'sessions',
      outcome: 'not-applied',
      retryable: false,
      status: 422,
      code: 'CAPABILITY_UNSUPPORTED',
    });
    const start = vi
      .fn<ManagedSessionsApi['start']>()
      .mockRejectedValueOnce(refusal)
      .mockResolvedValue({ turnId: 'turn' });
    api.start = start;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Try an unsupported override');
    feed.setModel('model-a', 'ultra');
    await feed.send();
    expect(feed.getSnapshot()).toMatchObject({
      commandBusy: false,
      commandError: true,
      draft: 'Try an unsupported override',
      modelOverride: 'model-a',
    });
    expect(feed.getSnapshot().pending).toBeUndefined();
    expect(
      createSessionFeed(api, 'session', 'actor', storage).getSnapshot().pending,
    ).toBeUndefined();
    feed.setModel(undefined, undefined);
    feed.setDraft('Edited without the override');
    await feed.send();
    const [first, second] = [start.mock.calls[0]![1], start.mock.calls[1]![1]];
    expect(second).toMatchObject({ message: 'Edited without the override' });
    expect(second).not.toHaveProperty('modelId');
    expect(second.requestId).not.toBe(first.requestId);
    expect(feed.getSnapshot().commandError).toBe(false);
  });
  it('keeps the command when the Runtime answers SESSION_RECOVERY_REQUIRED (409, outcome unknown)', async () => {
    const { storage, api } = setup();
    const post = vi.fn().mockRejectedValue(
      new HttpClientError('conflict', {
        kind: 'http',
        status: 409,
        data: { error: 'session_error', code: 'SESSION_RECOVERY_REQUIRED', message: 'recover' },
      }),
    );
    const transport = createManagedSessionsApi({ post } as unknown as HttpRequestClient);
    const feed = createSessionFeed(
      { ...api, start: (id, input) => transport.start(id, input) },
      'session',
      'actor',
      storage,
    );
    feed.setDraft('Maybe applied');
    await feed.send();
    const pending = feed.getSnapshot().pending;
    expect(pending).toMatchObject({ message: 'Maybe applied' });
    expect(feed.getSnapshot().commandError).toBe(true);
    await feed.send();
    expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[0]![1]);
    expect(createSessionFeed(api, 'session', 'actor', storage).getSnapshot().pending).toEqual(
      pending,
    );
  });
  it('keeps the command when the start acknowledgement has the wrong shape (outcome unknown)', async () => {
    const { storage, api } = setup();
    const post = vi.fn().mockResolvedValue({ accepted: true });
    const transport = createManagedSessionsApi({ post } as unknown as HttpRequestClient);
    const feed = createSessionFeed(
      { ...api, start: (id, input) => transport.start(id, input) },
      'session',
      'actor',
      storage,
    );
    feed.setDraft('Maybe started');
    await feed.send();
    const pending = feed.getSnapshot().pending;
    expect(pending).toMatchObject({ message: 'Maybe started' });
    expect(feed.getSnapshot()).toMatchObject({ commandError: true, draft: 'Maybe started' });
    expect(createSessionFeed(api, 'session', 'actor', storage).getSnapshot().pending).toEqual(
      pending,
    );
  });
  it('treats any other 409 as a definite refusal of the command', async () => {
    const { storage, api } = setup();
    const post = vi.fn().mockRejectedValue(
      new HttpClientError('conflict', {
        kind: 'http',
        status: 409,
        data: { error: 'session_error', code: 'TURN_CONFLICT', message: 'busy' },
      }),
    );
    const transport = createManagedSessionsApi({ post } as unknown as HttpRequestClient);
    const feed = createSessionFeed(
      { ...api, start: (id, input) => transport.start(id, input) },
      'session',
      'actor',
      storage,
    );
    feed.setDraft('Refused');
    await feed.send();
    expect(feed.getSnapshot().pending).toBeUndefined();
    expect(feed.getSnapshot().commandError).toBe(true);
  });
  it('offers an explicit discard for an unreadable retained command and never overwrites it', async () => {
    const { storage, api, start } = setup();
    storage.setItem('nevo:session:actor:session:pending', '{not json');
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    expect(feed.getSnapshot().pendingUnreadable).toBe(true);
    feed.setDraft('New command');
    await feed.send();
    expect(start).not.toHaveBeenCalled();
    expect(storage.getItem('nevo:session:actor:session:pending')).toBe('{not json');
    expect(feed.discardPending()).toBe(true);
    expect(feed.getSnapshot()).toMatchObject({ pendingUnreadable: false, draft: 'New command' });
    await feed.send();
    expect(start).toHaveBeenCalledOnce();
  });
  it('keeps blocking, without a discard offer, while the retained command storage is unavailable', async () => {
    const { storage, api, start } = setup();
    const denied = {
      ...storage,
      getItem: () => {
        throw new Error('Storage denied');
      },
    };
    const feed = createSessionFeed(api, 'session', 'actor', denied);
    expect(feed.getSnapshot().pendingUnreadable).toBe(false);
    feed.setDraft('Blocked');
    await feed.send();
    expect(start).not.toHaveBeenCalled();
    expect(feed.discardPending()).toBe(false);
  });
  it('reuses one requestId for an identical interaction answer and a new one for a changed answer', async () => {
    const { storage, api } = setup();
    const respond = vi
      .fn<ManagedSessionsApi['respond']>()
      .mockRejectedValueOnce(new Error('Lost acknowledgement'))
      .mockResolvedValue({ turnId: 'turn', interactionId: 'interaction' });
    api.respond = respond;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    await feed.respond('interaction', { kind: 'permission', decision: 'allow' });
    await feed.respond('interaction', { kind: 'permission', decision: 'allow' });
    expect(respond.mock.calls[1]![2]).toEqual(respond.mock.calls[0]![2]);
    const lost = vi
      .fn<ManagedSessionsApi['respond']>()
      .mockRejectedValueOnce(new Error('Lost acknowledgement'))
      .mockResolvedValue({ turnId: 'turn', interactionId: 'interaction' });
    api.respond = lost;
    await feed.respond('interaction-2', { kind: 'permission', decision: 'allow' });
    await feed.respond('interaction-2', { kind: 'permission', decision: 'deny' });
    expect(lost.mock.calls[1]![2].requestId).not.toBe(lost.mock.calls[0]![2].requestId);
  });
  it('does not replay an interaction answer the Runtime definitely refused', async () => {
    const { storage, api } = setup();
    const expired = new ApiError({
      kind: 'conflict',
      operation: 'sessions',
      outcome: 'not-applied',
      retryable: false,
      status: 409,
      code: 'INTERACTION_EXPIRED',
    });
    const respond = vi
      .fn<ManagedSessionsApi['respond']>()
      .mockRejectedValueOnce(expired)
      .mockResolvedValue({ turnId: 'turn', interactionId: 'interaction' });
    api.respond = respond;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    await feed.respond('interaction', { kind: 'permission', decision: 'allow' });
    await feed.respond('interaction', { kind: 'permission', decision: 'allow' });
    expect(respond.mock.calls[1]![2].requestId).not.toBe(respond.mock.calls[0]![2].requestId);
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

const unknownTurnId = '00000000-0000-4000-8000-0000000000aa';
const unknownTurnSnapshot = {
  ...snapshot,
  activeTurn: {
    turnId: unknownTurnId,
    state: 'unknown',
    revision: 1,
    startedAt: '2026-11-08T10:00:00Z',
  },
} as unknown as SessionSnapshot;
const sessionError = (status: number, code: string) =>
  new HttpClientError(code, {
    kind: 'http',
    status,
    data: { error: 'session_error', code, message: code },
  });

describe('Session feed reconcile of an unknown Turn', () => {
  function connected(answer: () => Promise<unknown>) {
    const { storage, api } = setup();
    api.snapshot = vi.fn().mockResolvedValue(unknownTurnSnapshot);
    const post = vi.fn((_url: string, _body: unknown) => answer());
    const transport = createManagedSessionsApi({ post } as unknown as HttpRequestClient);
    api.reconcile = (id, turnId, requestId) => transport.reconcile(id, turnId, requestId);
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();

    return { feed, post };
  }

  it('reuses the request id after a lost answer and returns the settled result', async () => {
    const answers = [
      () => Promise.reject(new HttpClientError('offline', { kind: 'network' })),
      () => Promise.resolve({ turnId: unknownTurnId, outcome: 'failed', reconciled: true }),
    ];
    const { feed, post } = connected(() => answers.shift()!());
    await vi.waitFor(() => expect(feed.getSnapshot().snapshot).toBeDefined());
    await expect(feed.reconcile()).resolves.toBeUndefined();
    expect(feed.getSnapshot().reconcile).toEqual({
      turnId: unknownTurnId,
      status: 'unconfirmed',
    });
    await expect(feed.reconcile()).resolves.toEqual({
      turnId: unknownTurnId,
      outcome: 'failed',
      reconciled: true,
    });
    expect(post.mock.calls[0]![0]).toBe(`/api/sessions/session/turns/${unknownTurnId}/reconcile`);
    expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[0]![1]);
    // Settled: the Turn's new state comes from the stream, nothing is patched locally.
    expect(feed.getSnapshot().reconcile).toBeUndefined();
    expect(feed.getSnapshot().snapshot?.activeTurn?.state).toBe('unknown');
    feed.disconnect();
  });

  it('keeps the Turn unknown on 409 SESSION_RECOVERY_REQUIRED and sends a new request next time', async () => {
    const { feed, post } = connected(() =>
      Promise.reject(sessionError(409, 'SESSION_RECOVERY_REQUIRED')),
    );
    await vi.waitFor(() => expect(feed.getSnapshot().snapshot).toBeDefined());
    await feed.reconcile();
    expect(feed.getSnapshot().reconcile).toEqual({
      turnId: unknownTurnId,
      status: 'noEvidence',
    });
    expect(feed.getSnapshot().snapshot?.activeTurn?.state).toBe('unknown');
    await feed.reconcile();
    expect(post.mock.calls[1]![1]).not.toEqual(post.mock.calls[0]![1]);
    feed.disconnect();
  });

  it('ignores a second press while the check is pending', async () => {
    const answer = Promise.withResolvers<never>();
    const { feed, post } = connected(() => answer.promise);
    await vi.waitFor(() => expect(feed.getSnapshot().snapshot).toBeDefined());
    const first = feed.reconcile();
    expect(feed.getSnapshot().reconcile?.status).toBe('pending');
    await feed.reconcile();
    expect(post).toHaveBeenCalledOnce();
    answer.reject(new Error('lost'));
    await first;
    feed.disconnect();
  });

  it('sends nothing when the active Turn is not unknown', async () => {
    const { storage, api } = setup();
    const reconcile = vi.fn();
    api.reconcile = reconcile;
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().snapshot).toBeDefined());
    await feed.reconcile();
    expect(reconcile).not.toHaveBeenCalled();
    feed.disconnect();
  });
});

describe('Session feed and a deleted or archived Session', () => {
  it('reports a Session read answered 404 SESSION_NOT_FOUND as not found', async () => {
    const { storage, api } = setup();
    const get = vi.fn().mockRejectedValue(sessionError(404, 'SESSION_NOT_FOUND'));
    const transport = createManagedSessionsApi({ get } as unknown as HttpRequestClient);
    api.snapshot = (id, signal) => transport.snapshot(id, signal);
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().notFound).toBe(true));
  });

  it('reports a stream that reconnects into 404 SESSION_NOT_FOUND as not found', async () => {
    const { storage, api } = setup();
    // eslint-disable-next-line require-yield
    api.watch = async function* () {
      await Promise.resolve();

      throw sessionError(404, 'SESSION_NOT_FOUND');
    };

    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().notFound).toBe(true));
    expect(feed.getSnapshot().snapshot).toBeDefined();
  });

  it('treats any other stream failure as a lost connection, not a deleted Session', async () => {
    const { storage, api } = setup();
    // eslint-disable-next-line require-yield
    api.watch = async function* () {
      await Promise.resolve();

      throw sessionError(503, 'SESSION_STORE_UNAVAILABLE');
    };

    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().connection).toBe('error'));
    expect(feed.getSnapshot().notFound).toBe(false);
  });

  it('drops a retained start refused with 409 SESSION_ARCHIVED, keeps the draft and shows no retry', async () => {
    const { storage, api } = setup();
    const post = vi.fn().mockRejectedValue(sessionError(409, 'SESSION_ARCHIVED'));
    const transport = createManagedSessionsApi({ post } as unknown as HttpRequestClient);
    api.start = (id, input) => transport.start(id, input);
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.setDraft('Archived elsewhere');
    await feed.send();
    expect(feed.getSnapshot()).toMatchObject({
      commandError: false,
      archivedRefusal: true,
      draft: 'Archived elsewhere',
    });
    expect(feed.getSnapshot().pending).toBeUndefined();
    expect(storage.getItem('nevo:session:actor:session:pending')).toBeNull();
  });

  it('drops an interaction answer refused with 409 SESSION_ARCHIVED without the retry copy', async () => {
    const { storage, api } = setup();
    const post = vi
      .fn<(url: string, body: { requestId: string }) => Promise<never>>()
      .mockRejectedValue(sessionError(409, 'SESSION_ARCHIVED'));
    const transport = createManagedSessionsApi({ post } as unknown as HttpRequestClient);
    api.respond = (id, interactionId, input) => transport.respond(id, interactionId, input);
    const feed = createSessionFeed(api, 'session', 'actor', storage);
    await feed.respond('interaction', { kind: 'permission', decision: 'allow' });
    await feed.respond('interaction', { kind: 'permission', decision: 'allow' });
    expect(feed.getSnapshot()).toMatchObject({ commandError: false, archivedRefusal: true });
    expect(post.mock.calls[1]![1].requestId).not.toBe(post.mock.calls[0]![1].requestId);
  });

  it('clears the archived refusal when the Session projection arrives', async () => {
    const { storage, api } = setup();
    api.start = vi.fn().mockRejectedValue(
      new ApiError({
        kind: 'conflict',
        operation: 'sessions',
        outcome: 'not-applied',
        retryable: false,
        status: 409,
        code: 'SESSION_ARCHIVED',
      }),
    );
    const archived = {
      kind: 'session',
      sessionId: 'session',
      eventSeq: 1,
      changes: { session: { ...snapshot.session, archivedAt: '2026-11-08T10:00:00Z' } },
    } as unknown as SessionChange;
    const event = Promise.withResolvers<void>();
    api.watch = async function* (_id, _after, signal) {
      await event.promise;
      yield archived;
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };

    const feed = createSessionFeed(api, 'session', 'actor', storage);
    feed.connect();
    await vi.waitFor(() => expect(feed.getSnapshot().snapshot).toBeDefined());
    feed.setDraft('Too late');
    await feed.send();
    expect(feed.getSnapshot().archivedRefusal).toBe(true);
    event.resolve();
    await vi.waitFor(() => expect(feed.getSnapshot().archivedRefusal).toBe(false));
    expect(feed.getSnapshot().snapshot?.session.archivedAt).toBe('2026-11-08T10:00:00Z');
    feed.disconnect();
  });
});
