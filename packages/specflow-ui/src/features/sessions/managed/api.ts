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
} from '@nevo/specflow-contracts/sessions';
import { createApiTransport } from '../../../api';

export interface ManagedSessionsApi {
  providers(signal?: AbortSignal): Promise<{ items: ProviderDescriptor[] }>;
  create(input: CreateSession): Promise<{ sessionId: string }>;
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
  start(sessionId: string, input: StartTurn): Promise<{ turnId: string }>;
  cancel(sessionId: string, turnId: string, requestId: string): Promise<unknown>;
  respond(sessionId: string, interactionId: string, input: RespondInteraction): Promise<unknown>;
  watch(
    sessionId: string,
    after: number,
    signal: AbortSignal,
    onReconnect: () => void,
  ): AsyncIterable<SessionChange | undefined>;
}
export function createManagedSessionsApi(http: HttpRequestClient): ManagedSessionsApi {
  const read = createApiTransport(http, { operation: 'sessions' });
  const path = (id: string) => '/api/sessions/' + encodeURIComponent(id);
  return {
    providers: (signal) =>
      read.get('/api/session-providers', { signal, isValid: sessionValidators.providers }),
    create: (input) => read.post('/api/sessions', input),
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
    start: (id, input) => read.post(path(id) + '/turns', input),
    cancel: (id, turn, requestId) =>
      read.post(path(id) + '/turns/' + encodeURIComponent(turn) + '/cancel', { requestId }),
    respond: (id, interaction, input) =>
      read.post(path(id) + '/interactions/' + encodeURIComponent(interaction) + '/respond', input),
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
          if (frame.type !== 'session-change') continue;
          const value: unknown = JSON.parse(frame.data);
          if (!sessionValidators.event(value)) throw new Error('Invalid Session event.');
          const event = value;
          if (String(event.eventSeq) !== frame.id)
            throw new Error('Session event cursor mismatch.');
          yield event;
        }
      } finally {
        stream.close();
      }
    },
  };
}
