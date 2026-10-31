import { describe, expect, it } from 'vitest';
import type { ToolActionSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  START_OF_TURN_CHAPTER_ID,
  TOOL_BURST_MIN_SIZE,
  buildWorkChapters,
  filterWorkChapters,
  formatWorkDuration,
  groupChapterEntries,
  mergeToolActions,
  mergeWorkItems,
  workItemDurationMs,
} from './workGrouping';

let seq = 0;
function work(overrides: Partial<WorkSummary> & { kind: WorkSummary['kind'] }): WorkSummary {
  seq += 1;

  return {
    workId: `work-${seq}`,
    ordinal: seq,
    revision: 1,
    state: 'completed',
    title: { text: overrides.kind + ' ' + seq, complete: true },
    createdAt: '2026-10-30T10:00:00Z',
    updatedAt: '2026-10-30T10:00:00Z',
    ...overrides,
  };
}

function commentary(text: string) {
  return work({ kind: 'commentary', title: { text, complete: true } });
}

function tool(overrides: Partial<WorkSummary> = {}) {
  return work({ kind: 'tool', ...overrides });
}

describe('buildWorkChapters', () => {
  it('puts leading operations before any Commentary into the Start of Turn chapter', () => {
    const read = tool({ title: { text: 'Read file a.ts', complete: true } });
    const chapters = buildWorkChapters([read]);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.id).toBe(START_OF_TURN_CHAPTER_ID);
    expect(chapters[0]!.commentary).toBeUndefined();
    expect(chapters[0]!.items).toEqual([read]);
  });

  it('omits an empty Start of Turn chapter when the Turn opens directly with Commentary', () => {
    const intro = commentary('Checking the admission path…');
    const chapters = buildWorkChapters([intro]);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.commentary).toBe(intro);
  });

  it('starts a new chapter at each Commentary and groups following items under it', () => {
    const c1 = commentary('Checking the implementation…');
    const read = tool();
    const c2 = commentary('Fixing the assertion…');
    const secondTool = tool();
    const chapters = buildWorkChapters([c1, read, c2, secondTool]);

    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.commentary).toBe(c1);
    expect(chapters[0]!.items).toEqual([read]);
    expect(chapters[1]!.commentary).toBe(c2);
    expect(chapters[1]!.items).toEqual([secondTool]);
  });

  it('keeps a trailing Commentary chapter even with no operations after it yet', () => {
    const c1 = commentary('Running the latest check…');
    const chapters = buildWorkChapters([tool(), c1]);

    expect(chapters).toHaveLength(2);
    expect(chapters[1]!.commentary).toBe(c1);
    expect(chapters[1]!.items).toEqual([]);
  });

  it('never mutates an already-pushed chapter when later items are appended', () => {
    const c1 = commentary('Phase one…');
    const firstTool = tool();
    const secondTool = tool();
    const chapters = buildWorkChapters([c1, firstTool]);
    const chaptersAfterMore = buildWorkChapters([c1, firstTool, secondTool]);

    expect(chapters[0]!.items).toEqual([firstTool]);
    expect(chaptersAfterMore[0]!.items).toEqual([firstTool, secondTool]);
  });
});

describe('filterWorkChapters', () => {
  const c1 = commentary('Checking the implementation…');
  const read = tool({ title: { text: 'Read file admission.mjs', complete: true } });
  const reasoning = work({
    kind: 'reasoning',
    title: { text: 'Weighing two approaches', complete: true },
  });
  const failedCommand = tool({
    state: 'failed',
    title: { text: 'Run command pnpm test', complete: true },
  });
  const chapters = buildWorkChapters([c1, read, reasoning, failedCommand]);

  it('keeps every chapter unfiltered when kind is "all" and search is empty', () => {
    const visible = filterWorkChapters(chapters, { kind: 'all', search: '' });

    expect(visible).toHaveLength(1);
    expect(visible[0]!.items).toEqual([read, reasoning, failedCommand]);
  });

  it('preserves the parent Commentary when a "tool" filter narrows the children', () => {
    const visible = filterWorkChapters(chapters, { kind: 'tool', search: '' });

    expect(visible).toHaveLength(1);
    expect(visible[0]!.commentary).toBe(c1);
    expect(visible[0]!.items).toEqual([read, failedCommand]);
  });

  it('drops a chapter entirely once an active kind filter leaves it with no matches', () => {
    const visible = filterWorkChapters(chapters, { kind: 'interaction', search: '' });

    expect(visible).toHaveLength(0);
  });

  it('switches to a Commentary-only table of contents, with no children, for kind "commentary"', () => {
    const visible = filterWorkChapters(chapters, { kind: 'commentary', search: '' });

    expect(visible).toHaveLength(1);
    expect(visible[0]!.commentary).toBe(c1);
    expect(visible[0]!.items).toEqual([]);
  });

  it('search matches a child title case-insensitively while keeping its Commentary context', () => {
    const visible = filterWorkChapters(chapters, { kind: 'all', search: 'ADMISSION' });

    expect(visible).toHaveLength(1);
    expect(visible[0]!.commentary).toBe(c1);
    expect(visible[0]!.items).toEqual([read]);
  });

  it('combines kind and search', () => {
    const visible = filterWorkChapters(chapters, { kind: 'tool', search: 'pnpm' });

    expect(visible[0]!.items).toEqual([failedCommand]);
  });

  it('does not show an empty trailing chapter once a filter is active', () => {
    const trailing = buildWorkChapters([c1, read, commentary('Next phase, nothing yet…')]);
    const visible = filterWorkChapters(trailing, { kind: 'all', search: 'nothing-matches-this' });

    expect(visible).toHaveLength(0);
  });
});

describe('groupChapterEntries', () => {
  it(`compacts a run of ${TOOL_BURST_MIN_SIZE}+ consecutive completed tool items into one burst`, () => {
    const items = Array.from({ length: TOOL_BURST_MIN_SIZE }, () => tool());
    const entries = groupChapterEntries(items);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ type: 'burst', items });
  });

  it('keeps a single completed tool item as its own row, never a one-item burst', () => {
    const only = tool();
    const entries = groupChapterEntries([only]);

    expect(entries).toEqual([{ type: 'single', item: only }]);
  });

  it(`never wraps a short run (below ${TOOL_BURST_MIN_SIZE} items) in a burst — each stays its own row`, () => {
    const items = Array.from({ length: TOOL_BURST_MIN_SIZE - 1 }, () => tool());
    const entries = groupChapterEntries(items);

    expect(entries).toEqual(items.map((item) => ({ type: 'single', item })));
  });

  it('only groups a long separate run, leaving a shorter run elsewhere as individual rows', () => {
    const short = [tool(), tool()];
    const boundary = work({ kind: 'reasoning' });
    const long = Array.from({ length: TOOL_BURST_MIN_SIZE }, () => tool());
    const entries = groupChapterEntries([...short, boundary, ...long]);

    expect(entries).toEqual([
      { type: 'single', item: short[0] },
      { type: 'single', item: short[1] },
      { type: 'single', item: boundary },
      { type: 'burst', items: long },
    ]);
  });

  it('never merges a failed tool into a burst — it always stays isolated', () => {
    const ok1 = tool();
    const failed = tool({ state: 'failed' });
    const ok2 = tool();
    const entries = groupChapterEntries([ok1, failed, ok2]);

    expect(entries).toEqual([
      { type: 'single', item: ok1 },
      { type: 'single', item: failed },
      { type: 'single', item: ok2 },
    ]);
  });

  it('never merges Reasoning or Interaction into a tool burst, and they break a run', () => {
    const ok1 = tool();
    const reasoning = work({ kind: 'reasoning' });
    const ok2 = tool();
    const entries = groupChapterEntries([ok1, reasoning, ok2]);

    expect(entries).toEqual([
      { type: 'single', item: ok1 },
      { type: 'single', item: reasoning },
      { type: 'single', item: ok2 },
    ]);
  });

  it('isolates an active/queued tool instead of merging it with completed neighbours', () => {
    const ok1 = tool();
    const active = tool({ state: 'active' });
    const entries = groupChapterEntries([ok1, active]);

    expect(entries).toEqual([
      { type: 'single', item: ok1 },
      { type: 'single', item: active },
    ]);
  });
});

describe('workItemDurationMs', () => {
  it('computes elapsed time for a settled item from its own createdAt/updatedAt', () => {
    const item = tool({
      state: 'completed',
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.180Z',
    });

    expect(workItemDurationMs(item)).toBe(180);
  });

  it('is undefined for a still-running item — there is no final duration yet', () => {
    const item = tool({ state: 'active' });

    expect(workItemDurationMs(item)).toBeUndefined();
  });

  it('is undefined when updatedAt precedes createdAt (never a negative duration)', () => {
    const item = tool({
      state: 'completed',
      createdAt: '2026-10-30T10:00:01.000Z',
      updatedAt: '2026-10-30T10:00:00.000Z',
    });

    expect(workItemDurationMs(item)).toBeUndefined();
  });

  it('is undefined when createdAt equals updatedAt — never a fabricated "0 ms"', () => {
    const item = tool({
      state: 'completed',
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.000Z',
    });

    expect(workItemDurationMs(item)).toBeUndefined();
  });
});

describe('formatWorkDuration', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(formatWorkDuration(180, 'en')).toMatch(/180\s*ms/);
  });

  it('formats durations of a second or more in seconds', () => {
    expect(formatWorkDuration(8400, 'en')).toMatch(/8\.4\s*s/);
  });
});

describe('mergeWorkItems', () => {
  it('unions two pages and sorts ascending by ordinal', () => {
    const older = work({ kind: 'tool', ordinal: 1 });
    const newer = work({ kind: 'tool', ordinal: 2 });
    const merged = mergeWorkItems([newer], [older]);

    expect(merged).toEqual([older, newer]);
  });

  it('upserts by workId, keeping the higher revision', () => {
    const original = work({ kind: 'tool', workId: 'w1', ordinal: 1, revision: 1, state: 'active' });
    const settled = { ...original, revision: 2, state: 'completed' as const };
    const merged = mergeWorkItems([original], [settled]);

    expect(merged).toEqual([settled]);
  });

  it('never lets a stale/older-revision page overwrite an already-newer item', () => {
    const settled = work({ kind: 'tool', workId: 'w1', ordinal: 1, revision: 3 });
    const stale = { ...settled, revision: 1, state: 'active' as const };
    const merged = mergeWorkItems([settled], [stale]);

    expect(merged).toEqual([settled]);
  });
});

describe('mergeToolActions', () => {
  function action(overrides: Partial<ToolActionSummary> = {}): ToolActionSummary {
    seq += 1;

    return {
      actionId: `action-${seq}`,
      ordinal: seq,
      revision: 1,
      state: 'completed',
      title: { text: 'Action ' + seq, complete: true },
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:00Z',
      ...overrides,
    };
  }

  it('unions and sorts by ordinal, upserting by actionId/revision', () => {
    const a = action({ actionId: 'a', ordinal: 1, revision: 1 });
    const b = action({ actionId: 'b', ordinal: 2, revision: 1 });
    const updatedA = { ...a, revision: 2, state: 'failed' as const };
    const merged = mergeToolActions([a, b], [updatedA]);

    expect(merged).toEqual([updatedA, b]);
  });
});
