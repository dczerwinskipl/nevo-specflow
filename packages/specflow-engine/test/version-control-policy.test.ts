import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BASE_REF,
  DEFAULT_BRANCH_PATTERN,
  normalizeBaseRef,
  effectiveAutoCommit,
  parseGitWorktreePolicy,
  resolveWorktreeBranch,
  resolveWorktreesRoot,
  assertWorktreeTargetOutsideRepository,
  validateBaseRef,
  validateBranchName,
  validateBranchPattern,
} from '../src/version-control/worktrees/policy';

describe('Version Control worktree policy (VC01)', () => {
  it('defaults to the git-flavoured feature/{slug} pattern', () => {
    expect(DEFAULT_BRANCH_PATTERN).toBe('feature/{slug}');
    const policy = parseGitWorktreePolicy({ git: { enabled: true } });
    expect(resolveWorktreeBranch(policy, 'my-spec', '12345678')).toBe('feature/my-spec');
  });

  it.each(['feature/{slug}', 'feature/{slug}-{shortId}', 'spec/{shortId}', '{slug}'])(
    'accepts pattern %s with {shortId} optional',
    (pattern) => {
      expect(() => validateBranchPattern(pattern)).not.toThrow();
    },
  );

  it('rejects a static pattern that would collide on every create', () => {
    expect(() => validateBranchPattern('feature/static')).toThrow();
  });

  it('keeps the legacy defaults without worktrees configuration', () => {
    expect(parseGitWorktreePolicy({ git: { enabled: true } })).toEqual({
      enabled: true,
      branchPattern: DEFAULT_BRANCH_PATTERN,
      baseRef: DEFAULT_BASE_REF,
      commits: { protectedBranches: [] },
    });
    expect(parseGitWorktreePolicy({})).toEqual({
      enabled: false,
      branchPattern: DEFAULT_BRANCH_PATTERN,
      baseRef: DEFAULT_BASE_REF,
      commits: { protectedBranches: [] },
    });
  });

  it('parses the configured integration branch independently from new-worktree enablement', () => {
    expect(
      parseGitWorktreePolicy({
        git: { enabled: false, integrationTargetBranch: 'develop' },
      }),
    ).toMatchObject({ enabled: false, integrationTargetBranch: 'develop' });
    expect(
      parseGitWorktreePolicy({
        git: { enabled: true, integrationTargetBranch: 'main' },
      }),
    ).toMatchObject({ enabled: true, integrationTargetBranch: 'main' });
    expect(
      parseGitWorktreePolicy({ git: { enabled: true } }).integrationTargetBranch,
    ).toBeUndefined();
    for (const target of ['HEAD', 'a..b', '-bad', 'origin/main..x', '', 17]) {
      expect(() =>
        parseGitWorktreePolicy({ git: { enabled: true, integrationTargetBranch: target } }),
      ).toThrow();
    }
  });

  it('supports only explicit naming variables, conventional prefixes and default base refs', () => {
    const policy = parseGitWorktreePolicy({
      git: {
        enabled: true,
        worktrees: { branchPattern: 'feature/{slug}-{shortId}', baseRef: 'develop' },
      },
    });
    expect(resolveWorktreeBranch(policy, 'my-spec', '12345678')).toBe('feature/my-spec-12345678');
    expect(resolveWorktreeBranch(policy, 'my-spec', '12345678', 'topic/custom')).toBe(
      'topic/custom',
    );
    expect(normalizeBaseRef(policy.baseRef)).toBe('refs/heads/develop');
    expect(normalizeBaseRef('HEAD')).toBe('HEAD');
    expect(normalizeBaseRef('refs/tags/v1.0')).toBe('refs/tags/v1.0');
    expect(normalizeBaseRef('0123456789abcdef0123456789abcdef01234567')).toBe(
      '0123456789abcdef0123456789abcdef01234567',
    );
  });

  it.each([
    'feature/{slug}-{unknown}',
    'feature/{shortId}-{shortId}',
    'feature/{slug-{shortId}',
    'feature/{shortId}}',
    'feature/{slug}/{shortId}/',
    '../{shortId}',
    'feature//{shortId}',
    'feature/.hidden-{shortId}',
  ])('rejects unsafe branch template %s', (pattern) => {
    expect(() => validateBranchPattern(pattern)).toThrow();
  });

  it.each([
    '-danger',
    'spec/bad..ref',
    'spec/foo.lock',
    'spec/.hidden',
    'spec/with space',
    'spec/@{HEAD}',
    'spec/café',
    'spec/a//b',
  ])('rejects unsafe branch name %s', (branch) => {
    expect(() => validateBranchName(branch)).toThrow();
  });

  it.each(['-bad', 'origin/main', 'HEAD^{commit}', 'refs/remotes/origin/main', 'bad..ref'])(
    'rejects unsupported base ref %s',
    (ref) => {
      expect(() => validateBaseRef(ref)).toThrow();
    },
  );

  it('fails closed on unknown keys, local overrides and invalid types', () => {
    for (const project of [
      { git: { enabled: 'yes' } },
      { git: { enabled: true, provider: 'git' } },
      { git: { enabled: true, worktrees: { enabled: true } } },
      { git: { enabled: true, worktrees: { branchPattern: 17 } } },
      { git: { enabled: true, worktrees: { baseRef: '-bad' } } },
    ]) {
      expect(() => parseGitWorktreePolicy(project)).toThrow();
    }
    expect(() => parseGitWorktreePolicy({ git: { enabled: true } }, { git: {} })).not.toThrow();
    for (const local of [
      { git: { enabled: true } },
      { git: { branchPattern: 'x/{slug}' } },
      { git: { worktreesRoot: 17 } },
      { git: { worktreesRoot: '' } },
      { git: 'nope' },
    ]) {
      expect(() => parseGitWorktreePolicy({ git: { enabled: true } }, local)).toThrow();
    }
  });

  describe('git.worktreesRoot (workstation-local)', () => {
    const home = resolve('/work/repo');
    const common = join(home, '.git');

    it('is read only from the local config and kept out of the committed policy', () => {
      const policy = parseGitWorktreePolicy(
        { git: { enabled: true } },
        { git: { worktreesRoot: '../elsewhere' } },
      );
      expect(policy.worktreesRoot).toBe('../elsewhere');
      expect(parseGitWorktreePolicy({ git: { enabled: true } }).worktreesRoot).toBeUndefined();
      expect(() =>
        parseGitWorktreePolicy({ git: { enabled: true, worktreesRoot: '/x' } }),
      ).toThrow();
    });

    it('defaults to <repo>-worktrees next to the repository', () => {
      expect(resolveWorktreesRoot(home, common, undefined)).toBe(resolve('/work/repo-worktrees'));
    });

    it('resolves a relative root against the repository and accepts an absolute one', () => {
      expect(resolveWorktreesRoot(home, common, '../trees')).toBe(resolve('/work/trees'));
      expect(resolveWorktreesRoot(home, common, resolve('/abs/trees'))).toBe(resolve('/abs/trees'));
    });

    it.each(['.', 'inside', '.git/trees', '.git', 'a/../b'])(
      'rejects %s inside the working tree or .git',
      (value) => {
        expect(() => resolveWorktreesRoot(home, common, value)).toThrow();
      },
    );

    it('rejects a root inside a Git directory located outside the working tree', () => {
      const elsewhere = resolve('/work/gitdirs/repo.git');
      expect(() => resolveWorktreesRoot(home, elsewhere, join(elsewhere, 'trees'))).toThrow();
    });

    it('checks a persisted target independently of the current configuration', () => {
      expect(() =>
        assertWorktreeTargetOutsideRepository(home, common, resolve('/old/root/slug')),
      ).not.toThrow();
      expect(() =>
        assertWorktreeTargetOutsideRepository(home, common, join(home, 'slug')),
      ).toThrow();
    });
  });
});

describe('git.commits policy (protected and allowed branches)', () => {
  const parse = (commits: unknown, enabled = true, local?: unknown) =>
    parseGitWorktreePolicy({ git: { enabled, commits } }, local);

  it('protects nothing by default', () => {
    expect(parseGitWorktreePolicy({ git: { enabled: true } }).commits).toEqual({
      protectedBranches: [],
    });
    expect(parseGitWorktreePolicy({}).commits).toEqual({ protectedBranches: [] });
    expect(parse({}).commits).toEqual({ protectedBranches: [] });
  });

  it('parses protected and allowed patterns, trimmed and without an empty allow-list', () => {
    expect(
      parse({ protectedBranches: [' main ', 'release/**'], allowedBranches: ['feature/**'] })
        .commits,
    ).toEqual({ protectedBranches: ['main', 'release/**'], allowedBranches: ['feature/**'] });
    expect(parse({ protectedBranches: ['main'], allowedBranches: [] }).commits).toEqual({
      protectedBranches: ['main'],
    });
  });

  it('stays syntax-validated while Git is disabled', () => {
    expect(parse({ protectedBranches: ['main'] }, false).commits.protectedBranches).toEqual([
      'main',
    ]);
    expect(() => parse({ protectedBranches: ['a b'] }, false)).toThrow(/invalid branch pattern/);
  });

  it.each([
    ['a scalar block', 'main'],
    ['an unknown key', { protectedBranches: [], other: [] }],
    ['a non-list', { protectedBranches: 'main' }],
    ['a non-string entry', { protectedBranches: [1] }],
    ['an empty entry', { protectedBranches: [''] }],
    ['a refs/ prefix', { protectedBranches: ['refs/heads/main'] }],
    ['a leading slash', { protectedBranches: ['/main'] }],
    ['whitespace inside', { protectedBranches: ['ma in'] }],
    ['a literal that is no branch name', { protectedBranches: ['-main'] }],
    ['an unbalanced set', { protectedBranches: ['rel[0-9'] }],
    ['a duplicate', { protectedBranches: ['main', ' main'] }],
    [
      'an entry that is both protected and allowed',
      {
        protectedBranches: ['main'],
        allowedBranches: ['main'],
      },
    ],
    ['too many entries', { protectedBranches: Array.from({ length: 51 }, (_, i) => 'b' + i) }],
  ])('rejects %s with GIT_POLICY_INVALID', (_name, commits) => {
    expect(() => parse(commits)).toThrow(expect.objectContaining({ code: 'GIT_POLICY_INVALID' }));
  });

  it('keeps protection committed-only: the local file may not set it', () => {
    for (const key of ['protectedBranches', 'allowedBranches']) {
      expect(() =>
        parseGitWorktreePolicy(
          { git: { enabled: true } },
          { git: { commits: { [key]: ['main'] } } },
        ),
      ).toThrow(expect.objectContaining({ code: 'GIT_POLICY_INVALID' }));
    }
  });
});

describe('git.commits.auto (commit policy per capability)', () => {
  const project = (auto: unknown, enabled = true) => ({
    git: { enabled, commits: { auto } },
  });

  it('defaults to automatic commits for every capability', () => {
    const policy = parseGitWorktreePolicy({ git: { enabled: true } });
    expect(effectiveAutoCommit(policy, 'documents')).toEqual({ auto: true, source: 'default' });
    expect(parseGitWorktreePolicy({}).commits.auto).toBeUndefined();
  });

  it('reads the committed value and lets the local value win over it', () => {
    const committed = parseGitWorktreePolicy(project({ documents: false }));
    expect(committed.commits.auto).toEqual({ documents: false });
    expect(effectiveAutoCommit(committed, 'documents')).toEqual({ auto: false, source: 'project' });

    const localOn = parseGitWorktreePolicy(project({ documents: false }), {
      git: { commits: { auto: { documents: true } } },
    });
    expect(effectiveAutoCommit(localOn, 'documents')).toEqual({ auto: true, source: 'local' });

    const localOff = parseGitWorktreePolicy(project({ documents: true }), {
      git: { commits: { auto: { documents: false } } },
    });
    expect(effectiveAutoCommit(localOff, 'documents')).toEqual({ auto: false, source: 'local' });
  });

  it('accepts the local value together with the worktrees root and without a committed git block', () => {
    const policy = parseGitWorktreePolicy(
      {},
      { git: { worktreesRoot: '../w', commits: { auto: { documents: false } } } },
    );
    expect(policy.worktreesRoot).toBe('../w');
    expect(effectiveAutoCommit(policy, 'documents')).toEqual({ auto: false, source: 'local' });
  });

  it('is validated while Git is disabled, and then inert for the policy that gates Git', () => {
    const policy = parseGitWorktreePolicy(project({ documents: false }, false));
    expect(policy.enabled).toBe(false);
    expect(() => parseGitWorktreePolicy(project({ documents: 'no' }, false))).toThrow(
      expect.objectContaining({ code: 'GIT_POLICY_INVALID' }),
    );
  });

  it.each([
    ['not an object', 'off'],
    ['a list', [true]],
    ['a non-boolean value', { documents: 'false' }],
    ['a null value', { documents: null }],
    ['an unknown capability', { documents: true, tasks: false }],
  ])('rejects %s in the committed configuration', (_name, auto) => {
    expect(() => parseGitWorktreePolicy(project(auto))).toThrow(
      expect.objectContaining({ code: 'GIT_POLICY_INVALID' }),
    );
  });

  it.each([
    ['a non-boolean value', { auto: { documents: 1 } }],
    ['an unknown capability', { auto: { reviews: false } }],
    ['not an object', { auto: false }],
    ['another commits key', { auto: { documents: false }, protectedBranches: [] }],
  ])('rejects %s in the local configuration', (_name, commits) => {
    expect(() => parseGitWorktreePolicy({ git: { enabled: true } }, { git: { commits } })).toThrow(
      expect.objectContaining({ code: 'GIT_POLICY_INVALID' }),
    );
  });
});
