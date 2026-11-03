import type {
  ActionPage,
  ContentPage,
  ContentRef,
  ProviderDescriptor,
  ToolActionSummary,
  TurnSummary,
  WorkPage,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { fixtureSessionId } from './managedSession.stories-support';
import type { WorkCounts, WorkKind } from './workCounts';

/** Isolated Storybook fixtures for the Work L2 timeline (WorkInspector.tsx): never imported by a
 * production route. Kept independent from `ManagedSession.tsx`/`managedSession.stories-support.ts`
 * so these stories do not depend on that file while it is under parallel, unrelated edit. */

export const workInspectorTurnId = '00000000-0000-4000-8000-000000000010';
const actionsWorkId = '00000000-0000-4000-8000-000000000011';
const longReadWorkId = '00000000-0000-4000-8000-000000000012';

const turnSummary: TurnSummary = {
  turnId: workInspectorTurnId,
  state: 'active',
  revision: 1,
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
  userMessage: { text: 'Investigate why workflow admission is failing.', complete: true },
};

/** Fixture-only full text behind a `ContentRef` (a ToolAction's real parameters/response), served by
 * every fixture API's `content()` below — so the L4 detail screen shows real content instead of
 * a rejected fetch. */
const fixtureContents = new Map<string, string>();
let contentSeq = 0;

export function fixtureContentRef(text: string): ContentRef {
  contentSeq += 1;
  const contentId = `00000000-0000-4000-8000-${String(900000000000 + contentSeq)}`;
  fixtureContents.set(contentId, text);

  return { contentId, revision: '1', byteLength: new TextEncoder().encode(text).length };
}

export function hasFixtureContent(ref: ContentRef): boolean {
  return fixtureContents.has(ref.contentId);
}

export function fixtureContentPage(ref: ContentRef, offset = 0): Promise<ContentPage> {
  const text = fixtureContents.get(ref.contentId);
  if (text === undefined) {
    return Promise.reject(new Error(`No fixture content ${ref.contentId}`));
  }

  return Promise.resolve({
    contentId: ref.contentId,
    revision: ref.revision,
    offset,
    text: text.slice(offset),
    complete: true,
  });
}

let seq = 0;
function workItem(overrides: Partial<WorkSummary> & { kind: WorkSummary['kind'] }): WorkSummary {
  seq += 1;

  return {
    workId: `${workInspectorTurnId}-work-${seq}`,
    ordinal: seq,
    revision: 1,
    state: 'completed',
    title: { text: overrides.kind + ' ' + seq, complete: true },
    createdAt: '2026-10-30T10:00:00Z',
    updatedAt: '2026-10-30T10:00:00Z',
    ...overrides,
  };
}

/**
 * A moderate, hand-authored mix exercising every grouping/Thinking/filter rule at once:
 * a leading tool burst before any Commentary (Start of Turn), a Commentary chapter with a
 * Reasoning summary and a run of happy-path tools compacted into a burst, a second chapter
 * isolating a failed command, and a Work item with child ToolActions to drill into.
 */
export function mixedWorkTimelineItems(): WorkSummary[] {
  return [
    workItem({ kind: 'tool', title: { text: 'Read file session.ts', complete: true } }),
    workItem({
      kind: 'commentary',
      title: {
        text: 'Checking the implementation and locating the admission path…',
        complete: true,
      },
    }),
    workItem({
      kind: 'reasoning',
      title: {
        text: 'Two approaches could fix this; the narrower one risks missing a related case.',
        complete: true,
      },
    }),
    workItem({ kind: 'tool', title: { text: 'Read file admission.mjs', complete: true } }),
    workItem({
      kind: 'tool',
      title: { text: 'Search code WORKSPACE_WRITER_BLOCKED', complete: true },
    }),
    workItem({ kind: 'tool', title: { text: 'Search code readiness-policy', complete: true } }),
    workItem({
      kind: 'commentary',
      title: { text: 'One test failed; checking the assertion before retrying…', complete: true },
    }),
    workItem({
      kind: 'tool',
      state: 'failed',
      title: { text: 'Run command pnpm test', complete: true },
    }),
    workItem({
      kind: 'tool',
      title: { text: 'Edit workspace (3 files)', complete: true },
      actionCount: 3,
      workId: actionsWorkId,
    }),
    workItem({
      kind: 'interaction',
      state: 'completed',
      title: { text: 'Permission to write workspace', complete: true },
    }),
    // A long title and a long single-action response: the row wraps to two lines instead of being
    // cut, and its details scroll on their own instead of stretching the panel.
    workItem({
      kind: 'tool',
      title: {
        text: 'Read file packages/specflow-runtime/src/features/sessions/persistence/admission-revision-reconciliation.test.mjs',
        complete: true,
      },
      actionCount: 1,
      workId: longReadWorkId,
      createdAt: '2026-10-30T10:00:09.000Z',
      updatedAt: '2026-10-30T10:00:09.180Z',
    }),
  ];
}

/** The single ToolAction of the long-titled read above: a long path parameter and a long, plain-text
 * (not JSON) response. */
export function longReadActions(): ToolActionSummary[] {
  return [
    {
      actionId: 'a-long-1',
      ordinal: 1,
      revision: 1,
      state: 'completed',
      title: {
        text: 'Read · packages/specflow-runtime/src/features/sessions/persistence/admission-revision-reconciliation.test.mjs',
        complete: true,
      },
      input: fixtureContentRef(
        JSON.stringify(
          {
            file_path:
              'packages/specflow-runtime/src/features/sessions/persistence/admission-revision-reconciliation.test.mjs',
            offset: 1,
            limit: 80,
          },
          null,
          2,
        ),
      ),
      output: fixtureContentRef(
        Array.from(
          { length: 80 },
          (_, index) =>
            `${String(index + 1).padStart(5)}\t${index % 9 === 0 ? `describe('admission revision ${index}', () => {` : `  expect(await admit(operation${index})).toEqual({ state: 'accepted', revision: ${index} });`}`,
        ).join('\n'),
      ),
      createdAt: '2026-10-30T10:00:09.000Z',
      updatedAt: '2026-10-30T10:00:09.180Z',
    },
  ];
}

export function mixedWorkTimelineActions(): ToolActionSummary[] {
  return [
    {
      actionId: 'a1',
      ordinal: 1,
      revision: 1,
      state: 'completed',
      title: { text: 'Edit · admission.mjs', complete: true },
      input: fixtureContentRef(
        JSON.stringify(
          {
            file_path: 'src/admission.mjs',
            old_string: 'if (revision !== current) reject();',
            new_string: 'if (revision !== (await reloadRevision())) reject();',
          },
          null,
          2,
        ),
      ),
      output: fixtureContentRef('Updated src/admission.mjs (1 replacement, lines 42-44).'),
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.420Z',
    },
    {
      actionId: 'a2',
      ordinal: 2,
      revision: 1,
      state: 'completed',
      title: { text: 'Edit · readiness-policy.mjs', complete: true },
      input: fixtureContentRef(
        JSON.stringify(
          {
            file_path: 'src/readiness-policy.mjs',
            old_string: 'retries: 0',
            new_string: 'retries: 1',
          },
          null,
          2,
        ),
      ),
      output: fixtureContentRef('Updated src/readiness-policy.mjs (1 replacement, line 17).'),
      createdAt: '2026-10-30T10:00:01.000Z',
      updatedAt: '2026-10-30T10:00:01.310Z',
    },
    {
      actionId: 'a3',
      ordinal: 3,
      revision: 1,
      state: 'failed',
      title: { text: 'Execute · pnpm test', complete: true },
      input: fixtureContentRef(JSON.stringify({ command: 'pnpm test -- admission' }, null, 2)),
      output: fixtureContentRef(
        [
          ' FAIL  test/admission.test.mjs > rejects a stale revision',
          '   AssertionError: expected "accepted" to be "rejected"',
          '',
          ' Test Files  1 failed | 7 passed (8)',
          '      Tests  1 failed | 41 passed (42)',
        ].join('\n'),
      ),
      error: { code: 'process_exit', message: '1 test failed.' },
      createdAt: '2026-10-30T10:00:02.000Z',
      updatedAt: '2026-10-30T10:00:08.400Z',
    },
  ];
}

/**
 * A single chapter built specifically to demonstrate live owner review #2's adaptive grouping
 * (session-work-inspector-ui-spec.md's grouping algorithm, rule 3 of the structural pass): a run
 * of adjacent happy-path tool items long enough to actually compact into one burst `Timeline.Item`
 * (`workGrouping.TOOL_BURST_MIN_SIZE`+ — see `WorkInspector.stories.tsx`'s `LongRunGrouping`),
 * immediately followed by a failed tool and one more ordinary tool. The failed tool chronologically
 * follows the long run but must never be swallowed into it (rule 4: errors stay individually
 * visible even inside what would otherwise be a grouped run) — real canonical Work kind/state only,
 * same as every other fixture in this file.
 */
export function longRunWorkTimelineItems(): WorkSummary[] {
  return [
    workItem({
      kind: 'commentary',
      title: {
        text: 'Scanning the whole module for every caller before changing it…',
        complete: true,
      },
    }),
    ...Array.from({ length: 7 }, (_, index) =>
      workItem({ kind: 'tool', title: { text: `Read file module-${index}.ts`, complete: true } }),
    ),
    workItem({
      kind: 'tool',
      state: 'failed',
      title: { text: 'Run command pnpm test', complete: true },
    }),
    workItem({ kind: 'tool', title: { text: 'Edit fix.ts', complete: true } }),
  ];
}

/**
 * The design doc's own synthetic scalability scenario (session-chat-v10-design.md §4: "the
 * 144-item example is synthetic scalability test data"): repeating Commentary/Reasoning/tool
 * phases until `count` canonical Work items exist, used to demonstrate that WorkInspector pages
 * this bounded instead of fetching/mounting all of it up front.
 */
export function largeWorkTimelineItems(count = 144): WorkSummary[] {
  const items: WorkSummary[] = [];
  let phase = 0;
  while (items.length < count) {
    items.push(
      workItem({
        kind: 'commentary',
        title: { text: `Phase ${phase}: narrowing the admission failure…`, complete: true },
      }),
      workItem({ kind: 'tool', title: { text: `Read file module-${phase}.ts`, complete: true } }),
      workItem({ kind: 'tool', title: { text: `Search code TOKEN_${phase}`, complete: true } }),
      workItem({
        kind: 'tool',
        title: { text: `Run command pnpm check -- ${phase}`, complete: true },
      }),
    );
    if (phase % 5 === 0) {
      items.push(
        workItem({
          kind: 'reasoning',
          title: { text: `Weighing two fixes for phase ${phase}`, complete: true },
        }),
      );
    }

    phase += 1;
  }

  return items.slice(0, count);
}

/**
 * Demo stand-in for the proposed, not-yet-backend-implemented `WorkPage.counts` aggregate
 * (workCounts.ts, docs/reference/api/sessions.md "Proposed Work aggregate counts"): computed once
 * from the FULL fixture `items` array, never per-page, so it keeps demonstrating a true Turn-wide
 * total even while `createWorkInspectorFixtureApi` only ever serves one bounded page at a time —
 * exactly the server-side projection this is standing in for.
 */
function computeWorkCounts(items: readonly WorkSummary[]): WorkCounts {
  const byKind: Record<WorkKind, number> = {
    commentary: 0,
    reasoning: 0,
    interaction: 0,
    tool: 0,
  };
  let inProgress = 0;

  for (const item of items) {
    byKind[item.kind] += 1;
    if (item.state === 'active') {
      inProgress += 1;
    }
  }

  return { total: items.length, inProgress, byKind };
}

function paginate<T>(items: readonly T[], pageSize: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }

  return pages.length ? pages : [[]];
}

/**
 * A deterministic, bounded-paging fixture `ManagedSessionsApi`: `work()`/`actions()` serve the
 * newest page first (tail window) and older pages progressively by cursor, exactly like the real
 * `WorkPage`/`ActionPage` contract — never a client-side full-history array. Every other method
 * is a minimal stub; these stories never exercise them.
 */
export function createWorkInspectorFixtureApi(
  items: readonly WorkSummary[],
  actionsByWorkId: Record<string, readonly ToolActionSummary[]> = {},
  pageSize = 40,
  turn: TurnSummary = turnSummary,
): ManagedSessionsApi {
  const pages = paginate(items, pageSize);
  const counts = computeWorkCounts(items);

  return {
    providers: () => Promise.resolve({ items: [] as ProviderDescriptor[] }),
    create: () => Promise.resolve({ sessionId: fixtureSessionId }),
    snapshot: () => Promise.reject(new Error('not used by these stories')),
    history: () => Promise.reject(new Error('not used by these stories')),
    work: (_sessionId, _turnId, before) => {
      const index = before === undefined ? pages.length - 1 : Number(before);
      const pageItems = pages[index] ?? [];
      const hasOlder = index > 0;

      return Promise.resolve({
        sessionId: fixtureSessionId,
        eventSeq: 1,
        turn,
        items: pageItems,
        history: { hasOlder, before: hasOlder ? String(index - 1) : undefined },
        counts,
      } satisfies WorkPage & { counts: WorkCounts });
    },
    actions: (_sessionId, workId) =>
      Promise.resolve({
        sessionId: fixtureSessionId,
        eventSeq: 1,
        workId,
        items: [...(actionsByWorkId[workId] ?? [])],
        history: { hasOlder: false },
      } satisfies ActionPage),
    content: (_sessionId, ref, offset) => fixtureContentPage(ref, offset),
    start: () => Promise.resolve({ turnId: workInspectorTurnId }),
    cancel: () => Promise.resolve({ turnId: workInspectorTurnId }),
    respond: () => Promise.resolve({ turnId: workInspectorTurnId }),
    async *watch(_sessionId, _after, signal) {
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

export { actionsWorkId, longReadWorkId };
