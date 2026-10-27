import { describe, expect, it } from 'vitest';

import { BUSY_RETRY_AFTER_MS } from '../write/reservation-guard';
import {
  SUBJECT_FREE,
  availabilityOf,
  type ActionTarget,
  type AvailabilityContext,
  type SubjectRefusal,
} from './action-availability';
import { emptyCommitView, type DocumentCommitView, type PathHold } from './commit-model';

function commits(patch: Partial<DocumentCommitView> = {}): DocumentCommitView {
  return { ...emptyCommitView(), ...patch };
}

function holdsOf(entries: Record<string, PathHold>): DocumentCommitView['holds'] {
  const view = emptyCommitView();
  for (const [path, hold] of Object.entries(entries)) view.holds.add(path, hold);
  return view.holds;
}

const FILE: ActionTarget = { kind: 'file', path: 'notes/a.md' };
const WAIT: PathHold = { cause: 'write-in-progress', retryAfterMs: BUSY_RETRY_AFTER_MS };

describe('availabilityOf', () => {
  it('offers the action when nothing refuses it', () => {
    const context: AvailabilityContext = { archived: false, commits: commits() };
    for (const target of [
      FILE,
      { kind: 'folder', path: 'notes' },
      { kind: 'capability' },
    ] as const) {
      expect(availabilityOf(context, target)).toEqual({ available: true });
    }
  });

  describe('precedence', () => {
    // Every reason that can apply at once, strongest first.
    const everything: AvailabilityContext = {
      archived: true,
      policyReason: 'branch-protected',
      commits: commits({
        checkoutBlocked: true,
        capacity: 'queue-full',
        holds: holdsOf({ 'notes/a.md': WAIT }),
      }),
    };
    const protectedSubject: SubjectRefusal = { kind: 'refused', reason: 'protected' };

    it('archived beats the subject, the policy, the blockers and busy', () => {
      expect(availabilityOf(everything, FILE, protectedSubject)).toEqual({
        available: false,
        reason: 'archived',
      });
    });

    it('the subject beats the policy, the blockers and busy', () => {
      const context = { ...everything, archived: false };
      expect(availabilityOf(context, FILE, protectedSubject)).toEqual({
        available: false,
        reason: 'protected',
      });
      expect(availabilityOf(context, FILE, { kind: 'refused', reason: 'root' }).reason).toBe(
        'root',
      );
      expect(
        availabilityOf(context, FILE, { kind: 'refused', reason: 'not-editable' }).reason,
      ).toBe('not-editable');
      // Nothing to classify: refused without a reason, still before the policy.
      expect(availabilityOf(context, FILE, { kind: 'refused' })).toEqual({ available: false });
    });

    it.each(['branch-protected', 'branch-not-allowed', 'git-policy-invalid'] as const)(
      'the policy %s beats the blockers and busy',
      (policyReason) => {
        const context = { ...everything, archived: false, policyReason };
        expect(availabilityOf(context, FILE)).toEqual({ available: false, reason: policyReason });
      },
    );

    it('commit-blocked beats busy', () => {
      const { policyReason: _policy, ...withoutPolicy } = { ...everything, archived: false };
      expect(availabilityOf(withoutPolicy, FILE)).toEqual({
        available: false,
        reason: 'commit-blocked',
      });
    });

    it('busy is last and carries the retry hint', () => {
      const context: AvailabilityContext = {
        archived: false,
        commits: commits({ holds: holdsOf({ 'notes/a.md': WAIT }) }),
      };
      expect(availabilityOf(context, FILE)).toEqual({
        available: false,
        reason: 'busy',
        retryAfterMs: BUSY_RETRY_AFTER_MS,
      });
    });
  });

  describe('commit-blocked', () => {
    const blocked: AvailabilityContext = {
      archived: false,
      commits: commits({ blockedPaths: new Set(['notes/a.md']) }),
    };

    it('applies to the covered path and the folders above it, not to its neighbours', () => {
      expect(availabilityOf(blocked, FILE).reason).toBe('commit-blocked');
      expect(availabilityOf(blocked, { kind: 'folder', path: 'notes' }).reason).toBe(
        'commit-blocked',
      );
      expect(availabilityOf(blocked, { kind: 'folder', path: '' }).reason).toBe('commit-blocked');
      expect(availabilityOf(blocked, { kind: 'file', path: 'notes/b.md' })).toEqual({
        available: true,
      });
      expect(availabilityOf(blocked, { kind: 'folder', path: 'other' })).toEqual({
        available: true,
      });
      expect(availabilityOf(blocked, { kind: 'capability' })).toEqual({ available: true });
    });

    it('compares paths without regard to case', () => {
      expect(availabilityOf(blocked, { kind: 'file', path: 'Notes/A.md' }).reason).toBe(
        'commit-blocked',
      );
    });

    it('applies to every target when the checkout is blocked', () => {
      const context: AvailabilityContext = {
        archived: false,
        commits: commits({ checkoutBlocked: true }),
      };
      for (const target of [FILE, { kind: 'folder', path: 'x' }, { kind: 'capability' }] as const) {
        expect(availabilityOf(context, target).reason).toBe('commit-blocked');
      }
    });
  });

  describe('busy', () => {
    it('a full queue refuses every write and a retry helps', () => {
      const context: AvailabilityContext = {
        archived: false,
        commits: commits({ capacity: 'queue-full' }),
      };
      for (const target of [FILE, { kind: 'capability' }] as const) {
        expect(availabilityOf(context, target)).toEqual({
          available: false,
          reason: 'busy',
          retryAfterMs: BUSY_RETRY_AFTER_MS,
        });
      }
    });

    it('a queue full of decisions refuses without a retry hint', () => {
      const context: AvailabilityContext = {
        archived: false,
        commits: commits({ capacity: 'held-limit' }),
      };
      expect(availabilityOf(context, FILE)).toEqual({ available: false, reason: 'busy' });
    });

    it('a hold on a path refuses that path and the folders above it only', () => {
      const context: AvailabilityContext = {
        archived: false,
        commits: commits({ holds: holdsOf({ 'notes/a.md': { cause: 'recovery-required' } }) }),
      };
      expect(availabilityOf(context, FILE)).toEqual({ available: false, reason: 'busy' });
      expect(availabilityOf(context, { kind: 'folder', path: 'notes' }).reason).toBe('busy');
      expect(availabilityOf(context, { kind: 'file', path: 'notes/b.md' })).toEqual({
        available: true,
      });
      expect(availabilityOf(context, { kind: 'capability' })).toEqual({ available: true });
    });

    it('a hold on everything refuses the capabilities too', () => {
      const view = emptyCommitView();
      view.holds.addEverything({ cause: 'recovery-required' });
      const context: AvailabilityContext = { archived: false, commits: view };
      expect(availabilityOf(context, { kind: 'capability' }).reason).toBe('busy');
    });
  });

  it('SUBJECT_FREE refuses nothing', () => {
    expect(SUBJECT_FREE).toEqual({ kind: 'none' });
  });
});
