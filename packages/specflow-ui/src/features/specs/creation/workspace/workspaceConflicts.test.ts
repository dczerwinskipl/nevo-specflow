import { describe, expect, it } from 'vitest';
import { conflictsOfFailure } from './workspaceConflicts';

describe('conflictsOfFailure', () => {
  it('flags a typed slug that is taken, and says nothing about one the owner never typed', () => {
    expect(conflictsOfFailure({ kind: 'name-conflict' }, { slug: 'a-b', branch: '' })).toEqual({
      slug: { value: 'a-b' },
    });
    expect(conflictsOfFailure({ kind: 'name-conflict' }, { branch: '' })).toBeUndefined();
  });

  it('flags a typed branch that exists or is invalid, and clears the flag for a generated one', () => {
    expect(
      conflictsOfFailure({ kind: 'branch-exists', automatic: false }, { branch: 'feat/x' }),
    ).toEqual({ branch: { value: 'feat/x', reason: 'exists' } });
    expect(conflictsOfFailure({ kind: 'branch-invalid' }, { branch: 'a b' })).toEqual({
      branch: { value: 'a b', reason: 'invalid' },
    });
    expect(conflictsOfFailure({ kind: 'branch-exists', automatic: true }, { branch: '' })).toEqual({
      branch: undefined,
    });
  });

  it('flags a typed protected branch at its field; a generated name or a workspace is no field', () => {
    expect(
      conflictsOfFailure(
        { kind: 'branch-protected', cause: 'typed-branch' },
        { branch: 'release/x' },
      ),
    ).toEqual({ branch: { value: 'release/x', reason: 'protected' } });
    expect(
      conflictsOfFailure({ kind: 'branch-protected', cause: 'generated-branch' }, { branch: '' }),
    ).toBeUndefined();
    expect(
      conflictsOfFailure({ kind: 'branch-protected', cause: 'workspace' }, { branch: '' }),
    ).toBeUndefined();
  });

  it('ignores failures that concern no field', () => {
    expect(conflictsOfFailure({ kind: 'failed' }, { branch: 'x' })).toBeUndefined();
  });
});
