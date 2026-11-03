import type {
  ConversationEntry,
  SessionSnapshot,
  ToolActionSummary,
  TurnSummary,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';
import { fixtureSessionId, fixtureApi } from './managedSession.stories-support';
import type { ManagedSessionsApi } from './api';
import {
  createWorkInspectorFixtureApi,
  fixtureContentPage,
  fixtureContentRef,
  hasFixtureContent,
  workInspectorTurnId,
} from './managedSession.workInspector.stories-support';
import type { ToolActivityKind, WithWorkDigest, WorkDigest } from './workCounts';

/** Isolated presentation adapters for the Full Session state fixtures: never imported by a
 * production route. Each builds a realistic `SessionSnapshot` for one state validated this pass
 * (full-session-screen-structure.md §12/§13/§15/§18/§19/§20). */

const turnId = '00000000-0000-4000-8000-000000000010';

function base(): SessionSnapshot {
  return {
    session: {
      sessionId: fixtureSessionId,
      projectId: 'project',
      providerId: 'claude',
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
    // One Turn per request/answer pair, as a real Session has — not one Turn spanning everything.
    const pairTurnId = `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`;
    snapshot.entries.push(
      {
        id: `request-${i}`,
        turnId: pairTurnId,
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
        turnId: pairTurnId,
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
 * One step of a fixture Turn's Work: a tool action (`kind` is the proposed demo sub-kind, `state`
 * the canonical Work state) or a Commentary line. `turnFixture` turns a list of these into BOTH the
 * conversation entries the real runtime would emit (one `work-summary` entry per tool Work, title
 * only — `specflow-runtime/.../persistence/facts.ts`) AND the Turn's own Work history items, so a
 * Work block and the Work history it opens can never disagree.
 */
type WorkStep =
  | {
      tool: string;
      kind: ToolActivityKind;
      state?: Extract<WorkSummary['state'], 'completed' | 'failed' | 'active' | 'interrupted'>;
    }
  | { commentary: string };

interface TurnFixture {
  turnId: string;
  entries: WithWorkDigest<ConversationEntry>[];
  items: WorkSummary[];
  /** One ToolAction per tool Work (the real runtime's common case), with real parameters, the
   * tool's actual response and its own timing — what Work history's L4 detail opens. */
  actions: Record<string, ToolActionSummary[]>;
}

/** Plausible per-kind call timings (seconds) so every settled step has a real elapsed time. */
const stepSeconds: Record<ToolActivityKind, number> = {
  read: 0.2,
  list: 0.1,
  search: 0.6,
  edit: 0.4,
  write: 0.3,
  command: 2.1,
  test: 8.4,
  web: 1.5,
  other: 0.5,
};

/** What the tool was called with and what it answered, derived from the step's own title so the
 * L2 row and its L4 detail always describe the same call. */
function toolCall(step: { tool: string; kind: ToolActivityKind }, failed: boolean) {
  const subject = step.tool.replace(
    /^(Read file|Edit|Write|Search code|List directory|Bash:)\s*/,
    '',
  );
  switch (step.kind) {
    case 'read':
      return {
        input: { file_path: subject },
        output: `     1	import { revision } from './revision-cache';
     2	
     3	export function admit(operation) {
     4	  return checkRevision(operation, revision());
     5	}`,
      };
    case 'search':
      return {
        input: { pattern: subject, path: 'src' },
        output: `src/admission-policy.mjs:42:  if (${subject}) {
src/workspace-writer.ts:118:  // ${subject}
2 matches in 2 files`,
      };
    case 'list':
      return {
        input: { path: subject },
        output: 'admission.test.mjs\nadmission-race.test.mjs\nfixtures/',
      };
    case 'edit':
    case 'write':
      return {
        input: { file_path: subject, old_string: 'retries: 0', new_string: 'retries: 1' },
        output: `Updated ${subject} (1 replacement).`,
      };
    case 'test':
    case 'command':
      return {
        input: { command: subject },
        output: failed
          ? [
              ' FAIL  test/admission.test.mjs > rejects a stale revision',
              '   AssertionError: expected "accepted" to be "rejected"',
              '',
              ' Tests  1 failed | 41 passed (42)',
            ].join('\n')
          : ' Test Files  8 passed (8)\n      Tests  42 passed (42)',
      };
    default:
      return { input: { subject }, output: 'Done.' };
  }
}

/**
 * Builds one Turn. `withDigest` attaches the proposed, demo-only `WorkDigest` (`workCounts.ts`) to
 * the Turn's last `work-summary` entry — computed here from the very steps that also become the Work
 * history, standing in for the per-Turn server projection that does not exist yet. Without it the
 * entries look exactly like today's real backend output.
 */
function turnFixture(
  turnId: string,
  nextOrdinal: () => number,
  request: string,
  steps: readonly WorkStep[],
  options: { answer?: string; outcome?: string; withDigest?: boolean } = {},
): TurnFixture {
  const entries: WithWorkDigest<ConversationEntry>[] = [];
  const items: WorkSummary[] = [];
  const actions: Record<string, ToolActionSummary[]> = {};
  const at = '2026-10-29T09:00:00Z';
  // Fixture clock (ms after `at`) so each step gets its own real start and elapsed time.
  let clock = 0;
  const stamp = (ms: number) => new Date(Date.parse(at) + ms).toISOString();
  const push = (kind: ConversationEntry['kind'], text: string, workId?: string) => {
    const ordinal = nextOrdinal();
    entries.push({
      id: `${turnId}-entry-${ordinal}`,
      turnId,
      ordinal,
      revision: 1,
      kind,
      createdAt: at,
      text: { text, complete: true },
      ...(workId ? { workId } : {}),
    });
  };

  push('request', request);
  const digest: WorkDigest = { done: {}, failed: {} };
  for (const step of steps) {
    const workId = `${turnId}-work-${items.length + 1}`;
    if ('commentary' in step) {
      push('commentary', step.commentary);
      items.push(workSummaryItem(workId, items.length + 1, 'commentary', step.commentary));
      continue;
    }

    const state = step.state ?? 'completed';
    push('work-summary', step.tool, workId);
    const settled = state !== 'active';
    const createdAt = stamp(clock);
    const updatedAt = stamp(clock + (settled ? stepSeconds[step.kind] * 1000 : 0));
    clock += stepSeconds[step.kind] * 1000 + 300;
    const call = toolCall(step, state === 'failed');
    items.push({
      ...workSummaryItem(workId, items.length + 1, 'tool', step.tool, state),
      actionCount: 1,
      createdAt,
      updatedAt,
    });
    actions[workId] = [
      {
        actionId: `${workId}-action-1`,
        ordinal: 1,
        revision: 1,
        state,
        title: { text: step.tool, complete: true },
        input: fixtureContentRef(JSON.stringify(call.input, null, 2)),
        ...(settled && state !== 'interrupted' ? { output: fixtureContentRef(call.output) } : {}),
        ...(state === 'failed'
          ? { error: { code: 'process_exit', message: '1 test failed.' } }
          : state === 'interrupted'
            ? { error: { code: 'interrupted', message: 'Interrupted before the tool returned.' } }
            : {}),
        createdAt,
        updatedAt,
      },
    ];
    // Every state counts toward `done` — the digest total, matching `computeWorkCounts`'s own
    // `items.length`-based `byKind.tool` the history panel renders (owner decision, round two
    // review: "licz wszystko jak w historii"; confirmed again, round four review, after a failed
    // action was found missing from the chat Work block's own top-line total — it must count in
    // BOTH places, not one or the other). `failed` is an ADDITIONAL breakdown layered on top of
    // `done`, giving the failure its own highlighted line, never a replacement for counting it in
    // the total: `active`/`interrupted`/`failed` all still fold into `done` since this per-kind
    // tally is "what this kind has happened so far", not strictly "succeeded", and the block's
    // separate live line already carries the currently-running item's own detail.
    digest.done[step.kind] = (digest.done[step.kind] ?? 0) + 1;
    if (state === 'failed') {
      digest.failed![step.kind] = (digest.failed![step.kind] ?? 0) + 1;
    }
  }

  if (options.withDigest) {
    const last = [...entries].reverse().find((entry) => entry.kind === 'work-summary');
    if (last) {
      last.digest = digest;
    }
  }

  if (options.answer) {
    push('answer', options.answer);
  }

  if (options.outcome) {
    push('outcome', options.outcome);
  }

  return { turnId, entries, items, actions };
}

function workSummaryItem(
  workId: string,
  ordinal: number,
  kind: WorkSummary['kind'],
  title: string,
  state: WorkSummary['state'] = 'completed',
): WorkSummary {
  return {
    workId,
    ordinal,
    revision: 1,
    kind,
    state,
    title: { text: title, complete: true },
    createdAt: '2026-10-29T09:00:00Z',
    updatedAt: '2026-10-29T09:00:00Z',
  };
}

/** Routes `work()`/`actions()` to each fixture Turn's own Work history (one paged fixture API per
 * Turn, `createWorkInspectorFixtureApi`), so opening any Work block shows that Turn's items. */
function perTurnWorkApi(
  snapshot: SessionSnapshot,
  turns: readonly TurnFixture[],
  actionsByWorkId: Record<string, readonly ToolActionSummary[]> = {},
): ManagedSessionsApi {
  const apis = new Map(
    turns.map((turn) => {
      const request = turn.entries.find((entry) => entry.kind === 'request')!;
      const active = snapshot.activeTurn?.turnId === turn.turnId;
      const summary: TurnSummary = active
        ? {
            turnId: turn.turnId,
            state: 'active',
            revision: 1,
            createdAt: '2026-10-29T09:00:00Z',
            updatedAt: '2026-10-29T09:00:00Z',
            userMessage: request.text,
          }
        : {
            turnId: turn.turnId,
            state: 'terminal',
            outcome: (turn.entries.find((entry) => entry.kind === 'outcome')?.text.text ??
              'completed') as Extract<TurnSummary, { state: 'terminal' }>['outcome'],
            revision: 1,
            createdAt: '2026-10-29T09:00:00Z',
            updatedAt: '2026-10-29T09:00:00Z',
            completedAt: '2026-10-29T09:01:00Z',
            userMessage: request.text,
          };

      return [
        turn.turnId,
        createWorkInspectorFixtureApi(
          turn.items,
          { ...turn.actions, ...actionsByWorkId },
          40,
          summary,
        ),
      ] as const;
    }),
  );
  const forTurn = (turnId: string) => {
    const api = apis.get(turnId);
    if (!api) {
      throw new Error(`No Work fixture for Turn ${turnId}`);
    }

    return api;
  };

  const baseApi = fixtureApi(snapshot);

  return {
    ...baseApi,
    work: (sessionId, turnId, ...rest) => forTurn(turnId).work(sessionId, turnId, ...rest),
    // Routed to the Turn that owns this Work (every fixture workId is `${turnId}-work-N`).
    actions: (sessionId, workId, ...rest) =>
      (
        [...apis.entries()].find(([id]) => workId.startsWith(id))?.[1] ?? [...apis.values()][0]!
      ).actions(sessionId, workId, ...rest),
    // ToolAction parameters/responses come from the Work fixtures; anything else (long answers)
    // stays with the conversation fixture's own content pages.
    content: (sessionId, ref, offset, signal) =>
      hasFixtureContent(ref)
        ? fixtureContentPage(ref, offset)
        : baseApi.content(sessionId, ref, offset, signal),
  };
}

/**
 * The `Default` story's own canonical fixture (owner feedback: "Default ma dawać podgląd default
 * stanu, czyli długa sesja, powiązana z taskami, z workiem, etc."): `longConversationSnapshot()`'s
 * 30 request/answer pairs (real scroll-height stress, "item 7" above) followed by a live Turn in
 * the middle of its work — Commentary, a run of tool Work (one `work-summary` entry per tool, as the
 * real runtime emits them), a failed test command, and the agent currently running another test
 * command. Its Work block, the header and the Work history it opens all describe that same Turn.
 * `history.hasOlder: true` keeps auto-load-older-history demonstrable.
 */
/** The live Turn is the one the Context fixture's Work history row also opens. */
const liveTurnId = workInspectorTurnId;

function richDefaultFixture(): { snapshot: SessionSnapshot; turns: TurnFixture[] } {
  const snapshot = longConversationSnapshot();
  // A real pre-selected model + effort, not the empty "Wybierz model" placeholder (owner
  // feedback, reference screenshots). `mock-standard`/`high` are `providerFixture`'s own entries.
  snapshot.session = {
    ...snapshot.session,
    modelId: 'mock-standard',
    effort: 'high',
    readiness: 'busy',
  };
  snapshot.history = { hasOlder: true, before: 'older' };
  // base()'s opening request belongs to the same Turn id; the live Turn brings its own request.
  snapshot.entries = snapshot.entries.filter((entry) => entry.turnId !== liveTurnId);
  let ordinal = snapshot.entries.length * 2 + 10;
  const live = turnFixture(
    liveTurnId,
    () => (ordinal += 1),
    'Uruchom testy admission jeszcze raz i popraw to, co nie przechodzi.',
    [
      { tool: 'Read file session.ts', kind: 'read' },
      { commentary: 'Sprawdzam ścieżkę admission i miejsce, w którym odrzuca operację…' },
      { tool: 'Read file admission.mjs', kind: 'read' },
      { tool: 'Search code WORKSPACE_WRITER_BLOCKED', kind: 'search' },
      { tool: 'Search code readiness-policy', kind: 'search' },
      { tool: 'Edit workspace (3 files)', kind: 'edit' },
      { tool: 'Bash: pnpm test -- admission', kind: 'test', state: 'failed' },
      { commentary: 'Jeden test nie przechodzi — sprawdzam asercję przed ponownym uruchomieniem…' },
      { tool: 'Edit admission.test.mjs', kind: 'edit' },
      { tool: 'Bash: pnpm test -- admission', kind: 'test', state: 'active' },
    ],
    { withDigest: true },
  );
  snapshot.entries.push(...live.entries);
  snapshot.activeTurn = {
    turnId: liveTurnId,
    state: 'active',
    revision: 1,
    startedAt: '2026-10-29T09:00:00Z',
  };
  snapshot.currentActivity = {
    kind: 'tool',
    turnId: liveTurnId,
    workId: live.items.at(-1)!.workId,
    label: 'Bash: pnpm test -- admission',
  };

  return { snapshot, turns: [live] };
}

export function richDefaultSnapshot(): SessionSnapshot {
  return richDefaultFixture().snapshot;
}

/** `richDefaultSnapshot()`'s own backing API: everything from `fixtureApi`, `work()` from the live
 * Turn's own Work items (same steps its Work block counts). */
export function richDefaultApi(): ManagedSessionsApi {
  const { snapshot, turns } = richDefaultFixture();

  return perTurnWorkApi(snapshot, turns);
}

/**
 * Every Work-block state in one realistic multi-Turn conversation (session-chat-v10-design.md
 * §3.1): settled; settled with a failed test across many kinds (four-kinds cap + "i więcej"); a
 * Turn interrupted mid-work (shown once, in its block — no separate outcome row); a Turn with no
 * tool Work that failed (outcome row alone, the only place that fact exists); a Turn whose entries
 * carry no digest — exactly today's real backend output (honest "N działań narzędzi"); and the live
 * Turn thinking. Every block opens Work history with that Turn's own items.
 */
function workSummaryStatesFixture(): { snapshot: SessionSnapshot; turns: TurnFixture[] } {
  const snapshot = base();
  let ordinal = 0;
  const next = () => (ordinal += 1);
  const turn = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
  const turns = [
    turnFixture(
      turn(1),
      next,
      'Sprawdź, dlaczego admission odrzuca operacje mimo poprawnych uprawnień.',
      [
        { tool: 'Read file admission-policy.mjs', kind: 'read' },
        { tool: 'Read file workspace-writer.ts', kind: 'read' },
        { tool: 'Search code revision', kind: 'search' },
        { tool: 'Read file revision-cache.ts', kind: 'read' },
        { tool: 'Read file admission-policy.test.mjs', kind: 'read' },
      ],
      {
        answer:
          'Polityka sprawdza rewizję specyfikacji sprzed ostatniego commita — to wyścig, nie błąd uprawnień.',
        outcome: 'completed',
        withDigest: true,
      },
    ),
    turnFixture(
      turn(2),
      next,
      'Napraw to i dodaj test odtwarzający wyścig.',
      [
        { commentary: 'Dodaję ponowną weryfikację rewizji przed odrzuceniem…' },
        { tool: 'Read file admission-policy.mjs', kind: 'read' },
        { tool: 'Edit admission-policy.mjs', kind: 'edit' },
        { tool: 'Write admission-race.test.mjs', kind: 'write' },
        { tool: 'Bash: pnpm lint', kind: 'command' },
        { tool: 'Search code retryAdmission', kind: 'search' },
        { tool: 'Edit telemetry/retries.ts', kind: 'edit' },
        { tool: 'List directory test/integration', kind: 'list' },
        { tool: 'Bash: pnpm test -- admission-race', kind: 'test', state: 'failed' },
      ],
      {
        answer:
          'Poprawka gotowa, ale jeden test integracyjny nadal nie przechodzi — szczegóły w historii pracy.',
        outcome: 'completed',
        withDigest: true,
      },
    ),
    turnFixture(
      turn(3),
      next,
      'Uruchom pełny zestaw testów jeszcze raz.',
      [
        { tool: 'Read file package.json', kind: 'read' },
        { tool: 'Read file vitest.config.ts', kind: 'read' },
        { tool: 'Bash: pnpm test', kind: 'test', state: 'interrupted' },
      ],
      { outcome: 'interrupted', withDigest: true },
    ),
    turnFixture(turn(4), next, 'Wyślij podsumowanie na kanał zespołu.', [], {
      outcome: 'failed',
    }),
    turnFixture(
      turn(5),
      next,
      'Podsumuj zmiany dla code review.',
      [
        { tool: 'Bash: git diff --stat', kind: 'command' },
        { tool: 'Read file admission-policy.mjs', kind: 'read' },
        { tool: 'Read file admission-policy.test.mjs', kind: 'read' },
        { tool: 'Read file telemetry/retries.ts', kind: 'read' },
      ],
      {
        answer: 'Zmieniono politykę admission, dodano test wyścigu i telemetrię ponowień.',
        outcome: 'completed',
      },
    ),
    turnFixture(
      turn(6),
      next,
      'Sprawdź jeszcze przypadek zamkniętej specyfikacji.',
      [
        { commentary: 'Szukam ścieżki dla zamkniętej specyfikacji…' },
        { tool: 'Search code SPEC_CLOSED', kind: 'search' },
        { tool: 'Read file spec-lifecycle.ts', kind: 'read' },
      ],
      { withDigest: true },
    ),
  ];
  snapshot.entries = turns.flatMap((fixture) => fixture.entries);
  snapshot.session = { ...snapshot.session, readiness: 'busy' };
  snapshot.activeTurn = {
    turnId: turn(6),
    state: 'active',
    revision: 1,
    startedAt: '2026-10-29T09:10:00Z',
  };
  snapshot.currentActivity = { kind: 'reasoning', turnId: turn(6), label: 'Reasoning' };

  return { snapshot, turns };
}

export function workSummaryStatesSnapshot(): SessionSnapshot {
  return workSummaryStatesFixture().snapshot;
}

export function workSummaryStatesApi(): ManagedSessionsApi {
  const { snapshot, turns } = workSummaryStatesFixture();

  return perTurnWorkApi(snapshot, turns);
}
