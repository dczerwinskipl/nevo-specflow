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
  partial: false,
  ...overrides,
});

describe('describeWorkBlock', () => {
  it('counts work by kind, workspace changes first, with Polish plurals', () => {
    // A non-breaking space between each count and its own word (not the ` · ` segment
    // separator), so a narrow mobile column can never wrap a number away from its noun (owner
    // review, round four, live on 390px: "· 2 / odczyty" split mid-pair).
    expect(
      describeWorkBlock(block({ digest: { done: { read: 4, write: 50, command: 3 } } }), pl)
        .summary,
    ).toBe('50 zapisów · 3 polecenia · 4 odczyty');
  });

  it('caps the breakdown at four kinds and says there is more', () => {
    expect(
      describeWorkBlock(
        block({ digest: { done: { edit: 1, write: 2, command: 3, test: 1, read: 5, web: 1 } } }),
        pl,
      ).summary,
    ).toBe('1 edycja · 2 zapisy · 3 polecenia · 1 uruchomienie testów i więcej');
  });

  it('lifts failed actions onto their own line', () => {
    expect(
      describeWorkBlock(block({ digest: { done: { read: 1 }, failed: { test: 1 } } }), en),
    ).toMatchObject({ summary: '1 read', failed: 'Failed: 1 test run' });
  });

  it('falls back to an honest action count for real data, a lower bound when partial', () => {
    expect(describeWorkBlock(block({ actionCount: 12 }), pl).summary).toBe('12 działań narzędzia');
    expect(describeWorkBlock(block({ actionCount: 3, partial: true }), pl).summary).toBe(
      'co najmniej 3 działania narzędzia',
    );
  });

  it('owns the Turn outcome only when it is not a plain completion', () => {
    expect(describeWorkBlock(block({ actionCount: 2, outcome: 'completed' }), pl).outcome).toBe(
      undefined,
    );
    expect(
      describeWorkBlock(block({ actionCount: 2, outcome: 'interrupted' }), pl).outcome,
    ).toEqual({ text: 'Tura przerwana', tone: 'attention' });
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
