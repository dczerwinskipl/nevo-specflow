import { describe, expect, it } from 'vitest';

import { matchesWorktreeBranchPattern } from '../../version-control/worktrees/policy';
import {
  deriveIntegrationCandidates,
  type IntegrationBranchEvidence,
} from './integration-candidates';

const evidence = (overrides: Partial<IntegrationBranchEvidence>): IntegrationBranchEvidence => ({
  localBranches: [],
  remoteDefaults: [],
  branchPattern: 'feature/{key}-{slug}',
  ...overrides,
});

describe('integration branch candidates', () => {
  it('merges the facts of one branch, in fact order, and orders candidates by their first fact', () => {
    expect(
      deriveIntegrationCandidates(
        evidence({
          localBranches: ['develop', 'feature/nevo-1-sso', 'hotfix', 'release/2026.11'],
          remoteDefaults: [{ remote: 'origin', branch: 'release/2026.11' }],
          startedFrom: 'release/2026.11',
          primaryBranch: 'develop',
          ownBranch: 'feature/nevo-1-sso',
        }),
      ),
    ).toEqual({
      candidates: [
        { branch: 'release/2026.11', facts: ['remote-default', 'started-from'], remote: 'origin' },
        { branch: 'develop', facts: ['primary-checkout'] },
      ],
      otherBranches: ['hotfix'],
      otherBranchCount: 1,
    });
  });

  it('assumes no branch: an empty repository picture offers nothing', () => {
    expect(deriveIntegrationCandidates(evidence({}))).toEqual({
      candidates: [],
      otherBranches: [],
      otherBranchCount: 0,
    });
    // `main` exists but no fact names it: it is only another branch.
    expect(deriveIntegrationCandidates(evidence({ localBranches: ['main'] }))).toEqual({
      candidates: [],
      otherBranches: ['main'],
      otherBranchCount: 1,
    });
  });

  it('offers no branch a fact names that does not exist locally, nor the Specification branch itself', () => {
    expect(
      deriveIntegrationCandidates(
        evidence({
          localBranches: ['topic'],
          remoteDefaults: [{ remote: 'origin', branch: 'main' }],
          startedFrom: 'deleted',
          primaryBranch: 'topic',
          ownBranch: 'topic',
        }),
      ),
    ).toEqual({ candidates: [], otherBranches: [], otherBranchCount: 0 });
  });

  it('names origin first when several remotes default to the same branch', () => {
    expect(
      deriveIntegrationCandidates(
        evidence({
          localBranches: ['main', 'trunk'],
          remoteDefaults: [
            { remote: 'upstream', branch: 'trunk' },
            { remote: 'fork', branch: 'main' },
            { remote: 'origin', branch: 'main' },
          ],
        }),
      ).candidates,
    ).toEqual([
      { branch: 'main', facts: ['remote-default'], remote: 'origin' },
      { branch: 'trunk', facts: ['remote-default'], remote: 'upstream' },
    ]);
  });
});

describe('worktree branch pattern match', () => {
  it.each([
    ['feature/{key}-{slug}', 'feature/nevo-12-sso-sign-in', true],
    ['feature/{key}-{slug}', 'feature/sso', false],
    ['spec/{slug}-{shortId}', 'spec/sso-0a1b2c3d', true],
    ['spec/{slug}-{shortId}', 'spec/sso-xyz', false],
    ['work.{slug}', 'workx-sso', false],
  ])('%s matches %s: %s', (pattern, branch, expected) => {
    expect(matchesWorktreeBranchPattern(pattern, branch)).toBe(expected);
  });
});
