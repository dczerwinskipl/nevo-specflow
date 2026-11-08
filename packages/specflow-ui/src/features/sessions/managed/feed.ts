import type {
  SessionSnapshot,
  StartTurn,
  RespondInteraction,
  SessionChange,
  ReconcileTurnResult,
} from '@nevo/specflow-contracts/sessions';
import { utf8Bytes, SessionLimits } from '@nevo/specflow-contracts/sessions';
import { isApiError, type ApiErrorKind } from '../../../api';
import { writeOutcomeUnknown } from '../../../shared/http/apiErrorCode';
import { sendRetained, type RequestAttempt } from '../../../shared/operations/retainedRequest';
import { sessionErrorCode, type ManagedSessionsApi } from './api';
import { applySessionEvent, conversationWindow, mergeEntries, prependHistory } from './model';

/** An interaction answer without its idempotency key, which the feed retains. */
export type RespondAnswer = RespondInteraction extends infer T
  ? T extends unknown
    ? Omit<T, 'requestId'>
    : never
  : never;
export interface FeedState {
  snapshot?: SessionSnapshot;
  connection: 'loading' | 'connected' | 'reconnecting' | 'error';
  historyBusy: boolean;
  historyError: boolean;
  commandBusy: boolean;
  commandError: boolean;
  /** The reader has scrolled away from the bottom (drives the "Jump to latest" pill). */
  away: boolean;
  /**
   * The loaded window no longer reaches the live end (older history pushed the newest entries
   * out, or the reader was away while newer ones arrived): live entries are not applied until
   * `latest()`. Independent of where the reader scrolled.
   */
  detached: boolean;
  /** Entries newer than the loaded window were dropped while `detached`. */
  hasNew: boolean;
  /** The Turn the Session's Work history belongs to: in flight, else the newest known. */
  latestTurnId?: string;
  /**
   * The retained Turn record exists but cannot be read. It may hold a command whose acknowledgement
   * was lost, so it blocks sending until `discardPending()` is chosen explicitly.
   */
  pendingUnreadable: boolean;
  draft: string;
  /** Next-Turn model override; omitted inherits the Session's current model. */
  modelOverride?: string;
  /** Next-Turn effort override; omitted inherits the Session's current effort. */
  effortOverride?: string;
  /** Next-Turn work mode (engine mode + provider mode id); omitted inherits the Session's own. */
  workModeOverride?: Required<Pick<StartTurn, 'mode' | 'providerModeId'>>;
  pending?: StartTurn;
  /**
   * The Session read answered 404 `SESSION_NOT_FOUND`: it was deleted (elsewhere) or never
   * existed. Final for this feed.
   */
  notFound: boolean;
  /**
   * A send, an interaction answer or a retained start was refused with 409 `SESSION_ARCHIVED`
   * (archived in another view). Holds until the next Session projection (snapshot or `session`
   * change) says what the Session is now.
   */
  archivedRefusal: boolean;
  /** The user's check of the `unknown` Turn `turnId` (absent: nothing asked or it settled). */
  reconcile?: ReconcileState;
}
/**
 * `pending`: the request is in flight. `settled`: the Runtime answered 200; it stays until the
 * stream moves the Turn out of `unknown` (nothing to press meanwhile). `noEvidence`: 409
 * `SESSION_RECOVERY_REQUIRED`, the Turn stays unknown and the next press is a new request.
 * `unconfirmed`: the answer was lost (network, 5xx); the next press reuses the same `requestId`.
 * `refused`: any other definite answer (403, 422, …), with its classified kind for the copy.
 */
export interface ReconcileState {
  readonly turnId: string;
  readonly status: 'pending' | 'settled' | 'noEvidence' | 'unconfirmed' | 'refused';
  readonly errorKind?: ApiErrorKind;
}
/**
 * What the Session stream says about telemetry: a committed `revision`, or `resync` after the feed
 * (re)loaded its snapshot (bootstrap, reconnect, replay gap), when invalidations may have been missed.
 */
export type TelemetrySignal =
  { readonly kind: 'revision'; readonly revision: number } | { readonly kind: 'resync' };
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
      if (value) {
        storage?.setItem(key + suffix, value);
      } else {
        storage?.removeItem(key + suffix);
      }
    } catch {
      /* Browser storage may be unavailable; current in-memory draft remains usable. */
    }
  };

  let pending: StartTurn | undefined;
  // `unreadable`: a record is there but malformed (explicit discard only); `unavailable`: the
  // storage itself cannot be read (blocks until it can).
  let retention: 'ready' | 'unreadable' | 'unavailable' = 'ready';
  let encodedPending: string | null | undefined;
  try {
    encodedPending = storage?.getItem(key + ':pending');
  } catch {
    retention = 'unavailable';
  }

  if (retention === 'ready' && encodedPending) {
    // An unreadable record may contain a dispatched command whose ACK was lost.
    // Do not overwrite it with a newly generated request ID.
    try {
      const value: unknown = JSON.parse(encodedPending);
      if (
        value &&
        typeof value === 'object' &&
        'message' in value &&
        typeof value.message === 'string' &&
        'requestId' in value &&
        typeof value.requestId === 'string'
      ) {
        pending = value as StartTurn;
      } else {
        retention = 'unreadable';
      }
    } catch {
      retention = 'unreadable';
    }
  }

  /** Drops the retained Turn record when it is still `encoded`; whether it is really gone. */
  const releaseRetained = (encoded?: string) => {
    try {
      if (encoded === undefined || storage?.getItem(key + ':pending') === encoded) {
        storage?.removeItem(key + ':pending');
      }

      return storage?.getItem(key + ':pending') === null;
    } catch {
      return false;
    }
  };

  // The newest conversation entry ordinal seen, so a late event for an older entry never moves
  // `latestTurnId` back.
  let latestOrdinal = -1;
  const newestEntry = (entries: readonly { ordinal: number; turnId?: string }[]) =>
    entries.reduce<{ ordinal: number; turnId?: string } | undefined>(
      (best, entry) => (!best || entry.ordinal >= best.ordinal ? entry : best),
      undefined,
    );
  /** The latest Turn after `entries`/`activeTurn` became known; an unchanged answer keeps `previous`. */
  const latestTurnAfter = (
    previous: string | undefined,
    entries: readonly { ordinal: number; turnId?: string }[],
    activeTurnId?: string,
  ) => {
    const newest = newestEntry(entries);
    let turnId = previous;
    if (newest?.turnId && newest.ordinal >= latestOrdinal) {
      latestOrdinal = newest.ordinal;
      turnId = newest.turnId;
    }

    return activeTurnId ?? turnId;
  };

  // After `latest()` the old window stays on screen until the next snapshot replaces it.
  let replaceOnNextSnapshot = false;
  const respondAttempt: { current: RequestAttempt<RespondInteraction> | null } = { current: null };
  let respondFor: string | undefined;
  // One request id per unknown Turn, kept only across an unconfirmed attempt.
  let reconcileAttempt: { turnId: string; requestId: string } | undefined;
  let reconcileToken = 0;

  let state: FeedState = {
    connection: 'loading',
    historyBusy: false,
    historyError: false,
    commandBusy: false,
    commandError: false,
    away: false,
    detached: false,
    hasNew: false,
    pendingUnreadable: retention === 'unreadable',
    notFound: false,
    archivedRefusal: false,
    draft: read(':draft'),
    ...(pending ? { pending } : {}),
  };
  const listeners = new Set<() => void>();
  const workListeners = new Set<(turnId: string) => void>();
  const telemetryListeners = new Set<(signal: TelemetrySignal) => void>();
  const signalTelemetry = (signal: TelemetrySignal) => {
    for (const listener of telemetryListeners) {
      listener(signal);
    }
  };

  let controller: AbortController | undefined,
    generation = 0;
  const notify = (next: FeedState) => {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  };

  function apply(event: SessionChange) {
    if (!state.snapshot) {
      return;
    }

    let incoming = event;
    let detached = state.detached;
    let dropped = false;
    if (event.kind === 'conversation') {
      const existing = new Set(state.snapshot.entries.map((e) => e.id));
      const added = event.changes.entries.filter((e) => !existing.has(e.id)).length;
      // A reader who is away keeps the window they are reading once it would outgrow its bound.
      detached ||= state.away && existing.size + added > conversationWindow;
      if (detached) {
        const kept = event.changes.entries.filter((e) => existing.has(e.id));
        dropped = kept.length < event.changes.entries.length;
        incoming = { ...event, changes: { ...event.changes, entries: kept } };
      }
    }

    const snapshot = applySessionEvent(state.snapshot, incoming);
    const activeTurnId =
      event.kind === 'turn'
        ? event.changes.turn.turnId
        : 'projection' in event.changes
          ? event.changes.projection?.activeTurn?.turnId
          : undefined;
    notify({
      ...state,
      snapshot,
      connection: 'connected',
      // The Session's own projection now says whether it is archived.
      archivedRefusal: event.kind === 'session' ? false : state.archivedRefusal,
      detached,
      hasNew: state.hasNew || dropped,
      latestTurnId: latestTurnAfter(
        state.latestTurnId,
        event.kind === 'conversation' ? event.changes.entries : [],
        activeTurnId,
      ),
    });
    const changedTurn =
      event.kind === 'work'
        ? event.changes.turnId
        : event.kind === 'turn'
          ? event.changes.turn.turnId
          : event.kind === 'interaction'
            ? event.changes.projection.activeTurn?.turnId
            : undefined;
    if (changedTurn) {
      for (const listener of workListeners) {
        listener(changedTurn);
      }
    }

    if (event.kind === 'telemetry') {
      signalTelemetry({ kind: 'revision', revision: event.changes.telemetryRevision });
    }
  }

  async function run(signal: AbortSignal, token: number) {
    try {
      while (!signal.aborted && token === generation) {
        const fresh = await api.snapshot(sessionId, signal);
        if (signal.aborted || token !== generation) {
          return;
        }

        // After `latest()` the window is replaced outright by the live end.
        const old = replaceOnNextSnapshot ? undefined : state.snapshot;
        replaceOnNextSnapshot = false;
        const entries = old ? mergeEntries(old.entries, fresh.entries) : fresh.entries;
        const gap =
          old?.entries.length &&
          fresh.entries.length &&
          fresh.entries[0]!.ordinal > old.entries.at(-1)!.ordinal + 1;
        const outgrown = entries.length > conversationWindow;
        // A detached window, or one a reader who is away would lose (a gap, or too many entries),
        // stays as it is: only the entries already shown take their newer revisions.
        const keep = !!old && (state.detached || (state.away && (!!gap || outgrown)));
        let snapshot: SessionSnapshot;
        let hasNew = state.hasNew;
        if (old && keep) {
          const revised = new Map(fresh.entries.map((entry) => [entry.id, entry]));
          snapshot = {
            ...fresh,
            entries: old.entries.map((entry) => {
              const newer = revised.get(entry.id);

              return newer && newer.revision > entry.revision ? newer : entry;
            }),
            history: old.history,
          };
          const shown = new Set(old.entries.map((entry) => entry.id));
          hasNew ||= fresh.entries.some((entry) => !shown.has(entry.id));
        } else {
          snapshot = old && !gap && !outgrown ? { ...fresh, entries, history: old.history } : fresh;
        }

        latestOrdinal = -1;
        notify({
          ...state,
          snapshot,
          connection: 'connected',
          archivedRefusal: false,
          detached: keep,
          hasNew,
          latestTurnId: latestTurnAfter(
            state.latestTurnId,
            fresh.entries,
            fresh.activeTurn?.turnId,
          ),
        });
        signalTelemetry({ kind: 'resync' });
        let restart = false;
        for await (const event of api.watch(sessionId, fresh.eventSeq, signal, () => {
          if (token === generation) {
            notify({ ...state, connection: 'reconnecting' });
          }
        })) {
          if (signal.aborted || token !== generation) {
            return;
          }

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
          if (!state.detached && (state.snapshot?.entries.length ?? 0) > conversationWindow) {
            restart = true;
            break;
          }
        }

        if (!restart) {
          return;
        }
      }
    } catch (error) {
      if (!signal.aborted && token === generation) {
        // A deleted Session closes its stream; the reconnect (or the next snapshot read) answers
        // 404. Nothing is left to reconnect to.
        notify(
          sessionErrorCode(error) === 'SESSION_NOT_FOUND'
            ? { ...state, connection: 'error', notFound: true }
            : { ...state, connection: 'error' },
        );
      }
    }
  }

  /**
   * `workModeDefault`: the work mode the Composer shows when nothing is picked but which the Session
   * would not inherit by itself (the catalogue default), so what is shown is what is sent.
   */
  async function send(workModeDefault?: FeedState['workModeOverride']) {
    if (state.commandBusy) {
      return;
    }

    const request =
      state.pending ??
      ({
        requestId: crypto.randomUUID(),
        message: state.draft,
        ...(state.modelOverride ? { modelId: state.modelOverride } : {}),
        ...(state.effortOverride ? { effort: state.effortOverride } : {}),
        ...(state.workModeOverride ?? workModeDefault),
      } satisfies StartTurn);
    if (!request.message.trim()) {
      return;
    }

    if (utf8Bytes(request.message) > SessionLimits.messageBytes) {
      notify({ ...state, commandError: true });

      return;
    }

    try {
      if (!storage || retention !== 'ready') {
        throw new Error('Pending command storage is unavailable.');
      }

      const encoded = JSON.stringify(request);
      const retained = storage.getItem(key + ':pending');
      if (retained && retained !== encoded) {
        throw new Error('Another command is retained.');
      }

      storage.setItem(key + ':pending', encoded);
      if (storage.getItem(key + ':pending') !== encoded) {
        throw new Error('Pending command retention could not be confirmed.');
      }
    } catch {
      notify({ ...state, pending: request, commandError: true });

      return;
    }

    notify({ ...state, pending: request, commandBusy: true, commandError: false });
    try {
      await api.start(sessionId, request);
      // Keep the exact command retryable until its durable record is gone.
      // Acknowledgement alone must not let a newer command replace this record.
      if (storage.getItem(key + ':pending') === JSON.stringify(request)) {
        storage.removeItem(key + ':pending');
      }

      if (storage.getItem(key + ':pending') !== null) {
        throw new Error('Pending command cleanup could not be confirmed.');
      }

      const draft = state.draft === request.message ? '' : state.draft;
      if (read(':draft') === request.message) {
        save(':draft', '');
      }

      const next = { ...state, draft, commandBusy: false };
      delete next.pending;
      notify(next);
    } catch (error) {
      // A definite refusal (the server saw the command and said no) could never succeed when
      // replayed, so the Composer is released: the draft and overrides stay editable, the error
      // stays visible. Any answer that leaves the outcome open keeps the exact command.
      const archived = sessionErrorCode(error) === 'SESSION_ARCHIVED';
      const next: FeedState = {
        ...state,
        commandBusy: false,
        // Archived elsewhere: a definite refusal with its own note, not the retry copy.
        commandError: !archived,
        archivedRefusal: archived || state.archivedRefusal,
      };
      if (!writeOutcomeUnknown(error) && releaseRetained(JSON.stringify(request))) {
        delete next.pending;
      }

      notify(next);
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    /** Telemetry invalidations from this feed's own stream (no second stream per panel). */
    subscribeTelemetry: (listener: (signal: TelemetrySignal) => void) => {
      telemetryListeners.add(listener);

      return () => {
        telemetryListeners.delete(listener);
      };
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
    /** Selects the next Turn's model/effort override; absent values inherit the Session's current pair. */
    setModel(modelId: string | undefined, effort: string | undefined) {
      const next: FeedState = { ...state };
      if (modelId) {
        next.modelOverride = modelId;
      } else {
        delete next.modelOverride;
      }

      if (effort) {
        next.effortOverride = effort;
      } else {
        delete next.effortOverride;
      }

      notify(next);
    },
    /** Selects the next Turn's work mode; `undefined` inherits the Session's current one. */
    setWorkMode(workMode: FeedState['workModeOverride']) {
      const next: FeedState = { ...state };
      if (workMode) {
        next.workModeOverride = workMode;
      } else {
        delete next.workModeOverride;
      }

      notify(next);
    },
    /**
     * The explicit way out of an unreadable retained Turn record (it may already have been
     * applied). Resolves whether the record is gone and a new command may be sent.
     */
    discardPending() {
      if (retention !== 'unreadable' || !releaseRetained()) {
        return false;
      }

      retention = 'ready';
      notify({ ...state, pendingUnreadable: false, commandError: false });

      return true;
    },
    setAway(away: boolean) {
      if (state.away !== away) {
        notify({ ...state, away });
      }
    },
    send,
    async recheckProvider() {
      if (state.commandBusy) {
        return;
      }

      const token = generation;
      notify({ ...state, commandBusy: true, commandError: false });
      try {
        await api.providers(controller?.signal);
        notify({ ...state, commandBusy: false });
        if (token !== generation) {
          return;
        }

        this.connect();
      } catch {
        notify({
          ...state,
          commandBusy: false,
          commandError: token === generation ? true : state.commandError,
        });
      }
    },
    async older() {
      const before = state.snapshot?.history.before;
      if (!before || state.historyBusy) {
        return;
      }

      const token = generation;
      notify({ ...state, historyBusy: true, historyError: false });
      try {
        const page = await api.history(sessionId, before, controller?.signal);
        if (token !== generation || !state.snapshot) {
          return;
        }

        const snapshot = prependHistory(state.snapshot, page);
        const trimmed = snapshot.entries.length > conversationWindow;
        if (trimmed) {
          snapshot.entries = snapshot.entries.slice(0, conversationWindow);
        }

        // Trimming pushes the newest entries out of the window: it no longer reaches the live end.
        notify({ ...state, snapshot, historyBusy: false, detached: state.detached || trimmed });
      } catch {
        if (token === generation) {
          notify({ ...state, historyBusy: false, historyError: true });
        }
      }
    },
    latest() {
      // The window on screen stays until the next snapshot replaces it (no flash of a loading or
      // "ready" screen).
      replaceOnNextSnapshot = true;
      state = {
        ...state,
        away: false,
        detached: false,
        hasNew: false,
        historyError: false,
        historyBusy: false,
      };

      return this.connect();
    },
    async cancel() {
      const turnId = state.snapshot?.activeTurn?.turnId;
      if (!turnId || state.commandBusy) {
        return;
      }

      notify({ ...state, commandBusy: true, commandError: false });
      try {
        await api.cancel(sessionId, turnId, crypto.randomUUID());
        notify({ ...state, commandBusy: false });
      } catch {
        notify({ ...state, commandBusy: false, commandError: true });
      }
    },
    /**
     * Answers an interaction. One request id per `{interactionId, answer}`: a retry after a lost
     * acknowledgement reuses it, a changed answer is a new request.
     */
    async respond(interactionId: string, answer: RespondAnswer) {
      if (state.commandBusy) {
        return;
      }

      if (respondFor !== interactionId) {
        respondFor = interactionId;
        respondAttempt.current = null;
      }

      notify({ ...state, commandBusy: true, commandError: false });
      try {
        await sendRetained(
          respondAttempt,
          answer as Omit<RespondInteraction, 'requestId'>,
          (input) => api.respond(sessionId, interactionId, input),
          'requestId',
          (error) => !writeOutcomeUnknown(error),
        );
        notify({ ...state, commandBusy: false });
      } catch (error) {
        const archived = sessionErrorCode(error) === 'SESSION_ARCHIVED';
        notify({
          ...state,
          commandBusy: false,
          commandError: !archived,
          archivedRefusal: archived || state.archivedRefusal,
        });
      }
    },
    /**
     * Asks the Runtime to settle the active Turn whose outcome is unknown. Live state still comes
     * from the stream: the result is returned only so the caller can tell the user that this
     * request settled it (`reconciled`), never applied here.
     */
    async reconcile(): Promise<ReconcileTurnResult | undefined> {
      const turn = state.snapshot?.activeTurn;
      const busy =
        state.reconcile?.turnId === turn?.turnId &&
        (state.reconcile?.status === 'pending' || state.reconcile?.status === 'settled');
      if (turn?.state !== 'unknown' || busy) {
        return undefined;
      }

      const turnId = turn.turnId;
      if (reconcileAttempt?.turnId !== turnId) {
        reconcileAttempt = { turnId, requestId: crypto.randomUUID() };
      }

      const attempt = reconcileAttempt;
      const token = ++reconcileToken;
      const settle = (next: ReconcileState) => {
        // A newer check owns the state now.
        if (token === reconcileToken) {
          notify({ ...state, reconcile: next });
        }
      };

      settle({ turnId, status: 'pending' });
      try {
        const result = await api.reconcile(sessionId, turnId, attempt.requestId);
        if (reconcileAttempt === attempt) {
          reconcileAttempt = undefined;
        }

        // Settled: the Turn's new state arrives on the stream; nothing to press until then.
        settle({ turnId, status: 'settled' });

        return result;
      } catch (error) {
        const noEvidence = sessionErrorCode(error) === 'SESSION_RECOVERY_REQUIRED';
        // Only a lost answer keeps the request id; "no evidence yet" and any other definite answer
        // make the next press a new request.
        if ((noEvidence || !writeOutcomeUnknown(error)) && reconcileAttempt === attempt) {
          reconcileAttempt = undefined;
        }

        settle(
          noEvidence
            ? { turnId, status: 'noEvidence' }
            : writeOutcomeUnknown(error)
              ? { turnId, status: 'unconfirmed' }
              : {
                  turnId,
                  status: 'refused',
                  ...(isApiError(error) ? { errorKind: error.kind } : {}),
                },
        );

        return undefined;
      }
    },
  };
}

export type SessionFeed = ReturnType<typeof createSessionFeed>;
