import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  CreateOptionsSchema,
  designatedBaseRef,
  localBranchRef,
  refDisplayName,
} from './create-options';

const ID = '0b8f1c1e-0a11-4c6e-9a01-000000000001';

const options = (refs: string[], defaultBaseRef = 'main') => ({
  primaryWorkspaceId: ID,
  workspaces: [],
  newWorktree: { status: 'available' },
  defaultBaseRef,
  branchPattern: 'feature/{slug}',
  worktreesRoot: { path: '/work/repo-worktrees', exists: true },
  baseRefs: refs.map((ref) => ({ ref })),
});

describe('create-options base refs', () => {
  it('lists local branches as full refs only', () => {
    expect(
      Value.Check(CreateOptionsSchema, options(['refs/heads/main', 'refs/heads/feature/x'])),
    ).toBe(true);
    for (const ref of ['main', 'feature/x', 'refs/heads/', 'refs/remotes/origin/main', 'HEAD']) {
      expect(Value.Check(CreateOptionsSchema, options([ref])), ref).toBe(false);
    }
  });

  it('keeps the configured default as written', () => {
    for (const value of ['HEAD', 'main', 'refs/heads/main', 'refs/tags/v1.0']) {
      expect(Value.Check(CreateOptionsSchema, options([], value)), value).toBe(true);
    }
  });

  it('reads a configured base ref in the Engine order: HEAD, commit, full ref, then branch', () => {
    const sha1 = '0123456789abcdef0123456789abcdef01234567';
    const sha256 = sha1 + '0123456789abcdef01234567';
    expect(designatedBaseRef('HEAD')).toBe('HEAD');
    expect(designatedBaseRef(sha1)).toBe(sha1);
    expect(designatedBaseRef(sha1.toUpperCase())).toBe(sha1.toUpperCase());
    expect(designatedBaseRef(sha256)).toBe(sha256);
    expect(designatedBaseRef('refs/heads/main')).toBe('refs/heads/main');
    expect(designatedBaseRef('refs/tags/v1.0')).toBe('refs/tags/v1.0');
    expect(designatedBaseRef('main')).toBe('refs/heads/main');
    // A short tag name is a branch name to the Engine as well.
    expect(designatedBaseRef('v1.0')).toBe('refs/heads/v1.0');
    // Not a full SHA: an abbreviated hex name is a branch.
    expect(designatedBaseRef('0123456')).toBe('refs/heads/0123456');
  });

  it('converts between a short branch name and its ref', () => {
    expect(localBranchRef('main')).toBe('refs/heads/main');
    expect(localBranchRef('feature/x')).toBe('refs/heads/feature/x');
    expect(refDisplayName('refs/heads/feature/x')).toBe('feature/x');
    expect(refDisplayName(localBranchRef('release/1.4'))).toBe('release/1.4');
    expect(refDisplayName('refs/tags/v1.0')).toBe('refs/tags/v1.0');
    expect(refDisplayName('HEAD')).toBe('HEAD');
  });
});
