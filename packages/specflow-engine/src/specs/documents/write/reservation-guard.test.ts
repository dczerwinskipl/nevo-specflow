import { describe, expect, it } from 'vitest';

import { DOCUMENT_BATCH_STATES } from '../changes/journal/stages';
import { assertNoClaimedBatchOverlap, type BatchPathView } from './reservation-guard';

const WORKSPACE = 'w-1';
const batch = (
  state: BatchPathView['state'],
  paths: string[],
  workspaceId = WORKSPACE,
): BatchPathView => ({ batchId: 'b-1', workspaceId, state, paths: new Set(paths) });

function refusal(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe('assertNoClaimedBatchOverlap', () => {
  it('refuses an overlap with a committing batch as commit-in-progress', () => {
    const error = refusal(() =>
      assertNoClaimedBatchOverlap(WORKSPACE, ['a.md', 'b.md'], [batch('committing', ['b.md'])]),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'commit-in-progress' } });
  });

  it('refuses an overlap with a batch that needs recovery as recovery-required', () => {
    const error = refusal(() =>
      assertNoClaimedBatchOverlap(WORKSPACE, ['a.md'], [batch('recovery-required', ['a.md'])]),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'recovery-required' } });
  });

  it('lets a request through that only meets unclaimed, failed, finished or foreign batches', () => {
    for (const state of DOCUMENT_BATCH_STATES) {
      if (state === 'committing' || state === 'recovery-required') {
        continue;
      }

      expect(
        refusal(() => assertNoClaimedBatchOverlap(WORKSPACE, ['a.md'], [batch(state, ['a.md'])])),
      ).toBe(undefined);
    }

    expect(
      refusal(() =>
        assertNoClaimedBatchOverlap(WORKSPACE, ['a.md'], [batch('committing', ['a.md'], 'w-2')]),
      ),
    ).toBe(undefined);
    expect(
      refusal(() =>
        assertNoClaimedBatchOverlap(WORKSPACE, ['c.md'], [batch('committing', ['a.md'])]),
      ),
    ).toBe(undefined);
  });

  it('compares paths case-insensitively, like the barrier check', () => {
    const error = refusal(() =>
      assertNoClaimedBatchOverlap(WORKSPACE, ['Specs/A.md'], [batch('committing', ['specs/a.md'])]),
    );
    expect(error).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'commit-in-progress' } });
  });
});
