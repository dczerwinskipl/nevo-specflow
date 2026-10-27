import { describe, expect, it } from 'vitest';

import { GitCapabilityError, type GitCapabilityErrorCode } from '../../../git/errors';
import { PERMANENT_BLOCKED_REASONS } from '../../../version-control/commits/failure-class';
import { COMMIT_BLOCKER_REASONS } from '../changes/commit-info';
import { classifyCommitError } from './failure';

const err = (code: GitCapabilityErrorCode, reason?: string): GitCapabilityError =>
  new GitCapabilityError(code, 'x', reason);

describe('classification of commit port errors', () => {
  it.each([
    'commit-timed-out',
    'deadline-exceeded',
    'effective-set-changed',
    'index-locked',
    'git-busy',
    'unmerged-paths',
  ])('treats COMMIT_BLOCKED %s as transient', (reason) => {
    expect(classifyCommitError(err('COMMIT_BLOCKED', reason))).toMatchObject({
      kind: 'transient',
      reason,
    });
  });

  it.each(['detached', 'branch-changed', 'no-commits', 'path-ignored', 'index-unreadable'])(
    'treats COMMIT_BLOCKED %s as permanent',
    (reason) => {
      expect(classifyCommitError(err('COMMIT_BLOCKED', reason))).toEqual({
        kind: 'permanent',
        reason,
      });
    },
  );

  it('maps an unknown block to commit-failed and keeps the port reason', () => {
    expect(classifyCommitError(err('COMMIT_BLOCKED', 'path-kind-conflict'))).toEqual({
      kind: 'permanent',
      reason: 'commit-failed',
      blockedBy: 'path-kind-conflict',
    });
  });

  it('treats a protected branch and a failed commit as permanent', () => {
    expect(classifyCommitError(err('BRANCH_PROTECTED', 'branch-not-allowed'))).toEqual({
      kind: 'permanent',
      reason: 'branch-not-allowed',
    });
    expect(classifyCommitError(err('BRANCH_PROTECTED'))).toMatchObject({
      kind: 'permanent',
      reason: 'branch-protected',
    });
    expect(classifyCommitError(err('COMMIT_FAILED', 'hook'))).toEqual({
      kind: 'permanent',
      reason: 'commit-failed',
      blockedBy: 'hook',
    });
  });

  it('treats an uncertain operation as uncertain', () => {
    expect(classifyCommitError(err('GIT_OPERATION_UNCERTAIN', 'mutation-timeout'))).toEqual({
      kind: 'uncertain',
      reason: 'uncertain',
      blockedBy: 'mutation-timeout',
    });
  });

  it('tells a Git that hung from one that cannot be started', () => {
    expect(classifyCommitError(err('GIT_UNAVAILABLE', 'timeout'))).toEqual({
      kind: 'transient',
      reason: 'git-timeout',
      blockedBy: 'timeout',
    });
    expect(classifyCommitError(err('GIT_UNAVAILABLE', 'executable-unavailable'))).toEqual({
      kind: 'permanent',
      reason: 'commit-failed',
      blockedBy: 'git-unavailable',
    });
    // Running out of descriptors or memory when Git is started passes; it is not a missing Git.
    expect(classifyCommitError(err('GIT_UNAVAILABLE', 'spawn-failed'))).toEqual({
      kind: 'transient',
      reason: 'git-unavailable',
      blockedBy: 'spawn-failed',
    });
    expect(classifyCommitError(err('GIT_OPERATION_UNCERTAIN', 'executable-unavailable'))).toEqual({
      kind: 'permanent',
      reason: 'commit-failed',
      blockedBy: 'git-unavailable',
    });
    expect(classifyCommitError(err('GIT_OPERATION_FAILED'))).toMatchObject({
      kind: 'transient',
      reason: 'git-unavailable',
    });
  });

  it('does not classify what is not a port error', () => {
    expect(classifyCommitError(new Error('boom'))).toBeUndefined();
  });

  it('never invents a reason that is not kebab-case', () => {
    expect(classifyCommitError(err('COMMIT_BLOCKED', 'Weird Reason!'))).toEqual({
      kind: 'permanent',
      reason: 'commit-failed',
    });
  });

  it('keeps the blockers the reads report as checkout blockers equal to the permanent ones', () => {
    expect([...PERMANENT_BLOCKED_REASONS]).toEqual([...COMMIT_BLOCKER_REASONS]);
  });
});
