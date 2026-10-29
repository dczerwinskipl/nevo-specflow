/**
 * Admission of a manual commit (ADR 0018 decision 8). The order of the checks is the contract:
 *
 *  1. Git is enabled for the project (else `MANUAL_COMMIT_UNAVAILABLE`, cause `git-disabled`);
 *  2. the document queue of the scope is at rest after a bounded flush (else `MANUAL_COMMIT_UNAVAILABLE`,
 *     cause `queue-not-empty`); the ledger the flush leaves is the one the request is judged on;
 *  3. the ledger of the scope is not empty (else `MANUAL_COMMIT_UNAVAILABLE`, cause `ledger-empty`);
 *  4. `ledgerRevision`, when given, is the current one (else `MANUAL_COMMIT_STALE`);
 *  5. `paths`, when given, are ledger paths of the scope, closed under shared operation ids (else
 *     `MANUAL_COMMIT_SUBSET_INVALID`, `details.paths` the closure);
 *  6. the checkout is on the branch the ledger pinned (else `MANUAL_COMMIT_CONFLICT`, cause
 *     `branch-changed`);
 *  7. the commit port's preflight accepts the paths on this branch (else `BRANCH_PROTECTED` or
 *     `COMMIT_BLOCKED`; nothing is reserved);
 *  8. no selected path was edited since its post-image (else `MANUAL_COMMIT_CONFLICT`,
 *     `details.paths`; nothing is committed under the Engine's message).
 *
 * Everything above is read without the control lock; the reservation (`reserve`) re-reads the ledger
 * inside it and starts over when it moved. Nothing is reserved when a check refuses.
 */
import { randomUUID } from 'node:crypto';

import { GitCapabilityError } from '../../git/errors';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import {
  LedgerCorruptError,
  readLedgerRecord,
  publishJournal,
  writePayload,
  type LedgerRecord,
} from '../durable';
import { ledgerOwnerKey } from '../durable/ledger/model';
import { SharedResourceError } from '../durable/claims';
import { resourcesForManualCommit } from './claims';
import { gitRefusal, manualCommitError } from './errors';
import {
  findManualCommitJournal,
  listManualCommitJournals,
  sweepSettledManualCommits,
  withManualCommitLock,
  MANUAL_COMMIT_JOURNAL_KIND,
} from './journal-store';
import {
  MANUAL_COMMIT_FLUSH_WAIT_MS,
  MANUAL_COMMIT_JOURNAL_VERSION,
  MANUAL_COMMIT_STAGE_FACTS,
  type ManualCommitJournal,
} from './model';
import { encodeMessage, encodeSnapshot, type SnapshotEntry, type StoredMessage } from './payload';
import type { ManualCommitPorts, ManualCommitRuntime, ManualCommitTarget } from './runtime';
import {
  editedSince,
  revisionOfScope,
  scopeEntriesOf,
  selectEntries,
  type ScopeEntry,
} from './selection';
import { readWorkingContents } from './working';

/** How long a client is told to wait before it retries a request that met a commit in progress. */
export const MANUAL_COMMIT_BUSY_RETRY_AFTER_MS = 1000;

/** What the admission judged: the request is allowed to reserve exactly this. */
export interface AdmittedManualCommit {
  readonly target: ManualCommitTarget;
  readonly message: StoredMessage;
  readonly fingerprint: string;
  /** The entries the commit will hold, sorted by path. */
  readonly selected: readonly ScopeEntry[];
  readonly branch: string;
}

export interface ManualCommitRequestFields {
  readonly operationId: string;
  readonly paths?: readonly string[];
  readonly ledgerRevision?: string;
}

/** The records of the owners of the target, read without a lock; a corrupt one refuses (fail closed). */
export async function readTargetRecords(
  rt: ManualCommitRuntime,
  target: ManualCommitTarget,
): Promise<LedgerRecord[]> {
  const records: LedgerRecord[] = [];
  for (const owner of target.owners) {
    try {
      const record = await readLedgerRecord(rt.context, target.checkout.workspaceId, owner);
      if (record !== undefined && record.entries.length > 0) {
        records.push(record);
      }
    } catch (error) {
      if (error instanceof LedgerCorruptError) {
        throw manualCommitError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
      }

      throw error;
    }
  }

  return records;
}

export async function admitManualCommit(
  rt: ManualCommitRuntime,
  target: ManualCommitTarget,
  request: ManualCommitRequestFields,
  message: StoredMessage,
  fingerprint: string,
  ports: ManualCommitPorts,
): Promise<AdmittedManualCommit> {
  const root = target.checkout.root;
  // 1. Git.
  let enabled: boolean;
  try {
    enabled = (await readProjectGitPolicy(rt.context)).policy.enabled;
  } catch (error) {
    throw gitRefusal(error);
  }

  if (!enabled) {
    throw manualCommitError(
      'unavailable-git-disabled',
      'Git is disabled: nothing can be committed.',
    );
  }

  // 2. The document queue of the scope is at rest. The definitions are not the queue's.
  if (target.scope !== 'definitions') {
    const rest = await ports.settleQueue(
      target,
      rt.options.flushWaitMs ?? MANUAL_COMMIT_FLUSH_WAIT_MS,
    );
    if (rest.pending + rest.failed + rest.recoveryRequired > 0) {
      throw manualCommitError(
        'unavailable-queue',
        'Pending, failed or recovering document commits hold this scope; finish, retry or abandon them first.',
      );
    }
  }

  // 3. The ledger.
  const records = await readTargetRecords(rt, target);
  const entries = scopeEntriesOf(records);
  if (entries.length === 0) {
    throw manualCommitError('unavailable-empty', 'There is nothing uncommitted to commit.');
  }

  // 4. The revision the person looked at.
  if (request.ledgerRevision !== undefined && request.ledgerRevision !== revisionOfScope(entries)) {
    throw manualCommitError('stale', 'The uncommitted changes changed; reload them.');
  }

  // 5. The subset.
  const check = selectEntries(entries, request.paths);
  if (!check.ok) {
    throw manualCommitError(
      'subset-invalid',
      check.kind === 'unknown-path'
        ? 'Some paths are not uncommitted changes of this scope.'
        : 'The paths split an operation; include every path of it.',
      {
        cause: check.kind === 'unknown-path' ? 'path-not-in-ledger' : 'closure-incomplete',
        paths: check.paths,
      },
    );
  }

  const selected = check.selected;

  // 6. The branch.
  let branch: string;
  try {
    branch = await rt.commits.currentBranch(root);
  } catch (error) {
    throw gitRefusal(error);
  }

  const owning = new Set(selected.map((entry) => entry.owner));
  for (const record of records) {
    if (!owning.has(ledgerOwnerKey(record.owner))) {
      continue;
    }

    if (record.branch !== null && record.branch !== branch) {
      throw manualCommitError(
        'branch-changed',
        'The checkout is on another branch than the one the changes were made on.',
      );
    }
  }

  // 7. The commit port accepts the paths here.
  try {
    await rt.commits.preflight({
      root,
      expectedBranch: branch,
      paths: selected.map((entry) => entry.path),
      operationId: randomUUID(),
      kind: 'manual-commit',
      subject: 'preflight',
    });
  } catch (error) {
    if (error instanceof GitCapabilityError) {
      throw gitRefusal(error);
    }

    throw error;
  }

  // 8. Nobody edited the paths since the Engine left them.
  const working = await readWorkingContents(
    root,
    selected.map((entry) => entry.path),
  );
  const edited = editedSince(selected, working);
  if (edited.length > 0) {
    throw manualCommitError(
      'conflict',
      'Some paths were edited since the Engine wrote them; reload and review them first.',
      { paths: edited },
    );
  }

  return { target, message, fingerprint, selected, branch };
}

export type ReservationOutcome =
  | { readonly kind: 'reserved'; readonly journal: ManualCommitJournal }
  /** The operation id already has a journal (this call lost a race, or it is a replay). */
  | { readonly kind: 'existing'; readonly journal: ManualCommitJournal }
  /** The ledger is not the one the request was judged on. */
  | { readonly kind: 'replan' };

const sameEntry = (left: ScopeEntry, right: ScopeEntry): boolean =>
  left.owner === right.owner &&
  left.path === right.path &&
  left.postSha256 === right.postSha256 &&
  left.operationCount === right.operationCount;

export function snapshotEntriesOf(selected: readonly ScopeEntry[]): SnapshotEntry[] {
  return selected.map((entry) => ({
    owner: entry.owner,
    path: entry.path,
    postSha256: entry.postSha256,
    operationCount: entry.operationCount,
  }));
}

/**
 * ONE reservation under the Project Home control lock: the ledger is still what the request was
 * judged on, no Create or Close claims the checkout, no other manual commit holds it, no document
 * write or queue batch holds the paths, the snapshot and the message are durable and the journal is
 * published at `reserved`. Nothing is written outside the Project Home state.
 */
export async function reserveManualCommit(
  rt: ManualCommitRuntime,
  admitted: AdmittedManualCommit,
  operationId: string,
  ports: ManualCommitPorts,
): Promise<ReservationOutcome> {
  const { target, selected, message } = admitted;
  const snapshot = encodeSnapshot(snapshotEntriesOf(selected));
  const encodedMessage = encodeMessage(message);

  return withManualCommitLock(rt.context, async () => {
    const existing = await findManualCommitJournal(rt.context, operationId);
    if (existing !== undefined) {
      return { kind: 'existing', journal: existing };
    }

    await sweepSettledManualCommits(rt.context, {
      now: Date.parse(rt.nowIso()),
      keepOperationId: operationId,
    });

    // The ledger moved between the judgement and the lock: judge again.
    const current = scopeEntriesOf(await readTargetRecords(rt, target));
    const byPath = new Map(current.map((entry) => [entry.path, entry]));
    if (
      !selected.every((entry) => {
        const now = byPath.get(entry.path);

        return now !== undefined && sameEntry(entry, now);
      })
    ) {
      return { kind: 'replan' };
    }

    const requested = resourcesForManualCommit({ workspaceId: target.checkout.workspaceId });
    try {
      await ports.assertClaims(requested, { kind: 'manual-commit', operationId });
    } catch (error) {
      if (error instanceof SharedResourceError) {
        if (error.code === 'RESOURCE_JOURNAL_CORRUPT') {
          throw manualCommitError('journal-corrupt', 'A journal is corrupt; recover it.');
        }

        throw manualCommitError('busy-create-or-close', 'A Create or Close holds this checkout.', {
          retryAfterMs: MANUAL_COMMIT_BUSY_RETRY_AFTER_MS,
        });
      }

      throw error;
    }

    for (const other of await listManualCommitJournals(rt.context)) {
      if (other.workspaceId !== target.checkout.workspaceId) {
        continue;
      }

      if (!MANUAL_COMMIT_STAGE_FACTS[other.stage].holdsClaim) {
        continue;
      }

      throw other.stage === 'recovery-required'
        ? manualCommitError(
            'busy-recovery-required',
            'An earlier manual commit of this checkout needs recovery.',
            { operationId: other.operationId },
          )
        : manualCommitError('busy-commit-in-progress', 'Another manual commit is under way.', {
            retryAfterMs: MANUAL_COMMIT_BUSY_RETRY_AFTER_MS,
            operationId: other.operationId,
          });
    }

    await ports.assertQuiet(
      target,
      selected.map((entry) => entry.path),
    );

    await writePayload(rt.context, MANUAL_COMMIT_JOURNAL_KIND, operationId, [
      { sha256: snapshot.sha256, content: snapshot.text },
      { sha256: encodedMessage.sha256, content: encodedMessage.text },
    ]);
    const now = rt.nowIso();
    const journal: ManualCommitJournal = {
      version: MANUAL_COMMIT_JOURNAL_VERSION,
      projectId: rt.context.project.projectId,
      operationId,
      workspaceId: target.checkout.workspaceId,
      workspaceRoot: target.checkout.root,
      scope: target.scope,
      ...(target.specId !== undefined ? { specId: target.specId } : {}),
      owners: [...new Set(selected.map((entry) => entry.owner))].sort(),
      inputFingerprint: admitted.fingerprint,
      stage: 'reserved',
      branch: admitted.branch,
      snapshot: { sha256: snapshot.sha256, bytes: snapshot.bytes, pathCount: snapshot.pathCount },
      message: { sha256: encodedMessage.sha256, bytes: encodedMessage.bytes },
      createdAt: now,
      updatedAt: now,
    };
    await publishJournal(rt.context, MANUAL_COMMIT_JOURNAL_KIND, journal);

    return { kind: 'reserved', journal };
  });
}
