import type { ProviderDescriptor, SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';

export const fixtureSessionId = '00000000-0000-4000-8000-000000000001';
const turnId = '00000000-0000-4000-8000-000000000002';
const workId = '00000000-0000-4000-8000-000000000003';
const contentId = '00000000-0000-4000-8000-000000000004';
export function sessionFixture(waiting = false): SessionSnapshot {
  return {
    session: {
      sessionId: fixtureSessionId,
      projectId: 'project',
      providerId: 'mock',
      mode: 'read-only',
      title: 'Sesja niezależna od specyfikacji',
      readiness: waiting ? 'requiresAttention' : 'ready',
      capabilities: {
        view: true,
        manage: true,
        start: !waiting,
        cancel: waiting,
        questions: true,
        permissions: true,
      },
      createdAt: '2026-10-25T10:00:00Z',
      updatedAt: '2026-10-25T10:00:00Z',
    },
    revision: 3,
    eventSeq: 3,
    history: { hasOlder: true, before: 'older' },
    entries: [
      {
        id: 'request',
        turnId,
        ordinal: 1,
        revision: 1,
        kind: 'request',
        createdAt: '2026-10-25T10:00:00Z',
        text: {
          text: 'Otwórz rozmowę od najnowszych wiadomości. Starsza historia ma kilkadziesiąt megabajtów.',
          complete: true,
        },
      },
      {
        id: 'answer',
        turnId,
        ordinal: 2,
        revision: 1,
        kind: 'answer',
        createdAt: '2026-10-25T10:00:01Z',
        text: {
          text: 'To jest krótki podgląd dużej odpowiedzi. Dalsza treść jest pobierana dopiero na żądanie.',
          complete: false,
          content: { contentId, revision: '1000000', byteLength: 1000000 },
        },
      },
    ],
    ...(waiting
      ? {
          activeTurn: {
            turnId,
            state: 'waitingForUser' as const,
            revision: 1,
            startedAt: '2026-10-25T10:00:00Z',
          },
          interaction: {
            interactionId: '00000000-0000-4000-8000-000000000005',
            turnId,
            workId,
            revision: 1,
            kind: 'question' as const,
            prompt: 'Którą część rozwiązania sprawdzić w następnej kolejności?',
            allowText: true,
            options: [
              { id: 'history', label: 'Wczytywanie starszych wiadomości' },
              { id: 'recovery', label: 'Odzyskiwanie sesji po restarcie' },
            ],
          },
        }
      : {}),
  };
}

/** Matches sessionFixture's providerId so the next-Turn model/effort picker has data to render. */
export function providerFixture(): ProviderDescriptor {
  return {
    providerId: 'mock',
    title: 'Controlled test provider',
    readiness: 'ready',
    capabilities: {
      questions: true,
      permissions: true,
      cancel: true,
      resume: true,
      modelOverride: true,
      effortOverride: true,
    },
    models: [
      { modelId: 'mock-standard', title: 'Standard', efforts: ['low', 'high'] },
      { modelId: 'mock-fast', title: 'Fast', efforts: [] },
    ],
    modes: ['read-only', 'workspace-write'],
  };
}

/** Isolated presentation adapter: never imported by a production route. */
export function fixtureApi(snapshot: SessionSnapshot, historyError = false): ManagedSessionsApi {
  return {
    providers: () => Promise.resolve({ items: [providerFixture()] }),
    create: () => Promise.resolve({ sessionId: fixtureSessionId }),
    snapshot: () => Promise.resolve(snapshot),
    history: () =>
      historyError
        ? Promise.reject(new Error('History unavailable'))
        : Promise.resolve({
            sessionId: fixtureSessionId,
            eventSeq: 3,
            entries: [
              {
                id: 'older',
                turnId,
                ordinal: 0,
                revision: 1,
                kind: 'commentary',
                createdAt: '2026-10-25T09:59:00Z',
                text: { text: 'Starsza wiadomość', complete: true },
              },
            ],
            history: { hasOlder: false },
          }),
    content: () =>
      Promise.resolve({
        contentId,
        revision: '1000000',
        offset: 0,
        nextOffset: 65536,
        complete: false,
        text: 'Dalszy fragment dużej wiadomości — pobrany na żądanie.',
      }),
    work: () =>
      Promise.resolve({
        sessionId: fixtureSessionId,
        eventSeq: 3,
        turn: {
          turnId,
          state: 'terminal',
          outcome: 'completed',
          revision: 1,
          createdAt: '2026-10-25T10:00:00Z',
          updatedAt: '2026-10-25T10:00:01Z',
          completedAt: '2026-10-25T10:00:01Z',
          userMessage: { text: 'Hello', complete: true },
        },
        items: [
          {
            workId,
            kind: 'reasoning',
            state: 'completed',
            ordinal: 1,
            revision: 1,
            title: { text: 'Analiza wymagań i ograniczeń wczytywania historii', complete: true },
            createdAt: '2026-10-25T10:00:00Z',
            updatedAt: '2026-10-25T10:00:01Z',
            actionCount: 0,
          },
        ],
        history: { hasOlder: false },
      }),
    actions: () =>
      Promise.resolve({
        sessionId: fixtureSessionId,
        eventSeq: 3,
        workId,
        items: [],
        history: { hasOlder: false },
      }),
    start: () => Promise.resolve({ turnId }),
    cancel: () => Promise.resolve({ turnId }),
    respond: () => Promise.resolve({ turnId }),
    async *watch(_id, _after, signal) {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
        } else {
          signal.addEventListener('abort', () => resolve(), { once: true });
        }
      });
      yield undefined;
    },
  };
}
