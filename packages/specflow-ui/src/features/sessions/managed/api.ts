import type { HttpRequestClient } from '@nevo/http-client';
import {
  sessionValidators,
  type CreateSession,
  type StartTurn,
  type RespondInteraction,
  type SessionSnapshot,
  type HistoryPage,
  type ContentRef,
  type ContentPage,
  type SessionChange,
  type WorkPage,
  type ActionPage,
  type ProviderDescriptor,
  type CreateSessionResult,
  type StartTurnResult,
  type CancelTurnResult,
  type RespondInteractionResult,
  type ReconcileTurnResult,
  type TelemetrySnapshot,
  type RefreshTelemetry,
  type RefreshTelemetryReceipt,
} from '@nevo/specflow-contracts/sessions';
import { createApiTransport, type ErrorCodeTable } from '../../../api';

/**
 * A telemetry read: the snapshot with its entity tag, or `not-modified` when the snapshot the
 * caller revalidated (`etag`) is still current.
 */
export type TelemetryRead =
  | { readonly kind: 'snapshot'; readonly snapshot: TelemetrySnapshot; readonly etag?: string }
  | { readonly kind: 'not-modified' };

export interface ManagedSessionsApi {
  providers(signal?: AbortSignal): Promise<{ items: ProviderDescriptor[] }>;
  create(input: CreateSession): Promise<CreateSessionResult>;
  snapshot(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot>;
  history(sessionId: string, before: string, signal?: AbortSignal): Promise<HistoryPage>;
  work(sessionId: string, turnId: string, before?: string, signal?: AbortSignal): Promise<WorkPage>;
  actions(
    sessionId: string,
    workId: string,
    before?: string,
    signal?: AbortSignal,
  ): Promise<ActionPage>;
  content(
    sessionId: string,
    ref: ContentRef,
    offset: number,
    signal?: AbortSignal,
  ): Promise<ContentPage>;
  /** An acknowledgement of the wrong shape is an outcome-unknown error, not a success. */
  /** `GET .../telemetry`, revalidating `etag` when given (304 keeps the caller's snapshot). */
  telemetry(sessionId: string, etag?: string, signal?: AbortSignal): Promise<TelemetryRead>;
  /** `POST .../telemetry/refresh`: asks for a new native reading of `input.groups`. */
  refreshTelemetry(sessionId: string, input: RefreshTelemetry): Promise<RefreshTelemetryReceipt>;
  start(sessionId: string, input: StartTurn): Promise<StartTurnResult>;
  cancel(sessionId: string, turnId: string, requestId: string): Promise<CancelTurnResult>;
  /**
   * Asks the Runtime to settle a Turn whose outcome is unknown from its positive evidence. Reuse
   * `requestId` when retrying the same request.
   */
  reconcile(sessionId: string, turnId: string, requestId: string): Promise<ReconcileTurnResult>;
  respond(
    sessionId: string,
    interactionId: string,
    input: RespondInteraction,
  ): Promise<RespondInteractionResult>;
  watch(
    sessionId: string,
    after: number,
    signal: AbortSignal,
    onReconnect: () => void,
  ): AsyncIterable<SessionChange | undefined>;
}
/**
 * The Runtime's journal needs recovery for this Session: whether the command was applied is not
 * known, so it is kept for a replay with the same `requestId` (a plain 409 would read as a
 * definite refusal).
 */
export const sessionErrorCodes: ErrorCodeTable = {
  SESSION_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' },
};
export function createManagedSessionsApi(http: HttpRequestClient): ManagedSessionsApi {
  const read = createApiTransport(http, { operation: 'sessions', codes: sessionErrorCodes });
  const path = (id: string) => '/api/sessions/' + encodeURIComponent(id);

  return {
    providers: (signal) =>
      read.get('/api/session-providers', { signal, isValid: sessionValidators.providers }),
    create: (input) =>
      read.post('/api/sessions', input, { isValid: sessionValidators.createResult }),
    snapshot: (id, signal) => read.get(path(id), { signal, isValid: sessionValidators.snapshot }),
    history: (id, before, signal) =>
      read.get(path(id) + '/history', {
        signal,
        params: { before },
        isValid: sessionValidators.history,
      }),
    work: (id, turn, before, signal) =>
      read.get(path(id) + '/turns/' + encodeURIComponent(turn) + '/work', {
        signal,
        params: before ? { before } : {},
        isValid: sessionValidators.work,
      }),
    actions: (id, work, before, signal) =>
      read.get(path(id) + '/work/' + encodeURIComponent(work) + '/actions', {
        signal,
        params: before ? { before } : {},
        isValid: sessionValidators.actions,
      }),
    content: (id, ref, offset, signal) =>
      read.get(path(id) + '/content/' + encodeURIComponent(ref.contentId), {
        signal,
        params: { revision: ref.revision, offset },
        isValid: sessionValidators.content,
      }),
    async telemetry(id, etag, signal) {
      const response = await read.getResponse<TelemetrySnapshot>(path(id) + '/telemetry', {
        signal,
        responseHeaders: ['etag'],
        ...(etag ? { headers: { 'If-None-Match': etag } } : {}),
        isValid: sessionValidators.telemetry,
      });
      if (response.status === 304 || !response.data) {
        return { kind: 'not-modified' };
      }

      const received = response.headers.etag;

      return {
        kind: 'snapshot',
        snapshot: response.data,
        ...(received ? { etag: received } : {}),
      };
    },
    refreshTelemetry: (id, input) =>
      read.post(path(id) + '/telemetry/refresh', input, {
        isValid: sessionValidators.refreshTelemetryReceipt,
      }),
    start: (id, input) =>
      read.post(path(id) + '/turns', input, { isValid: sessionValidators.startResult }),
    cancel: (id, turn, requestId) =>
      read.post(
        path(id) + '/turns/' + encodeURIComponent(turn) + '/cancel',
        { requestId },
        { isValid: sessionValidators.cancelResult },
      ),
    reconcile: (id, turn, requestId) =>
      read.post(
        path(id) + '/turns/' + encodeURIComponent(turn) + '/reconcile',
        { requestId },
        { isValid: sessionValidators.reconcileResult },
      ),
    respond: (id, interaction, input) =>
      read.post(path(id) + '/interactions/' + encodeURIComponent(interaction) + '/respond', input, {
        isValid: sessionValidators.respondResult,
      }),
    async *watch(id, after, signal, onReconnect) {
      const stream = http.sse(path(id) + '/events', {
        signal,
        lastEventId: String(after),
        onReconnecting: onReconnect,
      });
      try {
        for await (const frame of stream) {
          if (frame.type === 'resync-required') {
            yield undefined;

            return;
          }

          if (frame.type !== 'session-change') {
            continue;
          }

          const value: unknown = JSON.parse(frame.data);
          if (!sessionValidators.event(value)) {
            throw new Error('Invalid Session event.');
          }

          const event = value;
          if (String(event.eventSeq) !== frame.id) {
            throw new Error('Session event cursor mismatch.');
          }

          yield event;
        }
      } finally {
        stream.close();
      }
    },
  };
}
