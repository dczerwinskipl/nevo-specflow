import type { ConversationEntry } from '@nevo/specflow-contracts/sessions';
import { describe, expect, it } from 'vitest';
import { transcriptItems, type TranscriptItem } from './transcriptItems';

let ordinal = 0;
const entry = (
  turnId: string,
  kind: ConversationEntry['kind'],
  extra: Partial<ConversationEntry> = {},
): ConversationEntry => {
  ordinal += 1;

  return {
    id: `e${ordinal}`,
    ordinal,
    revision: 1,
    turnId,
    kind,
    text: { text: kind, complete: true },
    createdAt: '2026-11-02T10:00:00Z',
    ...extra,
  };
};

const said = (text: string) => ({ text: { text, complete: true as const } });

/** A readable outline: one token per item. */
const shape = (items: TranscriptItem[]) =>
  items.map((item) => {
    switch (item.type) {
      case 'agent':
        return 'agent';
      case 'brief':
        return item.origin.continuation ? 'brief(resumed)' : 'brief';
      case 'stage':
        return `stage(${String(item.commentary.length)}c${
          item.block ? `+${String(item.block.actionCount)}w${item.block.live ? ':live' : ''}` : ''
        })`;
      case 'outcome':
        return `outcome(${item.outcome})`;
      default:
        return item.entry.notice ? `notice(${item.entry.notice.severity})` : item.entry.kind;
    }
  });

const origin = (continuation?: true) => ({
  kind: 'specflow-step-brief' as const,
  specId: 'spec',
  step: { id: 'design', title: 'Design the solution' },
  attempt: 1,
  ...(continuation ? { continuation } : {}),
});

describe('transcriptItems', () => {
  it('names the agent once per Turn and groups Commentary with the tool Work right after it', () => {
    const entries = [
      entry('a', 'request', { origin: origin() }),
      entry('a', 'commentary'),
      entry('a', 'work-summary'),
      entry('a', 'work-summary'),
      entry('a', 'commentary'),
      entry('a', 'commentary'),
      entry('a', 'work-summary'),
      entry('a', 'answer'),
      entry('a', 'outcome', said('completed')),
    ];

    expect(shape(transcriptItems(entries, { hasOlder: false }))).toEqual([
      'brief',
      'agent',
      'stage(1c+2w)',
      'stage(2c+1w)',
      'answer',
    ]);
  });

  it("gives each stage its own share of the Turn's digest", () => {
    const items = transcriptItems(
      [
        entry('a', 'commentary'),
        entry('a', 'work-summary', { digest: { opened: { read: 1 } } }),
        entry('a', 'work-summary', { digest: { opened: { read: 2, edit: 1 } } }),
        entry('a', 'commentary'),
        entry('a', 'work-summary', {
          digest: { opened: { read: 2, edit: 4 }, failed: { edit: 2 } },
        }),
      ],
      { hasOlder: false },
    );
    const stages = items.filter((item) => item.type === 'stage');

    expect(stages.map((stage) => stage.block?.digest)).toEqual([
      { opened: { read: 2, edit: 1 } },
      { opened: { edit: 3 }, failed: { edit: 2 } },
    ]);
  });

  it('counts the first stage of a Turn that may continue on an older page as a lower bound', () => {
    const items = transcriptItems(
      [entry('a', 'work-summary', { digest: { opened: { read: 9 } } }), entry('a', 'answer')],
      { hasOlder: true },
    );

    expect(items.find((item) => item.type === 'stage')).toMatchObject({
      block: { partial: true, actionCount: 1 },
    });
    expect(items.find((item) => item.type === 'stage')?.block?.digest).toBeUndefined();
  });

  it("ends a Turn that did not complete with one outcome event carrying SpecFlow's notices", () => {
    const entries = [
      entry('a', 'request'),
      entry('a', 'work-summary', { digest: { opened: { edit: 2 } } }),
      entry('a', 'commentary', { ...said('Stopped Claude.'), notice: { severity: 'error' } }),
      entry('a', 'commentary', { ...said('Approved by allowlist.'), notice: { severity: 'info' } }),
      entry('a', 'outcome', {
        ...said('interrupted'),
        error: { code: 'PROCESS_STOPPED', message: 'Stopped.' },
      }),
      entry('b', 'request'),
      entry('b', 'outcome', said('failed')),
    ];
    const items = transcriptItems(entries, { hasOlder: false });

    expect(shape(items)).toEqual([
      'request',
      'agent',
      'stage(0c+1w)',
      'notice(info)',
      'outcome(interrupted)',
      'request',
      'outcome(failed)',
    ]);
    expect(items[4]).toMatchObject({
      notices: ['Stopped Claude.'],
      workspaceMayHaveChanged: true,
      error: { code: 'PROCESS_STOPPED' },
    });
    expect(items[6]).toMatchObject({ notices: [], workspaceMayHaveChanged: false });
  });

  it('keeps a notice of a Turn that completed as its own row', () => {
    const entries = [
      entry('a', 'commentary', { ...said('Policy note.'), notice: { severity: 'warning' } }),
      entry('a', 'answer'),
      entry('a', 'outcome', said('completed')),
    ];

    expect(shape(transcriptItems(entries, { hasOlder: false }))).toEqual([
      'notice(warning)',
      'agent',
      'answer',
    ]);
  });

  it('tells a resumed Turn of the same attempt from its start', () => {
    const entries = [
      entry('a', 'request', { origin: origin() }),
      entry('a', 'outcome', said('interrupted')),
      entry('b', 'request', { origin: origin(true) }),
      entry('b', 'commentary'),
    ];

    expect(shape(transcriptItems(entries, { hasOlder: false }))).toEqual([
      'brief',
      'outcome(interrupted)',
      'brief(resumed)',
      'agent',
      'stage(1c)',
    ]);
  });

  it('puts the live line on the last stage, or before a streaming answer', () => {
    const activeTurn = { turnId: 'b', state: 'active' as const, revision: 1, startedAt: 'x' };
    const working = [entry('b', 'request'), entry('b', 'commentary'), entry('b', 'work-summary')];

    expect(shape(transcriptItems(working, { hasOlder: false, activeTurn }))).toEqual([
      'request',
      'agent',
      'stage(1c+1w:live)',
    ]);
    expect(
      shape(
        transcriptItems([...working, entry('b', 'answer')], {
          hasOlder: false,
          activeTurn,
          currentActivity: { kind: 'responding', turnId: 'b', label: 'Responding' },
        }),
      ),
    ).toEqual(['request', 'agent', 'stage(1c+1w)', 'stage(0c+0w:live)', 'answer']);
  });

  it('shows the live line for an active Turn that has not written anything yet', () => {
    const activeTurn = { turnId: 'b', state: 'active' as const, revision: 1, startedAt: 'x' };

    expect(
      shape(transcriptItems([entry('b', 'request')], { hasOlder: false, activeTurn })),
    ).toEqual(['request', 'agent', 'stage(0c+0w:live)']);
    expect(shape(transcriptItems([], { hasOlder: true, activeTurn }))).toEqual([
      'agent',
      'stage(0c+0w:live)',
    ]);
  });
});
