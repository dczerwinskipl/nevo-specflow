import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { CloseErrorSchema, ClosePreviewSchema } from './close';

const missingTarget = {
  kind: 'integration-target-missing',
  sourceCheckout: 'linked',
  candidates: [
    { branch: 'release/2026.11', facts: ['remote-default', 'started-from'], remote: 'origin' },
    { branch: 'develop', facts: ['primary-checkout'] },
  ],
  otherBranches: ['hotfix'],
  otherBranchCount: 1,
};

describe('Close refusal contract', () => {
  it('names the repository preconditions of a CLOSE_PREFLIGHT refusal', () => {
    const refusal = {
      code: 'CLOSE_PREFLIGHT',
      error: 'CLOSE_PREFLIGHT',
      repository: [
        {
          kind: 'uncommitted-changes',
          checkout: 'specification',
          checkoutPath: '/repo/.nevo/worktrees/nevo-1',
          paths: ['specs/a.md'],
          count: 3,
        },
        missingTarget,
        { kind: 'integration-target-branch', expectedBranch: 'main', branch: 'feature' },
        { kind: 'git-operation-in-progress', checkout: 'integration-target' },
        { kind: 'branch-detached', checkout: 'specification' },
      ],
    };

    expect(Value.Check(CloseErrorSchema, refusal)).toBe(true);
    expect(
      Value.Check(CloseErrorSchema, {
        ...refusal,
        repository: [
          {
            kind: 'uncommitted-changes',
            checkout: 'elsewhere',
            checkoutPath: '/repo',
            paths: [],
            count: 1,
          },
        ],
      }),
    ).toBe(false);
    expect(
      Value.Check(CloseErrorSchema, {
        ...refusal,
        repository: [{ ...missingTarget, message: 'server text' }],
      }),
    ).toBe(false);
  });

  it('accepts a missing integration branch with nothing to offer, and no candidate without facts', () => {
    const blocker = (value: object) =>
      Value.Check(CloseErrorSchema, {
        code: 'CLOSE_PREFLIGHT',
        error: 'CLOSE_PREFLIGHT',
        repository: [value],
      });

    expect(
      blocker({
        kind: 'integration-target-missing',
        sourceCheckout: 'primary',
        candidates: [],
        otherBranches: [],
        otherBranchCount: 0,
      }),
    ).toBe(true);
    expect(blocker({ ...missingTarget, candidates: [{ branch: 'develop', facts: [] }] })).toBe(
      false,
    );
    expect(
      blocker({ ...missingTarget, candidates: [{ branch: 'main', facts: ['default'] }] }),
    ).toBe(false);
    expect(blocker({ kind: 'integration-target-missing' })).toBe(false);
    expect(blocker({ ...missingTarget, kind: 'git-not-configured' })).toBe(false);
    // `remote` comes exactly with the remote-default fact.
    expect(
      blocker({
        ...missingTarget,
        candidates: [{ branch: 'develop', facts: ['primary-checkout'], remote: 'origin' }],
      }),
    ).toBe(false);
    expect(
      blocker({ ...missingTarget, candidates: [{ branch: 'main', facts: ['remote-default'] }] }),
    ).toBe(false);
    expect(blocker({ ...missingTarget, otherBranches: ['x'.repeat(256)] })).toBe(false);
  });
});

describe('Close preview contract', () => {
  const preview = {
    operationId: '00000000-0000-4000-8000-000000000003',
    specId: '00000000-0000-4000-8000-000000000001',
    kind: 'specification-close',
    location: 'active',
    integrationRequired: true,
  };

  it('carries the merge facts: source into target with the commits ahead, or why nothing merges', () => {
    expect(
      Value.Check(ClosePreviewSchema, {
        ...preview,
        merge: {
          status: 'integrates',
          sourceBranch: 'feature/nevo-1-sso',
          targetBranch: 'develop',
          commitsAhead: 0,
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(ClosePreviewSchema, {
        ...preview,
        integrationRequired: false,
        merge: { status: 'not-integrated', reason: 'archive-only', sourceBranch: 'feature/x' },
      }),
    ).toBe(true);
    // Git off: archived in place, no branch read.
    expect(
      Value.Check(ClosePreviewSchema, {
        ...preview,
        integrationRequired: false,
        merge: { status: 'not-integrated', reason: 'git-off', checkout: 'linked' },
      }),
    ).toBe(true);
    expect(
      Value.Check(ClosePreviewSchema, {
        ...preview,
        merge: { status: 'not-integrated', reason: 'git-off' },
      }),
    ).toBe(false);
    expect(
      Value.Check(ClosePreviewSchema, {
        ...preview,
        merge: { status: 'not-integrated', reason: 'archive-only' },
      }),
    ).toBe(false);
    expect(Value.Check(ClosePreviewSchema, preview)).toBe(false);
    expect(
      Value.Check(ClosePreviewSchema, {
        ...preview,
        merge: { status: 'not-integrated', reason: 'integration-off', sourceBranch: 'x' },
      }),
    ).toBe(false);
  });
});
