import { describe, expect, it } from 'vitest';

import { normalizeCreateClientIntent } from '../src/specs/create/intent';

const intent = (branch: string) =>
  normalizeCreateClientIntent({
    archetype: { id: 'minimal', version: 1 },
    title: 'T',
    target: { kind: 'new-worktree', branch },
  });

describe('Create intent: branch override', () => {
  it('accepts a valid override and keeps it explicit', () => {
    expect(intent('feature/ok').target).toMatchObject({
      kind: 'new-worktree',
      branch: { kind: 'explicit', value: 'feature/ok' },
    });
  });

  it.each(['_x', 'zażółć', 'a#b', 'a..b', 'x.lock', '-x', 'a//b'])(
    'rejects %j with its own code before anything is reserved',
    (branch) => {
      expect(() => intent(branch)).toThrowError(
        expect.objectContaining({ code: 'BRANCH_NAME_INVALID' }),
      );
    },
  );

  it('leaves an omitted branch to the configured pattern', () => {
    expect(
      normalizeCreateClientIntent({
        archetype: { id: 'minimal', version: 1 },
        title: 'T',
        target: { kind: 'new-worktree' },
      }).target,
    ).toMatchObject({ branch: { kind: 'omitted' } });
  });
});
