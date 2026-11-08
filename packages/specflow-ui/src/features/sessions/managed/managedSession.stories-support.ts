import {
  utf8Bytes,
  type ContentPage,
  type ProviderDescriptor,
  type SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { providerModesFixture } from './workModes.stories-support';

export const fixtureSessionId = '00000000-0000-4000-8000-000000000001';
const turnId = '00000000-0000-4000-8000-000000000002';
const workId = '00000000-0000-4000-8000-000000000003';
const contentId = '00000000-0000-4000-8000-000000000004';
/** The large answer's capped preview: the first bytes of its full content, as the Runtime serves it. */
const answerPreview =
  'To jest krótki podgląd dużej odpowiedzi. Dalsza treść jest pobierana dopiero na żądanie.';
/** The large answer's remaining pages, fetched and stitched together automatically by the UI. */
const contentFragments = [
  'Dalszy fragment dużej wiadomości — pobrany automatycznie. ',
  'Druga część tej samej odpowiedzi, dociągnięta w tle bez udziału użytkownika. ',
  'Trzecia i ostatnia część — od teraz widoczna razem z resztą jako jedna całość.',
];
const contentParts = [answerPreview, ...contentFragments];
/** UTF-8 byte offset of each part inside the full content, like the Runtime's content offsets. */
const contentStarts = contentParts.map((_, index) =>
  contentParts.slice(0, index).reduce((sum, part) => sum + utf8Bytes(part), 0),
);
const contentByteLength = utf8Bytes(contentParts.join(''));

/** The Runtime's `content` read: `offset` is a UTF-8 byte offset from the start of the full content. */
function contentPage(offset: number): ContentPage {
  const index = contentStarts.indexOf(offset);
  if (index < 1) {
    throw new Error(`Fixture content has no page at byte offset ${offset}`);
  }

  const next = contentStarts[index + 1];

  return {
    contentId,
    revision: String(contentByteLength),
    offset,
    nextOffset: next,
    complete: next === undefined,
    text: contentParts[index]!,
  };
}

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
        delete: true,
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
          text: answerPreview,
          complete: false,
          content: {
            contentId,
            revision: String(contentByteLength),
            byteLength: contentByteLength,
          },
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

/**
 * Matches a session's `providerId` so the next-Turn model/effort picker has data to render.
 * Defaults to `sessionFixture`'s own `'mock'`; `fixtureApi` passes the actual snapshot's
 * `providerId` instead, so a fixture built on `base()`/`genericSpecLevelSnapshot()` (providerId
 * `'claude'`, see `managedSession.fullSession.stories-support.ts`) also gets a matching
 * provider — before this, `ModelEffortPicker` silently rendered nothing for every one of those
 * stories, since no item in `providers().items` ever matched that session's own `providerId`.
 * Its work modes are that provider's own catalogue (`providerModesFixture`).
 */
/** Real Runtime provider ids (`claude`, `codex`) carry their product names, so Context shows them
 * with their own logos (`SessionProviderIcon`); anything else is the controlled test provider. */
const providerTitles: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export function providerFixture(providerId = 'mock'): ProviderDescriptor {
  return {
    providerId,
    title: providerTitles[providerId] ?? 'Controlled test provider',
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
    ...providerModesFixture(providerId),
  };
}

/**
 * Item 1 follow-up regression support: `fixtureApi`'s own `content()` resolves every page on an
 * already-queued microtask, so the three fragments stitch in back-to-back within a single
 * animation frame — too fast for a test to actually sample the growth window the owner reported
 * (ManagedSession.tsx's overlap-correction racing MessageText.tsx's auto-stitch). This variant
 * paces each page behind a real macrotask delay instead, so a test can await one fragment,
 * sample the DOM mid-sequence, then let the next fragment land.
 */
export function staggeredContentApi(snapshot: SessionSnapshot, delayMs = 120): ManagedSessionsApi {
  return {
    ...fixtureApi(snapshot),
    content: (_sessionId, _ref, offset) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(contentPage(offset));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, delayMs);
      });
    },
  };
}

/**
 * The snapshot as the Runtime serves it: the Session names its provider and model by the
 * catalogue's titles (absent when not listed), whatever the caller may read of the catalogue.
 */
export function withRuntimeTitles(
  snapshot: SessionSnapshot,
  provider: ProviderDescriptor | undefined = providerFixture(snapshot.session.providerId),
): SessionSnapshot {
  const { providerTitle: _provider, modelTitle: _model, ...session } = snapshot.session;
  const modelTitle = provider?.models.find((model) => model.modelId === session.modelId)?.title;

  return {
    ...snapshot,
    session: {
      ...session,
      ...(provider ? { providerTitle: provider.title } : {}),
      ...(modelTitle ? { modelTitle } : {}),
    },
  };
}

/** Isolated presentation adapter: never imported by a production route. */
export function fixtureApi(served: SessionSnapshot, historyError = false): ManagedSessionsApi {
  const snapshot = withRuntimeTitles(served);

  return {
    providers: () => Promise.resolve({ items: [providerFixture(snapshot.session.providerId)] }),
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
    // Three sequential pages after the preview; offsets are UTF-8 byte offsets from the content
    // start, exactly as the Runtime serves them (the preview is the content's byte prefix).
    content: (_sessionId, _ref, offset) => {
      try {
        return Promise.resolve(contentPage(offset));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
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
    // No telemetry in these fixtures: Context stories supply their own snapshot.
    telemetry: () => Promise.resolve({ kind: 'not-modified' }),
    refreshTelemetry: () => Promise.reject(new Error('No telemetry in this fixture.')),
    reconcile: () => Promise.resolve({ turnId, outcome: 'completed', reconciled: true }),
    rename: (_id, input) =>
      Promise.resolve({ session: { ...snapshot.session, title: input.title } }),
    archive: () =>
      Promise.resolve({ session: { ...snapshot.session, archivedAt: '2026-10-25T10:05:00Z' } }),
    unarchive: () => Promise.resolve({ session: snapshot.session }),
    delete: () => Promise.resolve(),
    respond: (_id, interactionId) => Promise.resolve({ turnId, interactionId }),
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
