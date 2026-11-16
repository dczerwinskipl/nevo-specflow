import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { CloseErrorSchema } from './close';

describe('Close refusal contract', () => {
  it('names the repository preconditions of a CLOSE_PREFLIGHT refusal', () => {
    const refusal = {
      code: 'CLOSE_PREFLIGHT',
      error: 'CLOSE_PREFLIGHT',
      repository: [
        { kind: 'uncommitted-changes', checkout: 'specification', paths: ['specs/a.md'], count: 3 },
        { kind: 'integration-target-missing' },
        { kind: 'integration-target-branch', expectedBranch: 'main', branch: 'feature' },
        { kind: 'git-operation-in-progress', checkout: 'integration-target' },
        { kind: 'branch-detached', checkout: 'specification' },
      ],
    };

    expect(Value.Check(CloseErrorSchema, refusal)).toBe(true);
    expect(
      Value.Check(CloseErrorSchema, {
        ...refusal,
        repository: [{ kind: 'uncommitted-changes', checkout: 'elsewhere', paths: [], count: 1 }],
      }),
    ).toBe(false);
    expect(
      Value.Check(CloseErrorSchema, {
        ...refusal,
        repository: [{ kind: 'integration-target-missing', message: 'server text' }],
      }),
    ).toBe(false);
  });
});
