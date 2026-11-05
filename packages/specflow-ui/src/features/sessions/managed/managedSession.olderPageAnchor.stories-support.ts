import { expect, waitFor, within } from 'storybook/test';
import type {
  ActionPage,
  ToolActionSummary,
  WorkPage,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { fixtureSessionId } from './managedSession.stories-support';
import {
  createWorkInspectorFixtureApi,
  fixtureContentPage,
  fixtureContentRef,
  workInspectorTurnId,
} from './managedSession.workInspector.stories-support';

/**
 * Fixtures and geometry for the plays that check an older page lands under the reader
 * (`WorkInspector.olderPageAnchor.stories.tsx`): explicit Work/ToolAction pages whose older
 * requests (and selected tool contents) wait until the play releases them, so the play can change
 * the list while a request is in flight.
 */

/** Requests waiting on it resolve only when the play releases them. */
export function createGate() {
  let waiting: (() => void)[] = [];

  return {
    wait: () => new Promise<void>((resolve) => waiting.push(resolve)),
    pending: () => waiting.length,
    release() {
      const ready = waiting;
      waiting = [];
      ready.forEach((resolve) => resolve());
    },
  };
}

let seq = 0;
const timestamps = { createdAt: '2026-10-30T10:00:00Z', updatedAt: '2026-10-30T10:00:00Z' };

/** A completed Work item of this Turn, ordered after every one made before it. */
export function workItem(kind: WorkSummary['kind'], text: string, extra?: Partial<WorkSummary>) {
  seq += 1;

  return {
    workId: `${workInspectorTurnId}-anchor-${seq}`,
    ordinal: seq,
    revision: 1,
    state: 'completed',
    kind,
    title: { text, complete: true },
    ...timestamps,
    ...extra,
  } satisfies WorkSummary;
}

/** `count` rows in runs of two tools and one interaction, so no run is long enough to group. */
function rows(prefix: string, from: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const n = from + index;

    return index % 3 === 2
      ? workItem('interaction', `${prefix} confirm keep-${n}`)
      : workItem(
          'tool',
          index % 3 === 0 ? `${prefix} read keep-${n}.ts` : `${prefix} search drop-${n}`,
        );
  });
}

/** The row the plays read from: the first one of the tail window. */
export const READ_ROW = 'Tail read keep-0.ts';
/** The tool group under it: six adjacent completed tools, one collapsed row until expanded. */
export const GROUP_TRIGGER = '6 działań narzędzia';
export const OLDER_ROW = 'Older read keep-0.ts';

/** Thinking long enough to be clamped behind "Show more" under the read row. */
const LONG_THINKING = `Tail thinking keep: ${'Weighing whether the admission check or the revision reload is at fault. '.repeat(12)}`;

/** One older page, then a tail window opening with the read row, long Thinking, the group, and
 * more rows. */
export function anchorWorkPages(): WorkSummary[][] {
  const older = rows('Older', 0, 30);
  const tail = [
    workItem('tool', READ_ROW),
    workItem('interaction', 'Tail confirm keep-1'),
    workItem('reasoning', LONG_THINKING),
    ...Array.from({ length: 6 }, (_, index) =>
      workItem('tool', `Tail scan drop-module-${index}.ts`),
    ),
    workItem('interaction', 'Tail confirm keep-8'),
    ...rows('Tail', 9, 45),
  ];

  return [older, tail];
}

function workPage(pages: WorkSummary[][], index: number): WorkPage {
  const hasOlder = index > 0;

  return {
    sessionId: fixtureSessionId,
    eventSeq: 1,
    turn: {
      turnId: workInspectorTurnId,
      state: 'active',
      revision: 1,
      ...timestamps,
      userMessage: { text: 'Investigate why workflow admission is failing.', complete: true },
    },
    items: pages[index] ?? [],
    history: { hasOlder, before: hasOlder ? String(index - 1) : undefined },
  };
}

function actionPage(workId: string, pages: ToolActionSummary[][], index: number): ActionPage {
  const hasOlder = index > 0;

  return {
    sessionId: fixtureSessionId,
    eventSeq: 1,
    workId,
    items: pages[index] ?? [],
    history: { hasOlder, before: hasOlder ? String(index - 1) : undefined },
  };
}

/**
 * Serves `workPages` (and `actionPages` for every Work) newest first; an older page waits on
 * `older`, a content in `heldContent` waits on `content`. `failFirstOlder` rejects the first older
 * Work request, leaving the screen on its manual Retry.
 */
export function heldHistoryApi({
  workPages,
  actionPages = [],
  heldContent = new Set<string>(),
  failFirstOlder = false,
}: {
  workPages: WorkSummary[][];
  actionPages?: ToolActionSummary[][];
  heldContent?: ReadonlySet<string>;
  failFirstOlder?: boolean;
}) {
  const older = createGate();
  const content = createGate();
  let olderCalls = 0;
  const base = createWorkInspectorFixtureApi(workPages.flat());
  const api: ManagedSessionsApi = {
    ...base,
    work: async (_sessionId, _turnId, before) => {
      if (before === undefined) {
        return workPage(workPages, workPages.length - 1);
      }

      olderCalls += 1;
      if (failFirstOlder && olderCalls === 1) {
        throw new Error('Older Work unavailable');
      }

      await older.wait();

      return workPage(workPages, Number(before));
    },
    actions: async (_sessionId, workId, before) => {
      if (before === undefined) {
        return actionPage(workId, actionPages, actionPages.length - 1);
      }

      await older.wait();

      return actionPage(workId, actionPages, Number(before));
    },
    content: async (_sessionId, ref, offset) => {
      if (heldContent.has(ref.contentId)) {
        await content.wait();
      }

      return fixtureContentPage(ref, offset);
    },
  };

  return { api, older, content };
}

let actionSeq = 0;

/** A ToolAction with short JSON parameters and a `lines`-line response. */
export function toolAction(text: string, lines = 3): ToolActionSummary {
  actionSeq += 1;

  return {
    actionId: `anchor-action-${actionSeq}`,
    ordinal: actionSeq,
    revision: 1,
    state: 'completed',
    title: { text, complete: true },
    input: fixtureContentRef(JSON.stringify({ file_path: `src/${actionSeq}.ts` }, null, 2)),
    output: fixtureContentRef(
      Array.from({ length: lines }, (_, line) => `${text} output line ${line + 1}`).join('\n'),
    ),
    ...timestamps,
  };
}

export const workItemWithActions = (text: string, workId: string, actionCount: number) =>
  workItem('tool', text, { workId, actionCount });

/** The Secondary's scroller (the Work or Actions screen showing). */
export function historyScroller(canvasElement: HTMLElement) {
  const node = canvasElement.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"] .scroll-area-viewport',
  );
  if (!node) {
    throw new Error('Expected the Secondary history scroller to be mounted.');
  }

  return node;
}

/** The row (its Timeline item) whose title is `text`, looked up afresh: a remount replaces it. */
function rowOf(scroller: HTMLElement, text: string) {
  const row = within(scroller).getByText(text).closest('li');
  if (!row) {
    throw new Error(`"${text}" is not a history row.`);
  }

  return row;
}

export const rowOffset = (scroller: HTMLElement, text: string) =>
  rowOf(scroller, text).getBoundingClientRect().top - scroller.getBoundingClientRect().top;

/** The title of the first row still visible below the scroller's top edge. */
export function firstVisibleRowTitle(scroller: HTMLElement, titles: readonly string[]) {
  const top = scroller.getBoundingClientRect().top;
  const title = titles.find((text) => {
    const row = within(scroller).queryByText(text)?.closest('li');

    return row && row.getBoundingClientRect().bottom > top + 1;
  });
  if (!title) {
    throw new Error('Expected a visible history row.');
  }

  return title;
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits until the scroller's content has kept the same height and position for several frames
 * (a disclosure's height animation, late content, a re-render after a filter). */
export async function layoutSettled(scroller: HTMLElement) {
  let stable = 0;
  let last = '';
  for (let frames = 0; frames < 300 && stable < 6; frames += 1) {
    await frame();
    const now = `${scroller.scrollHeight}:${scroller.scrollTop}`;
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

/** The older page landed under the reader: the row they were reading did not move on screen. */
export async function expectRowStays(
  scroller: HTMLElement,
  text: string,
  offset: number,
  label: string,
) {
  await waitFor(() => within(scroller).getByText(text));
  await layoutSettled(scroller);
  const now = rowOffset(scroller, text);
  await expect(
    Math.abs(now - offset),
    `${label}: "${text}" was at ${Math.round(offset)}px and is now at ${Math.round(now)}px`,
  ).toBeLessThanOrEqual(2);
}
