import type {
  ActionPage,
  ContentPage,
  ContentRef,
  ProviderDescriptor,
  ToolActionSummary,
  TurnSummary,
  WorkCounts,
  WorkPage,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { fixtureSessionId } from './managedSession.stories-support';

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
 * Questions the owner answered (dogfood round 3): one recorded with its answer (a choice plus the
 * owner's own words), one recorded as free text only, and one from before answers were recorded,
 * which keeps its plain row.
 */
export function answeredQuestionItems(): WorkSummary[] {
  return [
    workItem({
      kind: 'commentary',
      title: {
        text: 'Four decisions shape this Specification; asking before writing.',
        complete: true,
      },
    }),
    workItem({
      kind: 'interaction',
      title: { text: 'Question', complete: true },
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:01:13Z',
      question: {
        header: 'Scope',
        text: 'Which batches should this Specification deliver? The issue lists five, A to E; Sessions (E) is the largest.',
        options: [
          { id: '0', label: 'All batches A–E (Recommended)' },
          { id: '1', label: 'Batches A–D, Sessions later' },
          { id: '2', label: 'Batch A only' },
        ],
        answer: { optionIds: ['0'], text: 'Do Sessions last, behind the other four.' },
      },
    }),
    workItem({
      kind: 'interaction',
      title: { text: 'Question', complete: true },
      question: {
        header: 'Fault scenarios',
        text: 'How should tests inject the demo fault scenarios?',
        options: [
          { id: '0', label: 'Test-only injected port (Recommended)' },
          { id: '1', label: 'A request header' },
        ],
        answer: { optionIds: [], text: 'A test-only port, never in the public schemas.' },
      },
    }),
    workItem({ kind: 'interaction', title: { text: 'Question', complete: true } }),
  ];
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
      interaction: 'permission',
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
 * (full-session.md "Work history (L2)"'s tool-burst rule, rule 3 of the structural pass): a run
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
 * The V10 mock's synthetic scalability scenario (its 144-item Work timeline; bounded loading is
 * full-session.md "Work history (L2)"): repeating Commentary/Reasoning/tool
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
 * Fixture value of Runtime's `WorkPage.counts` aggregate (docs/reference/api/sessions.md "Work
 * aggregate counts"): computed once
 * from the FULL fixture `items` array, never per-page, so it keeps demonstrating a true Turn-wide
 * total even while `createWorkInspectorFixtureApi` only ever serves one bounded page at a time —
 * exactly the server-side projection this is standing in for.
 */
function computeWorkCounts(items: readonly WorkSummary[]): WorkCounts {
  const byKind: WorkCounts['byKind'] = {
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
      } satisfies WorkPage);
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
    // No telemetry in these fixtures: Context stories supply their own snapshot.
    telemetry: () => Promise.resolve({ kind: 'not-modified' }),
    refreshTelemetry: () => Promise.reject(new Error('No telemetry in this fixture.')),
    reconcile: () =>
      Promise.resolve({ turnId: workInspectorTurnId, outcome: 'completed', reconciled: true }),
    rename: () => Promise.reject(new Error('not used by these stories')),
    archive: () => Promise.reject(new Error('not used by these stories')),
    unarchive: () => Promise.reject(new Error('not used by these stories')),
    delete: () => Promise.reject(new Error('not used by these stories')),
    respond: (_id, interactionId) =>
      Promise.resolve({ turnId: workInspectorTurnId, interactionId }),
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

export const claudeWriteWorkId = '00000000-0000-4000-8000-000000000013';
const worktree = 'C:/Users/owner/nevo-verify/dogfood/worktree';

/**
 * A realistic Claude Turn as the Runtime now records it: tool Work named by its first action's
 * operation and workspace-relative subject, a permission with the person's decision, a write Work
 * whose third file failed (named on its row), the agent's own note heading the next phase, and a
 * permission still waiting.
 */
export function claudeTurnWorkItems(): WorkSummary[] {
  return [
    workItem({
      kind: 'tool',
      title: { text: 'Bash', complete: true },
      operation: 'command',
      subject: 'mkdir -p /tmp/dummy-job && cd /tmp/dummy-job && ./hello.sh …',
      actionCount: 1,
      createdAt: '2026-11-24T19:10:00.000Z',
      updatedAt: '2026-11-24T19:10:25.300Z',
    }),
    workItem({
      kind: 'interaction',
      title: { text: 'Bash', complete: true },
      operation: 'command',
      subject: 'mkdir -p /tmp/dummy-job && cd /tmp/dummy-job && ./hello.sh …',
      decision: 'allowed',
      createdAt: '2026-11-24T19:10:01.000Z',
      updatedAt: '2026-11-24T19:10:12.400Z',
    }),
    workItem({
      workId: claudeWriteWorkId,
      kind: 'tool',
      state: 'failed',
      title: { text: 'Write', complete: true },
      operation: 'write',
      subject: 'dummy-scratch/job.sh',
      actionCount: 3,
      failure: {
        subject: 'dummy-scratch/test.sh',
        message: 'File has not been read yet. Read it first before writing to it.',
      },
      createdAt: '2026-11-24T19:10:30.000Z',
      updatedAt: '2026-11-24T19:10:54.800Z',
    }),
    workItem({
      kind: 'commentary',
      title: {
        text: "The file tools can only write inside the worktree, so I'll use a scratch directory there and delete it afterwards.",
        complete: true,
      },
    }),
    workItem({
      kind: 'tool',
      title: { text: 'Edit', complete: true },
      operation: 'edit',
      subject: 'dummy-scratch/job.sh',
      actionCount: 1,
      createdAt: '2026-11-24T19:11:00.000Z',
      updatedAt: '2026-11-24T19:11:00.031Z',
    }),
    workItem({
      kind: 'interaction',
      state: 'active',
      title: { text: 'Bash', complete: true },
      operation: 'command',
      subject: 'rm -rf dummy-scratch /tmp/dummy-job',
    }),
  ];
}

/** The write Work's three actions: two created files and the one Claude refused. */
export function claudeWriteActions(): ToolActionSummary[] {
  const write = (
    ordinal: number,
    name: string,
    content: string,
    failed = false,
  ): ToolActionSummary => ({
    actionId: `00000000-0000-4000-8000-00000000002${ordinal}`,
    ordinal,
    revision: 1,
    state: failed ? ('failed' as const) : ('completed' as const),
    title: { text: 'Write', complete: true },
    operation: 'write' as const,
    subject: `dummy-scratch/${name}`,
    input: fixtureContentRef(
      JSON.stringify({ file_path: `${worktree}/dummy-scratch/${name}`, content }),
    ),
    output: fixtureContentRef(
      failed
        ? '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>'
        : `File created successfully at: ${worktree}/dummy-scratch/${name}`,
    ),
    ...(failed
      ? {
          error: {
            code: 'TOOL_FAILED',
            message: 'File has not been read yet. Read it first before writing to it.',
          },
        }
      : {}),
    createdAt: '2026-11-24T19:10:30.000Z',
    updatedAt: '2026-11-24T19:10:30.026Z',
  });

  return [
    write(
      1,
      'job.sh',
      [
        '#!/bin/bash',
        '# Dummy job: prints a greeting for a name.',
        'name="${1:-World}"',
        'echo "Hello, ${name}!"',
      ].join('\n'),
    ),
    write(2, 'hello.sh', ['#!/bin/bash', 'echo "Hello, World! (2)"'].join('\n')),
    write(
      3,
      'test.sh',
      ['#!/bin/bash', 'set -e', '[ "$(./job.sh)" = "Hello, World!" ]'].join('\n'),
      true,
    ),
  ];
}

/** The failed edit of `dogfoodTurnWorkItems` that `dogfoodEditActions` details. */
export const dogfoodEditWorkId = '00000000-0000-4000-8000-000000000031';
const longPath =
  'specs/active/converge-demo-and-project-http-apis/nevo-solution/architecture/runtime/backend.md';

/**
 * The Turn the owner reported (dogfood 4, session 6ad1fe2a, Turn 2, shortened): commands each with
 * an allowed permission, a progress note between them, five failed edits of one file in a row, a
 * failed read under its own note, then a completed read and two edits the stop interrupted. In the
 * compact view the first two commands are one group; every failure and interruption is its own row.
 */
export function dogfoodTurnWorkItems(): WorkSummary[] {
  const at = (second: number) => new Date(Date.UTC(2026, 10, 25, 12, 8, second)).toISOString();
  const command = (subject: string, start: number, ms: number): WorkSummary[] => [
    workItem({
      kind: 'tool',
      title: { text: 'Bash', complete: true },
      operation: 'command',
      subject,
      actionCount: 1,
      createdAt: at(start),
      updatedAt: new Date(Date.parse(at(start)) + ms).toISOString(),
    }),
    workItem({
      kind: 'interaction',
      interaction: 'permission',
      title: { text: 'Bash', complete: true },
      operation: 'command',
      subject,
      decision: 'allowed',
      createdAt: at(start),
      updatedAt: at(start + 1),
    }),
  ];
  const failedEdit = (start: number, workId?: string) =>
    workItem({
      ...(workId ? { workId } : {}),
      kind: 'tool',
      state: 'failed',
      title: { text: 'Edit', complete: true },
      operation: 'edit',
      subject: longPath,
      actionCount: 1,
      failure: { message: 'File has not been read yet. Read it first before writing to it.' },
      createdAt: at(start),
      updatedAt: new Date(Date.parse(at(start)) + 17).toISOString(),
    });
  const note = (text: string, second: number) =>
    workItem({ kind: 'commentary', title: { text, complete: true }, createdAt: at(second) });

  return [
    note(
      "The re-sent brief shows that `architecture.md` and `decisions.md` are registered at their new revisions. What's left is to bring `backend.md`, `behaviour.md` and the overview in line with D4–D11 and the parity-map corrections, then finish. First I'll confirm the Session management paths for the backend document.",
      0,
    ),
    ...command(
      'cd /c/Users/owner/nevo-verify/dogfood/worktrees/converge-demo-and-project-http-apis/packages/specflow-runtime/src/features/sessions/http && sed -n 85,115p …',
      1,
      1600,
    ),
    ...command(
      'cd /c/Users/owner/nevo-verify/dogfood/worktrees/converge-demo-and-project-http-apis/packages/specflow-runtime/src/features/sessions/http && sed -n 70,90p …',
      5,
      501,
    ),
    note("Now I'll write the updated `backend.md` and save it through the CLI.", 10),
    ...command(
      'cd /c/Users/owner/nevo-verify/dogfood/worktrees/converge-demo-and-project-http-apis && mkdir -p /tmp/nevo-solution …',
      11,
      2700,
    ),
    failedEdit(21, dogfoodEditWorkId),
    failedEdit(23),
    failedEdit(27),
    failedEdit(34),
    failedEdit(36),
    note("The edit tool needs a read first. I'll read the file, then edit it.", 40),
    workItem({
      kind: 'tool',
      state: 'failed',
      title: { text: 'Read', complete: true },
      operation: 'read',
      subject: longPath,
      actionCount: 1,
      failure: { message: 'File is outside the working directories.' },
      createdAt: at(40),
      updatedAt: at(41),
    }),
    note('The file tools only work inside the worktree, so I will edit it there.', 46),
    workItem({
      kind: 'tool',
      title: { text: 'Read', complete: true },
      operation: 'read',
      subject: 'converge-demo-and-project-http-apis/backend.md',
      actionCount: 1,
      createdAt: at(46),
      updatedAt: new Date(Date.parse(at(46)) + 19).toISOString(),
    }),
    workItem({
      kind: 'tool',
      state: 'interrupted',
      title: { text: 'Edit', complete: true },
      operation: 'edit',
      subject: 'converge-demo-and-project-http-apis/backend.md',
      actionCount: 1,
      createdAt: at(55),
      updatedAt: at(59),
    }),
  ];
}

/** The first failed edit of `dogfoodTurnWorkItems`: one action, its text before and after. */
export function dogfoodEditActions(): ToolActionSummary[] {
  const before = '"Demo today" is what `packages/specflow-runtime/src/features/*/demo` serves.';

  return [
    {
      actionId: '00000000-0000-4000-8000-000000000041',
      ordinal: 1,
      revision: 1,
      state: 'failed',
      title: { text: 'Edit', complete: true },
      operation: 'edit',
      subject: longPath,
      input: fixtureContentRef(
        JSON.stringify({
          file_path: `${worktree}/${longPath}`,
          old_string: before,
          new_string: `${before} Project mode serves the same routes from the feature modules.`,
        }),
      ),
      output: fixtureContentRef(
        '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>',
      ),
      error: {
        code: 'TOOL_FAILED',
        message: 'File has not been read yet. Read it first before writing to it.',
      },
      createdAt: '2026-11-25T12:08:21.000Z',
      updatedAt: '2026-11-25T12:08:21.010Z',
    },
  ];
}
