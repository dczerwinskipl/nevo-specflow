import { describe, expect, it } from 'vitest';

import { startedFromBranch } from './refs';

describe('startedFromBranch', () => {
  it('is the branch HEAD is attached to when the base is HEAD', () => {
    expect(startedFromBranch('HEAD', 'develop')).toBe('develop');
  });

  it('is nothing for a detached HEAD', () => {
    expect(startedFromBranch('HEAD', undefined)).toBeUndefined();
  });

  it('is the branch an explicit local-branch ref names, whatever HEAD is on', () => {
    expect(startedFromBranch('refs/heads/release/x', 'develop')).toBe('release/x');
    expect(startedFromBranch('develop', undefined)).toBe('develop');
  });

  it('is nothing for a commit or a tag', () => {
    expect(startedFromBranch('a'.repeat(40), 'develop')).toBeUndefined();
    expect(startedFromBranch('refs/tags/v1.0', 'develop')).toBeUndefined();
  });
});
