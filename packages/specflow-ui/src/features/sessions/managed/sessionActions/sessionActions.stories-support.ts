import { HttpClientError } from '@nevo/http-client';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { ApiError } from '../../../../api';
import type { ManagedSessionsApi } from '../api';
import { sessionErrorCodes } from '../api';
import { liveFixtureApi } from '../managedSession.liveFeed.stories-support';
import { fixtureSessionId, sessionFixture } from '../managedSession.stories-support';

export const unknownTurnId = '00000000-0000-4000-8000-0000000000a1';

/**
 * How a scripted command answers: `ok` (and its `session`/`turn` change follows on the stream),
 * `lost` (no answer: outcome unknown), `hold` (waits for `release()`), or a Session error code
 * with its HTTP status.
 */
export type ScriptedAnswer = 'ok' | 'lost' | 'hold' | { status: number; code: string };

type Command = 'rename' | 'archive' | 'unarchive' | 'delete' | 'reconcile' | 'start' | 'respond';

/** A failure as the transport raises it (classified, with the Session code table). */
function failure(answer: Exclude<ScriptedAnswer, 'ok' | 'hold'>): ApiError {
  if (answer === 'lost') {
    return new ApiError({
      kind: 'network',
      operation: 'sessions',
      outcome: 'unknown',
      retryable: true,
    });
  }

  const rule = sessionErrorCodes[answer.code];

  return new ApiError({
    kind:
      rule?.kind ??
      (answer.status === 403 ? 'forbidden' : answer.status === 404 ? 'not-found' : 'conflict'),
    operation: 'sessions',
    outcome: rule?.outcome ?? 'not-applied',
    retryable: false,
    status: answer.status,
    code: answer.code,
    cause: new HttpClientError(answer.code, { kind: 'http', status: answer.status }),
  });
}

/** A Session whose last Turn ended with an unknown outcome. */
export function unknownTurnSnapshot(manage = true): SessionSnapshot {
  const base = sessionFixture();

  return {
    ...base,
    session: {
      ...base.session,
      readiness: 'unavailable',
      capabilities: { ...base.session.capabilities, manage, start: false, cancel: false },
    },
    activeTurn: {
      turnId: unknownTurnId,
      state: 'unknown',
      revision: 4,
      startedAt: '2026-10-25T10:02:00Z',
    },
    currentActivity: { kind: 'unknown', turnId: unknownTurnId, label: 'Turn outcome is unknown' },
  };
}

/** An archived Session (read-only: no start). */
export function archivedSnapshot(manage = true): SessionSnapshot {
  const base = sessionFixture();

  return {
    ...base,
    session: {
      ...base.session,
      archivedAt: '2026-10-25T10:05:00Z',
      capabilities: { ...base.session.capabilities, manage, start: false },
    },
  };
}

/**
 * The Session fixture with scripted management commands: each press takes the next scripted
 * answer (the last one repeats). A successful command delivers its live change on the stream, as
 * the Runtime does; the screen never patches itself from the answer.
 */
export function scriptedActionsApi(
  snapshot: SessionSnapshot,
  script: Partial<Record<Command, ScriptedAnswer[]>> = {},
) {
  const live = liveFixtureApi(snapshot);
  let session = snapshot.session;
  const held: (() => void)[] = [];
  const calls: Record<Command, unknown[]> = {
    rename: [],
    archive: [],
    unarchive: [],
    delete: [],
    reconcile: [],
    start: [],
    respond: [],
  };
  const answer = async (command: Command, input: unknown) => {
    calls[command].push(input);
    const answers = script[command] ?? ['ok'];
    const next = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (next === 'hold') {
      await new Promise<void>((resolve) => held.push(resolve));

      return;
    }

    if (next !== 'ok') {
      throw failure(next);
    }
  };

  // `endStream()`: the Runtime deleted the Session; its stream closes and every read is 404.
  const gone = Promise.withResolvers<'gone'>();
  let isGone = false;
  const notFound = () => failure({ status: 404, code: 'SESSION_NOT_FOUND' });

  const changeSession = (next: SessionSnapshot['session']) => {
    session = next;
    // After the acknowledgement, as the Runtime's change arrives on the stream.
    setTimeout(() => live.pushChange({ kind: 'session', changes: { session } }), 0);

    return { session };
  };

  const api: ManagedSessionsApi = {
    ...live.api,
    snapshot: (...args) => (isGone ? Promise.reject(notFound()) : live.api.snapshot(...args)),
    async *watch(id, after, signal, onReconnect) {
      if (isGone) {
        throw notFound();
      }

      const stream = live.api.watch(id, after, signal, onReconnect)[Symbol.asyncIterator]();
      for (;;) {
        const next = await Promise.race([stream.next(), gone.promise]);
        if (next === 'gone') {
          throw notFound();
        }

        if (next.done) {
          return;
        }

        yield next.value;
      }
    },
    rename: async (_id, input) => {
      await answer('rename', input);

      return changeSession({ ...session, title: input.title.trim() });
    },
    archive: async (_id, input) => {
      await answer('archive', input);

      return changeSession({
        ...session,
        archivedAt: '2026-10-25T10:05:00Z',
        capabilities: { ...session.capabilities, start: false },
      });
    },
    unarchive: async (_id, input) => {
      await answer('unarchive', input);
      const { archivedAt: _archivedAt, ...restored } = session;

      return changeSession({ ...restored, capabilities: { ...session.capabilities, start: true } });
    },
    delete: async (id) => {
      await answer('delete', id);
    },
    reconcile: async (_id, turnId, requestId) => {
      await answer('reconcile', requestId);
      setTimeout(
        () =>
          live.pushChange({
            kind: 'turn',
            changes: {
              turn: {
                turnId,
                state: 'terminal',
                outcome: 'failed',
                revision: 5,
                createdAt: '2026-10-25T10:02:00Z',
                updatedAt: '2026-10-25T10:03:00Z',
                completedAt: '2026-10-25T10:03:00Z',
                userMessage: { text: 'Uruchom testy', complete: true },
              },
              projection: {
                session: { ...session, readiness: 'ready' },
                activeTurn: null,
                currentActivity: null,
                interaction: null,
              },
            },
          }),
        0,
      );

      return { turnId, outcome: 'failed', reconciled: true };
    },
    start: async (id, input) => {
      await answer('start', input);

      return live.api.start(id, input);
    },
    respond: async (id, interactionId, input) => {
      await answer('respond', input);

      return live.api.respond(id, interactionId, input);
    },
  };

  return {
    api,
    calls,
    watched: live.watched,
    pushChange: (change: Parameters<typeof live.pushChange>[0]) => live.pushChange(change),
    /** The Session is gone on the Runtime: the open stream ends in 404, as do later reads. */
    endStream() {
      isGone = true;
      gone.resolve('gone');
    },
    /** Lets every held command answer `ok`. */
    release() {
      for (const resolve of held.splice(0)) {
        resolve();
      }
    },
  };
}

export { fixtureSessionId };
