import { lstat } from 'node:fs/promises';

import { GitCapabilityError } from '../../../git/errors';
import { readProjectGitPolicy } from '../../../version-control/worktrees/config';
import { withJournalLock } from '../../durable';
import { listDocumentChangeJournals } from '../write/journal-store';
import { DOCUMENT_BATCH_KIND } from './batch-store';
import type { QueueRuntime } from './runtime';
import { moveMember } from './settlement';

/**
 * Why a checkout cannot take commits at all (ADR 0016 decisions 4 and 13):
 * - `git-disabled`: the project policy turned Git off while operations were pending;
 * - `workspace-missing`: the checkout was removed.
 */
export type CheckoutGate = 'git-disabled' | 'workspace-missing';

export async function checkoutGate(rt: QueueRuntime): Promise<CheckoutGate | undefined> {
  try {
    if (!(await readProjectGitPolicy(rt.context)).policy.enabled) return 'git-disabled';
  } catch (error) {
    // An unreadable policy is the commit port's refusal to report, not a reason to drop the queue.
    if (!(error instanceof GitCapabilityError)) throw error;
  }
  try {
    return (await lstat(rt.checkout.root)).isDirectory() ? undefined : 'workspace-missing';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'workspace-missing';
    throw error;
  }
}

/**
 * Applies a gate to the operations of the checkout that are still `queued`, which no batch holds:
 * with Git disabled they complete as `not-applicable` (`git-disabled`, the files stay as they are),
 * with the checkout gone they become `commit-failed` (`workspace-missing`; `abandon` is allowed).
 * Returns their ids.
 */
export async function applyGateToQueued(rt: QueueRuntime, gate: CheckoutGate): Promise<string[]> {
  return withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    const ids: string[] = [];
    for (const journal of await listDocumentChangeJournals(rt.context)) {
      if (
        journal.workspaceId !== rt.checkout.workspaceId ||
        journal.stage !== 'queued' ||
        journal.commit === undefined
      ) {
        continue;
      }
      if (gate === 'git-disabled') {
        await moveMember(
          rt.context,
          journal,
          'completed',
          { outcome: 'not-applicable', reason: 'git-disabled' },
          rt.nowIso(),
        );
      } else {
        await moveMember(
          rt.context,
          journal,
          'commit-failed',
          { reason: 'workspace-missing' },
          rt.nowIso(),
        );
      }
      ids.push(journal.operationId);
    }
    return ids;
  });
}
