import type { Action, ActionReason } from '@nevo/specflow-contracts/documents';

import { foldPathKey } from '../../document-rules/document-paths';
import { BUSY_RETRY_AFTER_MS } from '../write/reservation-guard';
import type { DocumentCommitView, PathHold } from './commit-model';

/**
 * Availability of the write actions of the document tree. One rule for every action and
 * capability, in this precedence (the first that applies wins):
 *
 *  1. `archived`: the Specification is in `archive/`.
 *  2. The subject itself: `protected` (the overview cannot be renamed, moved or deleted, nor a
 *     folder holding it), `root` (the root folder), `not-editable` (a save of something that is
 *     not editable text). A registered document is `{ available: false }` without a reason for
 *     `classify` (nothing to classify).
 *  3. The advisory Git policy of the checked-out branch (`branch-protected`, `branch-not-allowed`,
 *     `git-policy-invalid`), read from the `HEAD` file.
 *  4. `commit-blocked`: a failed commit of this Specification names a blocker of the checkout
 *     (a detached HEAD, no commits, an unreadable index) or of the very paths (a changed branch, an
 *     ignored path), or a journal cannot be read.
 *  5. `busy`: the queue of the checkout is full (a wait helps) or holds too many operations that wait
 *     for a person (it does not), or a write or a claimed commit batch holds the path (a wait
 *     helps), or a batch awaits operator recovery (it does not).
 *
 * Reasons 1 to 3 never change without the files or the configuration changing; 4 and 5 are
 * evidence of the queue and carry the same causes the reservation refuses with (`SPEC_BUSY`,
 * `COMMIT_BLOCKED`). Pure.
 */

/** Why a write is advisory-unavailable because of the project Git policy (read-only evaluation). */
export type PolicyReason = Extract<
  ActionReason,
  'branch-protected' | 'branch-not-allowed' | 'git-policy-invalid'
>;

export interface AvailabilityContext {
  readonly archived: boolean;
  readonly policyReason?: PolicyReason;
  readonly commits: DocumentCommitView;
}

/** What the subject itself says before any policy or queue evidence is consulted. */
export type SubjectRefusal =
  { readonly kind: 'none' } | { readonly kind: 'refused'; readonly reason?: ActionReason };

export const SUBJECT_FREE: SubjectRefusal = { kind: 'none' };

/** Where in the Specification an action acts: a file path, a folder, or nowhere in particular. */
export type ActionTarget =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'folder'; readonly path: string }
  | { readonly kind: 'capability' };

export function busyAction(hold: PathHold): Action {
  return {
    available: false,
    reason: 'busy',
    ...(hold.retryAfterMs !== undefined ? { retryAfterMs: hold.retryAfterMs } : {}),
  };
}

export function availabilityOf(
  context: AvailabilityContext,
  target: ActionTarget,
  subject: SubjectRefusal = SUBJECT_FREE,
): Action {
  if (context.archived) return { available: false, reason: 'archived' };
  if (subject.kind === 'refused') {
    return subject.reason === undefined
      ? { available: false }
      : { available: false, reason: subject.reason };
  }
  if (context.policyReason !== undefined) return { available: false, reason: context.policyReason };
  const { commits } = context;
  if (commits.checkoutBlocked || isBlockedPath(commits.blockedPaths, target)) {
    return { available: false, reason: 'commit-blocked' };
  }
  // A full queue refuses every write; one that only holds decisions refuses without a retry.
  if (commits.capacity === 'queue-full') {
    return busyAction({ cause: 'write-in-progress', retryAfterMs: BUSY_RETRY_AFTER_MS });
  }
  if (commits.capacity === 'held-limit') return busyAction({ cause: 'recovery-required' });
  const hold = holdOf(commits.holds, target);
  return hold === undefined ? { available: true } : busyAction(hold);
}

function holdOf(holds: DocumentCommitView['holds'], target: ActionTarget): PathHold | undefined {
  switch (target.kind) {
    case 'file':
      return holds.at(target.path);
    case 'folder':
      return holds.under(target.path);
    case 'capability':
      return holds.everything;
  }
}

function isBlockedPath(blocked: ReadonlySet<string>, target: ActionTarget): boolean {
  if (target.kind === 'capability' || blocked.size === 0) return false;
  const key = foldPathKey(target.path);
  if (target.kind === 'file') return blocked.has(key);
  if (key === '') return true;
  for (const path of blocked) if (path === key || path.startsWith(key + '/')) return true;
  return false;
}
