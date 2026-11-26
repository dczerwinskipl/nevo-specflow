import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n';
import { describeWorkBlock } from './workDigest';
import type { WorkBlockModel } from './workBlockModel';

const pl = createSpecFlowI18n('pl').t;
const en = createSpecFlowI18n('en').t;

const block = (overrides: Partial<WorkBlockModel>): WorkBlockModel => ({
  turnId: 't',
  id: 'w',
  actionCount: 0,
  workIds: [],
  partial: false,
  ...overrides,
});

describe('describeWorkBlock', () => {
  it('counts work by kind, workspace changes first, with Polish plurals', () => {
    // A non-breaking space between each count and its own word (not the ` · ` segment
    // separator), so a narrow mobile column can never wrap a number away from its noun (owner
    // review, round four, live on 390px: "· 2 / odczyty" split mid-pair).
    expect(
      describeWorkBlock(block({ digest: { opened: { read: 4, write: 50, command: 3 } } }), pl)
        .summary,
    ).toBe('50 zapisów · 3 polecenia · 4 odczyty');
  });

  it('caps the breakdown at four kinds and says there is more', () => {
    expect(
      describeWorkBlock(
        block({ digest: { opened: { edit: 1, write: 2, command: 3, test: 1, read: 5, web: 1 } } }),
        pl,
      ).summary,
    ).toBe('1 edycja · 2 zapisy · 3 polecenia · 1 uruchomienie testów i więcej');
  });

  it('titles the row by the tool actions, the kinds under it only when there are several', () => {
    expect(
      describeWorkBlock(block({ digest: { opened: { command: 5, read: 1 } } }), en),
    ).toMatchObject({
      title: '6 tool actions',
      detail: '5 commands · 1 read',
      operation: 'command',
    });
    const single = describeWorkBlock(block({ digest: { opened: { command: 2 } } }), en);
    expect(single).toMatchObject({ title: '2 commands', operation: 'command' });
    expect(single.detail).toBeUndefined();
    // Without a digest: the honest loaded count, by no particular kind.
    expect(describeWorkBlock(block({ actionCount: 3 }), en)).toMatchObject({
      title: '3 tool actions',
      operation: 'other',
    });
  });

  it('lifts failed actions onto their own line', () => {
    expect(
      describeWorkBlock(block({ digest: { opened: { read: 1 }, failed: { test: 1 } } }), en),
    ).toMatchObject({ summary: '1 read', failed: 'Failed: 1 test run' });
  });

  it('falls back to an honest action count for real data, a lower bound when partial', () => {
    expect(describeWorkBlock(block({ actionCount: 12 }), pl).summary).toBe('12 działań narzędzia');
    expect(describeWorkBlock(block({ actionCount: 3, partial: true }), pl).summary).toBe(
      'co najmniej 3 działania narzędzia',
    );
  });

  it('describes the live activity from its kind, the tool by its runtime label verbatim', () => {
    // No "Wykonuje:" prefix for `tool`: the runtime's own activity label is already a complete,
    // self-describing sentence (e.g. "Bash: pnpm test", "Searching repository…") in every real
    // fixture, so prefixing a verb produced a redundant "Wykonuje: Bash: ..." (owner review,
    // round two).
    expect(
      describeWorkBlock(block({ live: { kind: 'tool', label: 'Bash: pnpm test' } }), pl).live,
    ).toBe('Bash: pnpm test');
    expect(describeWorkBlock(block({ live: { kind: 'reasoning' } }), pl).live).toBe('Myśli…');
  });
});
