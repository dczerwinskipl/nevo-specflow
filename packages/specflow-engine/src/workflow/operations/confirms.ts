import { canonicalJson } from '@nevo/workflow';

import { sha256Hex } from '../../hash';
import {
  pendingOwnerDecisionsOf,
  type AttemptRecord,
  type ExecutionTask,
  type PendingOwnerDecisions,
} from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import type { TaskDocumentRevision, TaskReferences } from './task-references';

/**
 * What the owner's Confirm of an agent's result applies besides taking its transition (D17): the
 * drafts `approve-draft-tasks` approves, each with the content revision of its manifest and of
 * every document file of it (`task.md` and the others) as they are now, and the agent's Task
 * decisions. The projection shows it with its digest (`confirmsDigest`); Confirm names that digest
 * and is refused when what it would apply now is not what the owner was shown.
 */
export interface ResultConfirms {
  /** Absent when the transition approves no drafts; in id order. */
  readonly approvesDrafts?: readonly ConfirmedDraft[];
  readonly taskDecisions: PendingOwnerDecisions['taskDecisions'];
}

export interface ConfirmedDraft {
  readonly taskId: string;
  /** The manifest's (`task.yaml`) content revision. */
  readonly revision: string;
  /** Every document file of the draft with its content revision, in path order. */
  readonly documents: readonly TaskDocumentRevision[];
}

/** The confirms of the awaited attempt `record` whose transition declares `effects`, on `snapshot`. */
export async function resultConfirmsOf(
  effects: readonly string[],
  tasks: readonly ExecutionTask[],
  snapshot: ExecutionSnapshot,
  record: AttemptRecord,
  references: Pick<TaskReferences, 'taskDocumentRevisions'>,
): Promise<ResultConfirms> {
  const revisions = new Map(
    snapshot.manifests.map((manifest) => [manifest.value.id, manifest.revision] as const),
  );
  const byPath = (a: TaskDocumentRevision, b: TaskDocumentRevision) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  const drafts = effects.includes('approve-draft-tasks')
    ? await Promise.all(
        tasks
          .filter((task) => task.status === 'draft')
          .sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
          .map(async (task): Promise<ConfirmedDraft> => ({
            taskId: task.taskId,
            revision: revisions.get(task.taskId) ?? '',
            documents: [
              ...(await references.taskDocumentRevisions(snapshot.specId, task.taskId)),
            ].sort(byPath),
          })),
      )
    : undefined;

  return {
    ...(drafts !== undefined ? { approvesDrafts: drafts } : {}),
    taskDecisions: pendingOwnerDecisionsOf(record),
  };
}

/** The digest of {@link ResultConfirms}: the projection's `confirmsDigest`. */
export function confirmsDigestOf(confirms: ResultConfirms): string {
  return sha256Hex(
    canonicalJson({
      approvesDrafts: confirms.approvesDrafts ?? null,
      taskDecisions: confirms.taskDecisions,
    }),
  );
}

/** What Confirm would apply now, in words, for the refusal when it is not what the owner saw. */
export function describeConfirms(confirms: ResultConfirms): string {
  const parts: string[] = [];
  if (confirms.approvesDrafts !== undefined) {
    parts.push(
      confirms.approvesDrafts.length === 0
        ? 'it approves no drafts'
        : `it approves the drafts ${confirms.approvesDrafts.map((draft) => draft.taskId).join(', ')} as they are now`,
    );
  }

  if (confirms.taskDecisions.length > 0) {
    parts.push(
      `it decides ${confirms.taskDecisions.map((decision) => `${decision.taskId} → ${decision.status}`).join(', ')}`,
    );
  }

  return parts.length > 0 ? parts.join(' and ') : 'it applies nothing besides its transition';
}
