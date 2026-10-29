import type { CommitPolicyMode, DocumentTree } from '@nevo/specflow-contracts/documents';

import { foldPathKey } from '../../document-rules/document-paths';
import { COMMIT_BLOCKER_REASONS, commitInfoOfJournal } from '../changes/commit-info';
import type { DocumentBatchRecord } from '../changes/journal/batch';
import type { DocumentChangeJournal } from '../changes/journal/model';
import {
  DOCUMENT_BATCH_REFUSES_RESERVATION,
  DOCUMENT_CHANGE_STAGE_FACTS,
  isBarrierStage,
} from '../changes/journal/stages';
import { queueCapacityOf, type QueueCapacity } from '../changes/queue-capacity';
import { BUSY_RETRY_AFTER_MS } from '../write/reservation-guard';

/**
 * The commit state of one Specification as a read reports it, derived from the active journals and
 * batch records alone: no Git, no lock, no clock but the one passed in. Pure.
 *
 * Honesty rules: only operations that have not settled appear (a committed operation leaves the
 * active directory and therefore the view); nothing is reported as `pending` that a person has to
 * resolve (`failed`, `recoveryRequired`) and nothing as `failed` that the Engine still retries by
 * itself. A write whose process is provably gone is reported as needing recovery, not as pending.
 */

export type DocumentCommitMarker = NonNullable<DocumentTree['documents'][number]['commit']>;
export type DocumentTreeCommitsSummary = DocumentTree['commits'] & object;

/** Why a write cannot be admitted for a path (or at all): the reservation's own refusals. */
export type HoldCause = 'write-in-progress' | 'commit-in-progress' | 'recovery-required';

export interface PathHold {
  readonly cause: HoldCause;
  /** Present when waiting helps. */
  readonly retryAfterMs?: number;
}

/** What the reader knows of the paths one operation covers. */
export interface OperationPaths {
  readonly journal: DocumentChangeJournal;
  /** Checkout-relative paths of its plan; `undefined` when the plan cannot be read. */
  readonly paths: readonly string[] | undefined;
  /** Judged liveness of the writer of a `reserved` / `files-writing` operation. */
  readonly writer?: 'alive' | 'dead' | 'unknown';
}

export interface BatchPaths {
  readonly batch: DocumentBatchRecord;
  /** Checkout-relative paths of the batch; `undefined` when its path list cannot be read. */
  readonly paths: readonly string[] | undefined;
}

/** One path of the Specification's uncommitted-changes ledger, as the view needs it. */
export interface LedgerMarkerInput {
  /** Checkout-relative path. */
  readonly path: string;
  /** The newest operation that changed the path. */
  readonly operationId: string;
  readonly reason: 'auto-commit-off' | 'abandoned';
  readonly recordedAt: string;
}

export interface CommitViewInput {
  readonly specId: string;
  readonly workspaceId: string;
  /** Checkout-relative Specification directory, `specs/active/<slug>`. */
  readonly directory: string;
  /** Every active journal of the Project Home. */
  readonly journals: readonly OperationPaths[];
  /** Every active batch record of the Project Home. */
  readonly batches: readonly BatchPaths[];
  /** Journal or batch files that could not be read. */
  readonly unreadable: number;
  /** The paths of this Specification in the uncommitted-changes ledger (ADR 0018). */
  readonly ledger?: readonly LedgerMarkerInput[];
  /** Whether the documents are committed by the Engine (`auto`) or left uncommitted (`manual`); absent while Git is disabled. */
  readonly policy?: CommitPolicyMode;
  /** Epoch milliseconds; decides only `overdue` of the commit info, never the tree. */
  readonly now: number;
}

/** Holds by path (folded), with the folders above them. */
export class PathHolds {
  readonly #byPath = new Map<string, PathHold>();
  readonly #byFolder = new Map<string, PathHold>();
  #everything: PathHold | undefined;

  add(path: string, hold: PathHold): void {
    const key = foldPathKey(path);
    keepStronger(this.#byPath, key, hold);
    for (let at = key.lastIndexOf('/'); at > 0; at = key.lastIndexOf('/', at - 1)) {
      keepStronger(this.#byFolder, key.slice(0, at), hold);
    }
  }

  /** The Engine cannot tell which paths an operation holds: everything of the checkout is held. */
  addEverything(hold: PathHold): void {
    this.#everything = stronger(this.#everything, hold);
  }

  /** The hold on a file path (tree-relative). */
  at(path: string): PathHold | undefined {
    return stronger(this.#everything, this.#byPath.get(foldPathKey(path)));
  }

  /** The strongest hold on a path or on anything below a folder ('' is the root). */
  under(folder: string): PathHold | undefined {
    if (folder === '') {
      return this.any();
    }

    const key = foldPathKey(folder);

    return stronger(stronger(this.#everything, this.#byFolder.get(key)), this.#byPath.get(key));
  }

  any(): PathHold | undefined {
    let found = this.#everything;
    for (const hold of this.#byPath.values()) {
      found = stronger(found, hold);
    }

    return found;
  }

  entries(): [string, PathHold][] {
    return [...this.#byPath].sort(([left], [right]) => compare(left, right));
  }

  get everything(): PathHold | undefined {
    return this.#everything;
  }
}

/** A hold that cannot be waited out beats one that can; the longer wait beats the shorter. */
function stronger(left: PathHold | undefined, right: PathHold | undefined): PathHold | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  if (left.retryAfterMs === undefined) {
    return left;
  }

  if (right.retryAfterMs === undefined) {
    return right;
  }

  return right.retryAfterMs > left.retryAfterMs ? right : left;
}

function keepStronger(map: Map<string, PathHold>, key: string, hold: PathHold): void {
  const kept = stronger(map.get(key), hold);
  if (kept !== undefined) {
    map.set(key, kept);
  }
}

export interface DocumentCommitView {
  readonly summary: DocumentTreeCommitsSummary;
  /** By Specification-relative path (as in the tree). */
  readonly markers: ReadonlyMap<string, DocumentCommitMarker>;
  readonly holds: PathHolds;
  readonly capacity: QueueCapacity;
  /** A failed commit names a blocker of the whole checkout (a detached HEAD, no commits, an unreadable index) or a journal is unreadable. */
  readonly checkoutBlocked: boolean;
  /** Folded Specification-relative paths covered by a failed commit that names a blocker of the checkout state. */
  readonly blockedPaths: ReadonlySet<string>;
  /** Every fact above that a response depends on, in a deterministic JSON-able form (part of the tree revision). */
  readonly fingerprint: readonly unknown[];
}

/** The blockers that stop every write of the checkout, not only the covered paths. */
const CHECKOUT_WIDE_BLOCKERS: readonly string[] = ['detached', 'no-commits', 'index-unreadable'];

const SEVERITY = { pending: 1, failed: 3, recovery: 4 } as const;

function severityOf(marker: DocumentCommitMarker): number {
  if (marker.state === 'failed') {
    return marker.recoveryRequired === true ? SEVERITY.recovery : SEVERITY.failed;
  }

  return SEVERITY.pending;
}

/** The marker of one active journal, or `undefined` for a journal that is not an open commit. */
export function markerOfJournal(
  entry: OperationPaths,
  now: number,
): DocumentCommitMarker | undefined {
  const { journal } = entry;
  if (!DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active) {
    return undefined;
  }

  const info = commitInfoOfJournal(journal, now);
  if (entry.writer === 'dead') {
    return {
      state: 'failed',
      operationId: journal.operationId,
      recoveryRequired: true,
      reason: 'write-interrupted',
    };
  }

  if (info.state !== 'pending' && info.state !== 'failed') {
    return undefined;
  }

  return {
    state: info.state,
    operationId: journal.operationId,
    ...(info.recoveryRequired === true ? { recoveryRequired: true } : {}),
    ...(info.reason !== undefined ? { reason: info.reason } : {}),
    ...(info.blockedBy !== undefined ? { blockedBy: info.blockedBy } : {}),
    ...(info.attempts !== undefined ? { attempts: info.attempts } : {}),
    ...(info.nextAttemptAt !== undefined ? { nextAttemptAt: info.nextAttemptAt } : {}),
    ...(info.queuedAt !== undefined ? { queuedAt: info.queuedAt } : {}),
  };
}

function relativeTo(directory: string, path: string): string | undefined {
  const prefix = directory + '/';

  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function deriveCommitView(input: CommitViewInput): DocumentCommitView {
  const mine = input.journals.filter(
    (entry) =>
      entry.journal.workspaceId === input.workspaceId && entry.journal.specId === input.specId,
  );
  const markers = new Map<string, DocumentCommitMarker>();
  const rank = new Map<string, number>();
  const summary = { pending: 0, failed: 0, recoveryRequired: 0, uncommitted: 0 };
  let oldestPendingAt: string | undefined;
  let checkoutBlocked = input.unreadable > 0;
  const blockedPaths = new Set<string>();
  const holds = new PathHolds();

  for (const entry of mine) {
    const { journal } = entry;
    const marker = markerOfJournal(entry, input.now);
    if (marker !== undefined) {
      if (marker.state === 'pending') {
        summary.pending += 1;
        const at = marker.queuedAt ?? journal.createdAt;
        if (oldestPendingAt === undefined || Date.parse(at) < Date.parse(oldestPendingAt)) {
          oldestPendingAt = at;
        }
      } else if (marker.state === 'failed') {
        summary.failed += 1;
        if (marker.recoveryRequired === true) {
          summary.recoveryRequired += 1;
        }
      }

      for (const path of entry.paths ?? []) {
        const relative = relativeTo(input.directory, path);
        if (relative === undefined) {
          continue;
        }

        const kept = markers.get(relative);
        const order = severityOf(marker) * 1e9 + journal.sequence;
        if (kept === undefined || order > (rank.get(relative) ?? 0)) {
          markers.set(relative, marker);
          rank.set(relative, order);
        }
      }
    }

    const blocker =
      journal.stage === 'commit-failed' &&
      journal.reason !== undefined &&
      COMMIT_BLOCKER_REASONS.includes(journal.reason);
    if (blocker) {
      if (CHECKOUT_WIDE_BLOCKERS.includes(journal.reason)) {
        checkoutBlocked = true;
      }

      for (const path of entry.paths ?? []) {
        const relative = relativeTo(input.directory, path);
        if (relative !== undefined) {
          blockedPaths.add(foldPathKey(relative));
        }
      }
    }

    if (isBarrierStage(journal.stage, journal.recoveryPhase)) {
      const hold: PathHold =
        journal.stage === 'recovery-required'
          ? { cause: 'recovery-required' }
          : { cause: 'write-in-progress', retryAfterMs: BUSY_RETRY_AFTER_MS };
      if (entry.paths === undefined) {
        holds.addEverything(hold);
      }

      for (const path of entry.paths ?? []) {
        const relative = relativeTo(input.directory, path);
        if (relative !== undefined) {
          holds.add(relative, hold);
        }
      }
    }
  }

  for (const entry of input.batches) {
    const { batch } = entry;
    if (batch.workspaceId !== input.workspaceId || batch.specId !== input.specId) {
      continue;
    }

    if (!DOCUMENT_BATCH_REFUSES_RESERVATION[batch.state]) {
      continue;
    }

    const hold: PathHold =
      batch.state === 'recovery-required'
        ? { cause: 'recovery-required' }
        : { cause: 'commit-in-progress', retryAfterMs: BUSY_RETRY_AFTER_MS };
    if (entry.paths === undefined) {
      holds.addEverything(hold);
    }

    for (const path of entry.paths ?? []) {
      const relative = relativeTo(input.directory, path);
      if (relative !== undefined) {
        holds.add(relative, hold);
      }
    }
  }

  const capacity = queueCapacityOf(
    input.journals
      .map((entry) => entry.journal)
      .filter(
        (journal) =>
          journal.workspaceId === input.workspaceId &&
          DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active,
      ),
  );

  // Paths the ledger holds and no open operation covers: on disk, not in Git. An open operation of the
  // path (an auto-mode write after the policy flipped back on) is the truth until it commits.
  let uncommittedPaths = 0;
  for (const entry of input.ledger ?? []) {
    const relative = relativeTo(input.directory, entry.path);
    if (relative === undefined) {
      continue;
    }

    uncommittedPaths += 1;
    if (markers.has(relative)) {
      continue;
    }

    markers.set(relative, {
      state: 'uncommitted',
      operationId: entry.operationId,
      reason: entry.reason,
      queuedAt: entry.recordedAt,
    });
  }

  summary.uncommitted += uncommittedPaths;

  const sortedMarkers = [...markers].sort(([left], [right]) => compare(left, right));
  const commits: DocumentTreeCommitsSummary = {
    pending: summary.pending,
    failed: summary.failed,
    recoveryRequired: summary.recoveryRequired,
    uncommitted: summary.uncommitted,
    ...(oldestPendingAt !== undefined ? { oldestPendingAt } : {}),
    ...(input.policy !== undefined ? { policy: input.policy } : {}),
  };

  return {
    summary: commits,
    markers,
    holds,
    capacity,
    checkoutBlocked,
    blockedPaths,
    fingerprint: [
      commits,
      sortedMarkers,
      holds.entries(),
      holds.everything ?? null,
      capacity,
      checkoutBlocked,
      [...blockedPaths].sort(compare),
    ],
  };
}

/** The view of a Specification with nothing in flight. */
export function emptyCommitView(): DocumentCommitView {
  return deriveCommitView({
    specId: '',
    workspaceId: '',
    directory: '',
    journals: [],
    batches: [],
    unreadable: 0,
    now: 0,
  });
}
