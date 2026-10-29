import type { EngineCommitRequest } from '../../../version-control/commits/port';
import { cutIdsAtBoundaries } from '../../../version-control/commits/document-change';
import type { DocumentBatchRecord } from '../changes/journal';
import type { DocumentChangePlan } from '../changes/plan/model';
import { documentCommitMessage } from './commit-summary';

/** What the commit of a batch is made of: only the operations that still hold it, in sequence order. */
export interface BatchCommitMember {
  readonly operationId: string;
  readonly action: string;
  /** The operation's plan, which the message is worded from; absent when it could not be read. */
  readonly plan?: DocumentChangePlan;
}

/**
 * The trailers of a batch commit, from the EFFECTIVE set only (ADR 0016 decision 3): `Nevo-Spec`,
 * `Nevo-Action` (the action, or `mixed` when the members differ), `Nevo-Documents` (the effective
 * paths below the Specification directory, cut at path boundaries with a `+N` count) and, when the
 * batch consolidated operations, `Nevo-Coalesced` (the other members' ids, cut at id boundaries). The
 * port adds `Nevo-Operation` (the batch id) and `Nevo-Kind`.
 */
export function batchTrailers(
  batch: Pick<DocumentBatchRecord, 'specId' | 'slug'>,
  members: readonly BatchCommitMember[],
  effective: readonly string[],
): Record<string, string> {
  const actions = new Set(members.map((member) => member.action));
  const prefix = `specs/active/${batch.slug}/`;
  const documents = effective.map((path) =>
    path.startsWith(prefix) ? path.slice(prefix.length) : path,
  );
  const others = members.slice(1).map((member) => member.operationId);
  return {
    'Nevo-Spec': batch.specId,
    'Nevo-Action': actions.size === 1 ? [...actions][0]! : 'mixed',
    'Nevo-Documents': cutIdsAtBoundaries(documents),
    ...(others.length > 0 ? { 'Nevo-Coalesced': cutIdsAtBoundaries(others) } : {}),
  };
}

/**
 * The request the port commits: the effective set, the dropped rest, the pinned branch, a message that
 * says what changed (`commit-summary.ts`) and the trailers.
 */
export function batchCommitRequest(
  batch: DocumentBatchRecord,
  root: string,
  members: readonly BatchCommitMember[],
  split: { readonly effective: readonly string[]; readonly dropped: readonly string[] },
  deadlineMs: number | undefined,
): EngineCommitRequest {
  return {
    root,
    expectedBranch: batch.branch,
    paths: split.effective,
    droppedPaths: split.dropped,
    operationId: batch.operationId,
    kind: 'document-change',
    ...documentCommitMessage(batch.slug, members, split.effective),
    trailers: batchTrailers(batch, members, split.effective),
    ...(deadlineMs !== undefined ? { deadlineMs } : {}),
  };
}
