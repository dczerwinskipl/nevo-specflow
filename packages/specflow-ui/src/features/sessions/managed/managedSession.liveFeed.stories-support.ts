import type {
  ConversationEntry,
  HistoryPage,
  SessionChange,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { fixtureApi, withRuntimeTitles } from './managedSession.stories-support';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * A fixture Session a play function drives live: `push` delivers conversation events on the open
 * watch stream (in order, right after the current snapshot's `eventSeq`), and older history can be
 * held back until the play releases it, so a story can make a new message or an older page land at
 * an exact moment relative to the reader's own scroll gesture.
 */
export function liveFixtureApi(
  snapshot: SessionSnapshot,
  options: {
    base?: ManagedSessionsApi;
    /** Hold every history page until `releaseHistory()`. */
    holdHistory?: boolean;
    /** What each history read returns; the base API's page otherwise. */
    historyPage?: (before: string) => HistoryPage;
    /** What every snapshot read after the first returns (a reconnect or "Jump to latest"). */
    nextSnapshot?: () => SessionSnapshot;
    /** Hold every large-content page until `releaseContent()` lets the next one through. */
    holdContent?: boolean;
  } = {},
) {
  const base = options.base ?? fixtureApi(snapshot);
  const heldContent: (() => void)[] = [];
  let contentReleases = 0;
  let eventSeq = snapshot.eventSeq;
  let reads = 0;
  let deliver: ((event: SessionChange) => void) | undefined;
  let watching: (() => void) | undefined;
  const watched = () =>
    new Promise<void>((resolve) => {
      if (deliver) {
        resolve();
      } else {
        watching = resolve;
      }
    });
  const heldHistory: (() => void)[] = [];
  let historyReads = 0;

  const api: ManagedSessionsApi = {
    ...base,
    snapshot: async (...args) => {
      reads += 1;
      const fresh =
        reads > 1 && options.nextSnapshot
          ? withRuntimeTitles(options.nextSnapshot())
          : await base.snapshot(...args);
      eventSeq = fresh.eventSeq;

      return fresh;
    },
    history: async (sessionId, before, signal) => {
      historyReads += 1;
      if (options.holdHistory) {
        await new Promise<void>((resolve) => heldHistory.push(resolve));
      }

      return options.historyPage
        ? options.historyPage(before)
        : base.history(sessionId, before, signal);
    },
    content: async (sessionId, ref, offset, signal) => {
      if (options.holdContent) {
        await new Promise<void>((resolve) => {
          if (contentReleases > 0) {
            contentReleases -= 1;
            resolve();
          } else {
            heldContent.push(resolve);
          }
        });
      }

      return base.content(sessionId, ref, offset, signal);
    },
    async *watch(_sessionId, _after, signal) {
      const queue: SessionChange[] = [];
      let wake: (() => void) | undefined;
      const sink = (event: SessionChange) => {
        queue.push(event);
        wake?.();
      };

      deliver = sink;
      watching?.();
      watching = undefined;
      try {
        while (!signal.aborted) {
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }

          await new Promise<void>((resolve) => {
            wake = resolve;
            signal.addEventListener('abort', () => resolve(), { once: true });
          });
        }
      } finally {
        if (deliver === sink) {
          deliver = undefined;
        }
      }
    },
  };

  return {
    api,
    /** Resolves once a watch stream is open to deliver `push`ed events. */
    watched,
    /** Delivers the entries as one conversation event on the open watch stream. */
    push(...entries: ConversationEntry[]) {
      if (!deliver) {
        throw new Error('No watch stream is open yet: await watched() first.');
      }

      eventSeq += 1;
      deliver({
        sessionId: snapshot.session.sessionId,
        eventSeq,
        kind: 'conversation',
        changes: { entries },
      });
    },
    /** Delivers any other Session change (a `session` or `turn` change) on the open watch stream. */
    pushChange(change: DistributiveOmit<SessionChange, 'sessionId' | 'eventSeq'>) {
      if (!deliver) {
        throw new Error('No watch stream is open yet: await watched() first.');
      }

      eventSeq += 1;
      deliver({ ...change, sessionId: snapshot.session.sessionId, eventSeq });
    },
    /** How many history pages were requested so far. */
    historyReads: () => historyReads,
    /**
     * Lets the waiting large-content reads through (a remounted text may have left an earlier read
     * of the same page waiting), or the next one as soon as it is requested.
     */
    releaseContent() {
      const waiting = heldContent.splice(0);
      if (waiting.length) {
        waiting.forEach((release) => release());
      } else {
        contentReleases += 1;
      }
    },
    /** Lets every held history read complete. */
    releaseHistory() {
      for (const release of heldHistory.splice(0)) {
        release();
      }
    },
  };
}

/** A completed answer entry after `snapshot`'s newest one, for a live conversation event. */
export function nextAnswer(
  snapshot: SessionSnapshot,
  index: number,
  text: string,
): ConversationEntry {
  const newest = snapshot.entries.at(-1)!;

  return {
    id: `live-answer-${index}`,
    turnId: newest.turnId,
    ordinal: newest.ordinal + index,
    revision: 1,
    kind: 'answer',
    createdAt: newest.createdAt,
    text: { text, complete: true },
  };
}
