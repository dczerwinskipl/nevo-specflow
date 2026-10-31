import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { fixtureSessionId, fixtureApi } from './managedSession.stories-support';
import type { ManagedSessionsApi } from './api';
import {
  createWorkInspectorFixtureApi,
  mixedWorkTimelineActions,
  mixedWorkTimelineItems,
  workInspectorTurnId,
  actionsWorkId,
} from './managedSession.workInspector.stories-support';

/** Isolated presentation adapters for the Full Session state fixtures: never imported by a
 * production route. Each builds a realistic `SessionSnapshot` for one state validated this pass
 * (full-session-screen-structure.md §12/§13/§15/§18/§19/§20). */

const turnId = '00000000-0000-4000-8000-000000000010';

function base(): SessionSnapshot {
  return {
    session: {
      sessionId: fixtureSessionId,
      projectId: 'project',
      providerId: 'claude-code',
      mode: 'workspace-write',
      title: 'Workflow admission hardening',
      readiness: 'ready',
      capabilities: {
        view: true,
        manage: true,
        start: true,
        cancel: false,
        questions: true,
        permissions: true,
      },
      createdAt: '2026-10-29T09:00:00Z',
      updatedAt: '2026-10-29T09:00:00Z',
    },
    revision: 1,
    eventSeq: 1,
    history: { hasOlder: false },
    entries: [
      {
        id: 'request',
        turnId,
        ordinal: 1,
        revision: 1,
        kind: 'request',
        createdAt: '2026-10-29T09:00:00Z',
        text: { text: 'Investigate why workflow admission is failing.', complete: true },
      },
    ],
  };
}

/** State A — generic/spec-level Session (§12). */
export function genericSpecLevelSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.entries.push({
    id: 'commentary-1',
    turnId,
    ordinal: 2,
    revision: 1,
    kind: 'commentary',
    createdAt: '2026-10-29T09:00:05Z',
    text: { text: 'Checking the workflow admission path…', complete: true },
  });
  snapshot.activeTurn = { turnId, state: 'active', revision: 1, startedAt: '2026-10-29T09:00:00Z' };
  snapshot.currentActivity = {
    kind: 'tool',
    turnId,
    label: 'Searching repository…',
  };

  return snapshot;
}

/** State B — single-Task execution (§13): the same free-text `currentActivity.label` carries the
 * Task identity; the canonical contract needs no new field for this. */
export function singleTaskSnapshot(): SessionSnapshot {
  const snapshot = genericSpecLevelSnapshot();
  snapshot.currentActivity = {
    kind: 'tool',
    turnId,
    label: 'Implementer · TASK-03 · Editing workflow admission…',
  };

  return snapshot;
}

/** State G — waiting without human action (§18): calm live state, not attention. */
export function waitingWithoutAttentionSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.activeTurn = {
    turnId,
    state: 'waiting',
    revision: 1,
    startedAt: '2026-10-29T09:00:00Z',
  };
  snapshot.currentActivity = { kind: 'waiting', turnId, label: 'Waiting for model response…' };

  return snapshot;
}

/** State H — terminal failure (§19): a failed Tool stays distinct from a failed Turn; here the
 * Turn itself is terminal/failed. */
export function terminalFailureSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.entries.push(
    {
      id: 'commentary-1',
      turnId,
      ordinal: 2,
      revision: 1,
      kind: 'commentary',
      createdAt: '2026-10-29T09:00:05Z',
      text: { text: 'Running the workflow test suite…', complete: true },
    },
    {
      id: 'outcome-1',
      turnId,
      ordinal: 3,
      revision: 1,
      kind: 'outcome',
      createdAt: '2026-10-29T09:00:20Z',
      text: { text: 'failed', complete: true },
    },
  );

  return snapshot;
}

/** State I — unavailable Session (§20): history is preserved; action availability follows
 * authoritative readiness, not a fabricated ready/empty snapshot. */
export function unavailableSnapshot(): SessionSnapshot {
  const snapshot = base();
  snapshot.session = {
    ...snapshot.session,
    readiness: 'unavailable',
    capabilities: { ...snapshot.session.capabilities, start: false, cancel: false },
  };
  snapshot.entries.push({
    id: 'answer-1',
    turnId,
    ordinal: 2,
    revision: 1,
    kind: 'answer',
    createdAt: '2026-10-29T09:00:10Z',
    text: { text: 'The admission guard change is ready for review.', complete: true },
  });

  return snapshot;
}

/**
 * A rotating set of realistic request/answer pairs about the session's own "Workflow admission
 * hardening" investigation (owner audit: the previous `longConversationSnapshot()` used literal
 * test-placeholder strings — "Wiadomość nr N — pytanie testowe sprawdzające przewijanie listy
 * konwersacji" — that read as obviously synthetic rather than a real AI conversation). Natural,
 * substantive content, cycled by `longConversationSnapshot` to reach its own scroll-stress scale —
 * each cycle still gets a distinguishing reference so entries remain textually unique for scroll
 * assertions (`longConversationLastMessage`), without resorting to a literal "message N" counter.
 */
const longConversationTurns: readonly { request: string; answer: string }[] = [
  {
    request: 'Dlaczego operacja admission bywa odrzucana mimo poprawnych uprawnień workspace?',
    answer:
      'Sprawdziłem politykę admission i widzę, że warunek sprawdza rewizję specyfikacji sprzed ' +
      'ostatniego commitu — jeśli writer zdąży zacommitować w międzyczasie, porównanie wypada ' +
      'fałszywie negatywnie. To wyjaśnia przypadki, które zgłaszałeś jako "losowe".',
  },
  {
    request: 'Czy to się powtarza tylko przy równoległych operacjach, czy też sekwencyjnie?',
    answer:
      'Reprodukowałem to też sekwencyjnie — wystarczy, że drugi proces odczyta stan między ' +
      'zatwierdzeniem commitu a odświeżeniem cache rewizji. Okno jest krótkie, ale nie zerowe, ' +
      'więc przy większym obciążeniu będzie to widoczne częściej niż przy pojedynczych testach.',
  },
  {
    request: 'Jaką poprawkę proponujesz — blokadę, czy ponowną weryfikację przed odrzuceniem?',
    answer:
      'Najbezpieczniej dodać jedną ponowną weryfikację tuż przed odrzuceniem: jeśli rewizja się ' +
      'zmieniła w trakcie oczekiwania, pobieramy świeży stan i sprawdzamy jeszcze raz, zamiast ' +
      'od razu zwracać błąd. Blokada na cały czas operacji byłaby prostsza, ale zmniejszyłaby ' +
      'przepustowość przy wielu równoległych sesjach korzystających z tego samego workspace.',
  },
  {
    request: 'Czy ponowna weryfikacja nie otworzy osobnego wyścigu, tym razem w drugą stronę?',
    answer:
      'Dobra uwaga — ograniczyłem to do jednej próby ponowienia z krótkim limitem czasu, więc ' +
      'jeśli stan zmienia się w kółko, operacja i tak zostanie odrzucona, tylko z precyzyjniejszym ' +
      'komunikatem. Nieskończona pętla ponowień nie wchodzi w grę.',
  },
  {
    request: 'Dodałeś już test odtwarzający ten konkretny scenariusz wyścigu?',
    answer:
      'Tak, dodałem test, który uruchamia commit i próbę admission na tej samej rewizji w dwóch ' +
      'niemal równoczesnych wątkach i sprawdza, że druga operacja poprawnie przechodzi po ' +
      'ponownej weryfikacji zamiast zgłaszać fałszywy błąd. Test był czerwony przed poprawką.',
  },
  {
    request: 'Jak to wygląda z perspektywy telemetrii — będziemy widzieć te ponowienia?',
    answer:
      'Tak, każda ponowna weryfikacja loguje osobne zdarzenie z przyczyną i czasem oczekiwania, ' +
      'więc będzie można policzyć, jak często to się faktycznie zdarza w produkcji, zanim ' +
      'zdecydujemy, czy próg czasowy wymaga dostrojenia.',
  },
  {
    request:
      'Czy to rozwiązanie obejmuje też przypadek, gdy specyfikacja została w międzyczasie zamknięta?',
    answer:
      'Nie w pełni — zamknięcie specyfikacji to osobna ścieżka, która już dziś poprawnie odrzuca ' +
      'operację, ale z innym, mniej czytelnym komunikatem. Dodałem to do osobnej notatki, bo to ' +
      'inny problem niż sam wyścig rewizji, mimo że objawia się podobnie.',
  },
  {
    request: 'Które pliki ostatecznie zmieniłeś i czy coś jeszcze wymaga przeglądu?',
    answer:
      'Zmiany dotyczą głównie modułu admission-policy oraz jego testów integracyjnych; nic w ' +
      'publicznym kontrakcie API się nie zmieniło. Zostało jeszcze do przejrzenia, czy komunikat ' +
      'błędu po wyczerpaniu ponowienia jest wystarczająco jasny dla użytkownika końcowego.',
  },
  {
    request: 'Czy jest ryzyko regresji dla sesji, które nie korzystają z równoległych operacji?',
    answer:
      'Nie powinno być — dla pojedynczej sesji ponowna weryfikacja po prostu nigdy się nie ' +
      'uruchamia, bo warunek "rewizja zmieniła się w międzyczasie" nie zachodzi. Dodatkowy koszt ' +
      'to jedno proste porównanie przy każdej operacji, pomijalne w praktyce.',
  },
  {
    request: 'Dobrze, podsumuj proszę status przed przekazaniem do code review.',
    answer:
      'Poprawka jest gotowa: ponowna weryfikacja rewizji przed odrzuceniem admission, test ' +
      'odtwarzający realny wyścig, dodatkowa telemetria ponowień i notatka o osobnym przypadku ' +
      'zamkniętej specyfikacji. Wszystkie istniejące testy przechodzą; czeka na przegląd.',
  },
];

/** Item 7 — long-conversation stress fixture, closing a real verification gap: every other
 * fixture in this file is short enough that the floating composer's scroll-padding/overlap
 * -correction mechanism (`ManagedSession`'s `composerHeight`/`contentHeight` effects) never
 * actually has to do real work — the conversation already fits without scrolling, so a passing
 * geometry assertion there would be true vacuously, not because the mechanism was exercised.
 * This fixture has no older history (`hasOlder: false`, unlike `sessionFixture`), so the only
 * thing driving the scroller's height is this many real entries — many more request/answer pairs
 * than the viewport can show at once, so `scrollHeight > clientHeight` by a meaningful margin and
 * the last message can only be reached by actually scrolling to the bottom. Cycles through
 * `longConversationTurns`' natural content (rather than a literal "message N" counter) to reach
 * that scale; each cycle still carries its own "(runda N)" reference so scroll-position assertions
 * can target a specific, unique entry. */
export function longConversationSnapshot(): SessionSnapshot {
  const snapshot = base();
  const pairs = 30;
  for (let i = 1; i <= pairs; i += 1) {
    const round = Math.floor((i - 1) / longConversationTurns.length) + 1;
    const turn = longConversationTurns[(i - 1) % longConversationTurns.length]!;
    snapshot.entries.push(
      {
        id: `request-${i}`,
        turnId,
        ordinal: i * 2,
        revision: 1,
        kind: 'request',
        createdAt: '2026-10-29T09:00:00Z',
        text: {
          text: round === 1 ? turn.request : `${turn.request} (runda ${round})`,
          complete: true,
        },
      },
      {
        id: `answer-${i}`,
        turnId,
        ordinal: i * 2 + 1,
        revision: 1,
        kind: 'answer',
        createdAt: '2026-10-29T09:00:01Z',
        text: {
          text: round === 1 ? turn.answer : `${turn.answer} (runda ${round})`,
          complete: true,
        },
      },
    );
  }

  return snapshot;
}

/** The long conversation's own final answer text (item 7): asserted visible, unclipped, after
 * scrolling to the true bottom. Entry 30 is `longConversationTurns`' last turn (index 9) in its
 * 3rd cycle (round 3: `Math.floor((30 - 1) / 10) + 1`). */
export const longConversationLastMessage = `${longConversationTurns[9]!.answer} (runda 3)`;

/**
 * The `Default` story's own canonical fixture (owner feedback: "Default ma dawać podgląd default
 * stanu, czyli długa sesja, powiązana z taskami, z workiem, etc." — a long session, linked to
 * Tasks, with Work reachable), replacing the previous `genericSpecLevelSnapshot()` default, which
 * was too sparse to review scroll/composer behavior or Work against: only 2 entries, no older
 * history, and no entry of kind `'work-summary'`/`'outcome'` at all, so the Primary conversation
 * never actually rendered an "Zobacz pracę" (Inspect) action anywhere.
 *
 * Builds on `longConversationSnapshot()`'s 30 request/answer pairs (real scroll-height stress,
 * §7 "item 7" above) and appends the intermediate status-line entry the owner specifically flagged
 * ("Checking the workflow admission path…", `EntryRow`'s `'commentary'` branch) plus a
 * `'work-summary'` entry whose `turnId` matches `workInspectorTurnId` — the same turn
 * `WorkInspector.stories.tsx`'s own `mixedWorkTimelineItems()`/`mixedWorkTimelineActions()`
 * fixtures already describe (reused here via `richDefaultApi` below, not duplicated) — so
 * "Zobacz pracę" opens a populated, representative Work timeline instead of the one-item stub
 * `fixtureApi`'s default `work()` returns. `history.hasOlder: true` also keeps the pre-existing
 * auto-load-older-history behavior demonstrable on the default story, matching a real long-lived
 * session more closely than a fixture with no older history at all.
 */
export function richDefaultSnapshot(): SessionSnapshot {
  const snapshot = longConversationSnapshot();
  // A real pre-selected model + effort, not the empty "Wybierz model" placeholder (owner
  // feedback, reference screenshots): `Default` is the canonical representative state, so it
  // shows the composer's Model/Effort picker already carrying a selection. `mock-standard`/`high`
  // are `providerFixture`'s own existing model/effort entries (`managedSession.stories-support.ts`)
  // matched to this fixture's `providerId: 'claude-code'` — not a new model invented for this
  // fixture alone. The placeholder/unselected state itself is untouched: every other state fixture
  // in this file still carries no `modelId`/`effort` at all.
  snapshot.session = { ...snapshot.session, modelId: 'mock-standard', effort: 'high' };
  snapshot.history = { hasOlder: true, before: 'older' };
  snapshot.entries.push(
    {
      id: 'status-1',
      turnId,
      ordinal: 62,
      revision: 1,
      kind: 'commentary',
      createdAt: '2026-10-29T09:05:00Z',
      text: { text: 'Checking the workflow admission path…', complete: true },
    },
    {
      id: 'work-summary-1',
      turnId: workInspectorTurnId,
      ordinal: 63,
      revision: 1,
      kind: 'work-summary',
      createdAt: '2026-10-29T09:05:05Z',
      text: { text: 'Workflow admission hardening — 10 kroków pracy', complete: true },
    },
  );
  snapshot.activeTurn = { turnId, state: 'active', revision: 1, startedAt: '2026-10-29T09:00:00Z' };
  snapshot.currentActivity = { kind: 'tool', turnId, label: 'Searching repository…' };

  return snapshot;
}

/**
 * `richDefaultSnapshot()`'s own backing `ManagedSessionsApi`: `snapshot`/`history`/`content`/
 * `providers` (matched to the snapshot's own `providerId`, see `providerFixture`) come from the
 * ordinary `fixtureApi`; `work`/`actions` are redirected to `WorkInspector.stories.tsx`'s own
 * `mixedWorkTimelineItems`/`mixedWorkTimelineActions` fixtures (via `createWorkInspectorFixtureApi`,
 * `context/sessionContextFixtures.ts`) instead of `fixtureApi`'s one-item stub, so "Zobacz pracę"
 * on the `work-summary-1` entry above opens the same rich, representative Work timeline Work's own
 * story group already demonstrates — not a second, separately authored Work fixture.
 */
export function richDefaultApi(): ManagedSessionsApi {
  const snapshot = richDefaultSnapshot();
  const workApi = createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
    [actionsWorkId]: mixedWorkTimelineActions(),
  });

  return {
    ...fixtureApi(snapshot),
    work: (...args) => workApi.work(...args),
    actions: (...args) => workApi.actions(...args),
  };
}
