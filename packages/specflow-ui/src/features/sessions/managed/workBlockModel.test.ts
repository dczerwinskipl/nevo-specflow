import type { ConversationEntry } from '@nevo/specflow-contracts/sessions';
import { describe, expect, it } from 'vitest';
import { conversationItems, liveActivity } from './workBlockModel';

let ordinal = 0;
const entry = (
  turnId: string,
  kind: ConversationEntry['kind'],
  text: string = kind,
): ConversationEntry => {
  ordinal += 1;

  return {
    id: `e${ordinal}`,
    ordinal,
    revision: 1,
    turnId,
    kind,
    text: { text, complete: true },
    createdAt: '2026-11-02T10:00:00Z',
  };
};

const shape = (items: ReturnType<typeof conversationItems>) =>
  items.map((item) =>
    item.type === 'work'
      ? `work(${item.block.turnId}:${item.block.actionCount}${item.block.live ? ':live' : ''}${item.block.outcome ? ':' + item.block.outcome : ''})`
      : item.entry.kind,
  );

describe('conversationItems', () => {
  it('folds every work-summary of a settled Turn into one block at its last work position', () => {
    const entries = [
      entry('a', 'request'),
      entry('a', 'work-summary', 'Read file a.ts'),
      entry('a', 'commentary'),
      entry('a', 'work-summary', 'Run command pnpm test'),
      entry('a', 'answer'),
    ];

    expect(shape(conversationItems(entries, { hasOlder: false }))).toEqual([
      'request',
      'commentary',
      'work(a:2)',
      'answer',
    ]);
  });

  it('shows a Turn outcome once: in the block when the Turn has work, as its own row otherwise', () => {
    const entries = [
      entry('a', 'request'),
      entry('a', 'work-summary'),
      entry('a', 'outcome', 'interrupted'),
      entry('b', 'request'),
      entry('b', 'outcome', 'failed'),
    ];

    expect(shape(conversationItems(entries, { hasOlder: false }))).toEqual([
      'request',
      'work(a:1:interrupted)',
      'request',
      'outcome',
    ]);
  });

  it('puts the live block at the end of the active Turn, before a streaming answer', () => {
    const activeTurn = { turnId: 'b', state: 'active' as const, revision: 1, startedAt: 'x' };
    const entries = [entry('b', 'request'), entry('b', 'work-summary'), entry('b', 'answer')];

    expect(
      shape(
        conversationItems(entries, {
          hasOlder: false,
          activeTurn,
          currentActivity: { kind: 'responding', turnId: 'b', label: 'Responding' },
        }),
      ),
    ).toEqual(['request', 'work(b:1:live)', 'answer']);
  });

  it('shows the live block for an active Turn that has not opened any tool work yet', () => {
    const activeTurn = { turnId: 'b', state: 'active' as const, revision: 1, startedAt: 'x' };

    expect(
      shape(conversationItems([entry('b', 'request')], { hasOlder: false, activeTurn })),
    ).toEqual(['request', 'work(b:0:live)']);
  });

  it('marks the count as a lower bound when the Turn may continue into older history', () => {
    const items = conversationItems([entry('a', 'work-summary'), entry('a', 'answer')], {
      hasOlder: true,
    });

    expect(items[0]).toMatchObject({ type: 'work', block: { partial: true, actionCount: 1 } });
  });
});

describe('liveActivity', () => {
  const activeTurn = { turnId: 't', state: 'active' as const, revision: 1, startedAt: 'x' };

  it('prefers the runtime current activity and leaves attention to the interaction prompt', () => {
    expect(liveActivity(activeTurn, { kind: 'tool', turnId: 't', label: 'Read a.ts' })).toEqual({
      kind: 'tool',
      label: 'Read a.ts',
    });
    expect(liveActivity(activeTurn, { kind: 'attention', turnId: 't', label: 'x' })).toBe(
      undefined,
    );
  });

  it('falls back to the Turn state and is absent without an active Turn', () => {
    expect(liveActivity({ ...activeTurn, state: 'cancelling' }, undefined)).toEqual({
      kind: 'cancelling',
    });
    expect(liveActivity({ ...activeTurn, state: 'waitingForUser' }, undefined)).toBe(undefined);
    expect(liveActivity(undefined, undefined)).toBe(undefined);
  });
});
