import type {
  SessionSnapshot,
  StartTurn,
  RespondInteraction,
  SessionChange,
} from '@nevo/specflow-contracts/sessions';
import { utf8Bytes, SessionLimits } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { applySessionEvent, conversationWindow, mergeEntries, prependHistory } from './model';

export interface FeedState {
  snapshot?: SessionSnapshot;
  connection: 'loading' | 'connected' | 'reconnecting' | 'error';
  historyBusy: boolean;
  historyError: boolean;
  commandBusy: boolean;
  commandError: boolean;
  away: boolean;
  hasNew: boolean;
  draft: string;
  pending?: StartTurn;
}
interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function createSessionFeed(
  api: ManagedSessionsApi,
  sessionId: string,
  owner: string,
  storage?: BrowserStorage,
) {
  const key = 'nevo:session:' + owner + ':' + sessionId;
  const read = (suffix: string) => {
    try {
      return storage?.getItem(key + suffix) ?? '';
    } catch {
      return '';
    }
  };
  const save = (suffix: string, value: string) => {
    try {
      if (value) storage?.setItem(key + suffix, value);
      else storage?.removeItem(key + suffix);
    } catch {
      /* Browser storage may be unavailable; current in-memory draft remains usable. */
    }
  };
  let pending: StartTurn | undefined;
  try {
    const value: unknown = JSON.parse(read(':pending') || 'null');
    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string' &&
      'requestId' in value &&
      typeof value.requestId === 'string'
    )
      pending = { message: value.message, requestId: value.requestId };
  } catch {
    /* A malformed browser record is not a command. */
  }
  let state: FeedState = {
    connection: 'loading',
    historyBusy: false,
    historyError: false,
    commandBusy: false,
    commandError: false,
    away: false,
    hasNew: false,
    draft: read(':draft'),
    ...(pending ? { pending } : {}),
  };
  const listeners = new Set<() => void>();
  const workListeners = new Set<(turnId: string) => void>();
  let controller: AbortController | undefined,
    generation = 0;
  const notify = (next: FeedState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  function apply(event: SessionChange) {
    if (!state.snapshot) return;
    let incoming = event;
    if (state.away && event.kind === 'conversation') {
      const existing = new Set(state.snapshot.entries.map((e) => e.id));
      incoming = {
        ...event,
        changes: {
          ...event.changes,
          entries: event.changes.entries.filter((e) => existing.has(e.id)),
        },
      };
    }
    const snapshot = applySessionEvent(state.snapshot, incoming);
    notify({
      ...state,
      snapshot,
      connection: 'connected',
      hasNew: state.hasNew || (state.away && event.kind === 'conversation'),
    });
    const changedTurn =
      event.kind === 'work'
        ? event.changes.turnId
        : event.kind === 'turn'
          ? event.changes.turn.turnId
          : event.kind === 'interaction'
            ? event.changes.projection.activeTurn?.turnId
            : undefined;
    if (changedTurn) for (const listener of workListeners) listener(changedTurn);
  }
  async function run(signal: AbortSignal, token: number) {
    try {
      while (!signal.aborted && token === generation) {
        const fresh = await api.snapshot(sessionId, signal);
        if (signal.aborted || token !== generation) return;
        const old = state.snapshot;
        const entries = old ? mergeEntries(old.entries, fresh.entries) : fresh.entries;
        const gap =
          old?.entries.length &&
          fresh.entries.length &&
          fresh.entries[0]!.ordinal > old.entries.at(-1)!.ordinal + 1;
        const snapshot =
          old && !gap && entries.length <= conversationWindow
            ? { ...fresh, entries, history: old.history }
            : fresh;
        notify({
          ...state,
          snapshot:
            state.away && old ? { ...fresh, entries: old.entries, history: old.history } : snapshot,
          connection: 'connected',
          hasNew: state.hasNew || !!gap,
        });
        let restart = false;
        for await (const event of api.watch(sessionId, fresh.eventSeq, signal, () => {
          if (token === generation) notify({ ...state, connection: 'reconnecting' });
        })) {
          if (signal.aborted || token !== generation) return;
          if (!event) {
            restart = true;
            break;
          }
          if (
            state.snapshot &&
            event.sessionId === sessionId &&
            event.eventSeq > state.snapshot.eventSeq + 1
          ) {
            restart = true;
            break;
          }
          apply(event);
          if ((state.snapshot?.entries.length ?? 0) > conversationWindow) {
            restart = true;
            break;
          }
        }
        if (!restart) return;
      }
    } catch {
      if (!signal.aborted && token === generation) notify({ ...state, connection: 'error' });
    }
  }
  async function send() {
    if (state.commandBusy) return;
    const request = state.pending ?? { requestId: crypto.randomUUID(), message: state.draft };
    if (!request.message.trim()) return;
    if (utf8Bytes(request.message) > SessionLimits.messageBytes) {
      notify({ ...state, commandError: true });
      return;
    }
    save(':pending', JSON.stringify(request));
    notify({ ...state, pending: request, commandBusy: true, commandError: false });
    try {
      await api.start(sessionId, request);
      if (read(':pending') === JSON.stringify(request)) save(':pending', '');
      const draft = state.draft === request.message ? '' : state.draft;
      if (read(':draft') === request.message) save(':draft', '');
      const next = { ...state, draft, commandBusy: false };
      delete next.pending;
      notify(next);
    } catch {
      notify({ ...state, commandBusy: false, commandError: true });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeWork(listener: (turnId: string) => void) {
      workListeners.add(listener);
      return () => workListeners.delete(listener);
    },
    connect() {
      controller?.abort();
      controller = new AbortController();
      const token = ++generation;
      notify({
        ...state,
        historyBusy: false,
        connection: state.snapshot ? 'reconnecting' : 'loading',
      });
      void run(controller.signal, token);
      return () => {
        if (token === generation) {
          generation++;
          controller?.abort();
        }
      };
    },
    disconnect() {
      generation++;
      controller?.abort();
    },
    setDraft(draft: string) {
      save(':draft', draft);
      notify({ ...state, draft });
    },
    setAway(away: boolean) {
      if (state.away !== away) notify({ ...state, away });
    },
    send,
    async older() {
      const before = state.snapshot?.history.before;
      if (!before || state.historyBusy) return;
      const token = generation;
      notify({ ...state, historyBusy: true, historyError: false, away: true });
      try {
        const page = await api.history(sessionId, before, controller?.signal);
        if (token !== generation || !state.snapshot) return;
        const snapshot = prependHistory(state.snapshot, page);
        const trimmed = snapshot.entries.length > conversationWindow;
        if (trimmed) snapshot.entries = snapshot.entries.slice(0, conversationWindow);
        notify({ ...state, snapshot, historyBusy: false, hasNew: state.hasNew || trimmed });
      } catch {
        if (token === generation) notify({ ...state, historyBusy: false, historyError: true });
      }
    },
    latest() {
      state = {
        ...state,
        snapshot: undefined,
        away: false,
        hasNew: false,
        historyError: false,
        historyBusy: false,
      };
      return this.connect();
    },
    async cancel() {
      const turnId = state.snapshot?.activeTurn?.turnId;
      if (!turnId || state.commandBusy) return;
      notify({ ...state, commandBusy: true, commandError: false });
      try {
        await api.cancel(sessionId, turnId, crypto.randomUUID());
        notify({ ...state, commandBusy: false });
      } catch {
        notify({ ...state, commandBusy: false, commandError: true });
      }
    },
    async respond(interactionId: string, input: RespondInteraction) {
      if (state.commandBusy) return;
      notify({ ...state, commandBusy: true, commandError: false });
      try {
        await api.respond(sessionId, interactionId, input);
        notify({ ...state, commandBusy: false });
      } catch {
        notify({ ...state, commandBusy: false, commandError: true });
      }
    },
  };
}
export type SessionFeed = ReturnType<typeof createSessionFeed>;
