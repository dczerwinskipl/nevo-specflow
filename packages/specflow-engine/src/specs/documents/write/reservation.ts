import { readBoundedBytes } from '../../bounded-read';
import { sha256Hex } from '../../../hash';
import { foldPathKey } from '../../document-rules/document-paths';
import { DocumentError } from '../../document-rules/errors';
import { openVerifiedFile } from '../../document-rules/verified-file';
import {
  LEDGER_BRANCH_MAX_CHARACTERS,
  LEDGER_MAX_PATHS,
  LedgerCorruptError,
  SharedResourceError,
  publishJournal,
  readLedgerRecord,
  readPayload,
  withJournalLock,
  writePayload,
} from '../../durable';
import { resourcesForDocumentChange } from '../changes/claims';
import { documentChangeError } from '../changes/errors';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { isBarrierStage, isWriterStage } from '../changes/journal/stages';
import { queueCapacityOf } from '../changes/queue-capacity';
import { decodePlanWithEvidence, encodePlan } from '../changes/plan/codec';
import { MANIFEST_MAX_BYTES } from '../limits';
import { WorkflowError } from '../../../workflow/errors';
import type { LoadedDocumentContainer } from '../loaded-specification';
import type { AdmittedDocumentChange } from './admission';
import { BUSY_RETRY_AFTER_MS, assertNoClaimedBatchOverlap } from './reservation-guard';
import {
  findDocumentChangeJournal,
  listDocumentChangeJournals,
  sweepSettledDocumentChanges,
} from './journal-store';
import type { WriteRuntime } from './writer-types';

export type ReservationOutcome =
  | { readonly kind: 'reserved'; readonly journal: DocumentChangeJournal }
  /** The operation id already has a journal (this call lost a race, or it is a replay). */
  | { readonly kind: 'existing'; readonly journal: DocumentChangeJournal }
  /** The manifest is not the one the plan was made from. */
  | { readonly kind: 'replan' }
  | { readonly kind: 'busy'; readonly error: DocumentError; readonly waitable: boolean };

/**
 * sha256 of the container's registry file (`specification.yaml`, or a Task's `task.yaml`) as it is
 * on disk now (the verified, bounded read of the loader; both files share the 256 KiB budget).
 */
export async function readManifestSha256(
  rt: WriteRuntime,
  loaded: Pick<LoadedDocumentContainer, 'rootDir' | 'registryFile'>,
): Promise<string> {
  const opened = await openVerifiedFile(rt.files.verified, loaded.rootDir, loaded.registryFile);
  if (opened.state !== 'opened') {
    throw documentChangeError('source-unavailable', 'The registry file is unavailable.');
  }

  try {
    const bytes = await readBoundedBytes(opened.handle, MANIFEST_MAX_BYTES);

    return sha256Hex(bytes);
  } finally {
    await opened.handle.close().catch(() => undefined);
  }
}

/**
 * ONE reservation under the Project Home control lock (ADR 0016): the manifest is
 * the one the plan was made from, no Create or Close claims the checkout, the queue has room, no
 * operation is still writing any of these paths, no claimed batch holds them, a `sequence` is
 * allocated, the plan file and the content are durable and the journal is published at `reserved`.
 * Nothing is written outside the Project Home state. A refusal that a wait can lift is `waitable`.
 */
export async function reserveOnce(
  rt: WriteRuntime,
  admitted: AdmittedDocumentChange,
  operationId: string,
  fingerprint: string,
): Promise<ReservationOutcome> {
  const { loaded, plan } = admitted;
  const encoded = encodePlan(plan);

  return withJournalLock(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
    const existing = await findDocumentChangeJournal(rt.context, operationId);
    if (existing !== undefined) {
      return { kind: 'existing', journal: existing };
    }

    // Bounded, Git-free and best effort: settled records past their window go with their plan files.
    await sweepSettledDocumentChanges(rt.context, {
      now: rt.now().getTime(),
      keepOperationId: operationId,
    });

    if ((await readManifestSha256(rt, loaded)) !== admitted.manifestSha256) {
      return { kind: 'replan' };
    }

    // D03: a Task's files are written by its documents or by the Specification execution store,
    // never by both at once. A pending store change of this Task waits for that store to finish it.
    if (loaded.container.kind === 'task') {
      let pending: boolean;
      try {
        pending = await rt.deps.taskResourceChangePending(
          rt.context,
          loaded.specId,
          loaded.container.taskId,
        );
      } catch (error) {
        if (error instanceof WorkflowError) {
          throw documentChangeError('journal-corrupt', 'The workflow change journal is corrupt.');
        }

        throw error;
      }

      if (pending) {
        return busy(
          'busy-task-resource-change',
          'A change of this Task by its workflow is pending; finish it before changing its documents.',
          false,
        );
      }
    }

    try {
      await rt.deps.assertClaims(
        rt.context,
        resourcesForDocumentChange({ workspaceId: loaded.workspaceId }),
        { kind: 'document-change', operationId },
      );
    } catch (error) {
      if (error instanceof SharedResourceError) {
        if (error.code === 'RESOURCE_JOURNAL_CORRUPT') {
          throw documentChangeError('journal-corrupt', 'A journal is corrupt; recover it.');
        }

        return busy('busy-create-or-close', 'A Create or Close holds this checkout.', false);
      }

      throw error;
    }

    const journals = (await listDocumentChangeJournals(rt.context)).filter(
      (journal) => journal.workspaceId === loaded.workspaceId,
    );
    const capacity = queueCapacityOf(journals);
    if (capacity === 'queue-full') {
      return busy('busy-queue-full', 'Too many document changes are waiting; retry shortly.', true);
    }

    // The rest wait for a person, who has to act: a wait does not help, so this refusal is not retryable.
    if (capacity === 'held-limit') {
      return busy(
        'busy-held-limit',
        'Too many document changes wait for a decision; retry, abandon or recover them.',
        false,
      );
    }

    const planned = new Set(plan.paths.map((path) => foldPathKey(path.path)));
    for (const other of journals) {
      if (!isBarrierStage(other.stage, other.recoveryPhase)) {
        continue;
      }

      const theirs = decodePlanWithEvidence(
        await readPayload(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, other.operationId, other.plan),
        other.plan,
      );
      if (!theirs.paths.some((path) => planned.has(foldPathKey(path.path)))) {
        continue;
      }

      return other.stage === 'recovery-required'
        ? busy(
            'busy-recovery-required',
            'An earlier write of these documents needs recovery.',
            false,
          )
        : busy('busy-write-in-progress', 'These documents are being written; retry shortly.', true);
    }

    try {
      assertNoClaimedBatchOverlap(
        loaded.workspaceId,
        plan.paths.map((path) => path.path),
        await rt.batches.list(rt.context, loaded.workspaceId),
      );
    } catch (error) {
      if (error instanceof DocumentError && error.code === 'SPEC_BUSY') {
        return { kind: 'busy', error, waitable: error.details?.cause === 'commit-in-progress' };
      }

      throw error;
    }

    if (admitted.git.enabled && admitted.git.mode === 'manual') {
      // The ledger pins the branch the first entry is made on; a name its record cannot hold is refused now.
      if ((admitted.git.branch?.length ?? 0) > LEDGER_BRANCH_MAX_CHARACTERS) {
        return {
          kind: 'busy',
          error: documentChangeError(
            'commit-blocked',
            'The branch name is too long to record uncommitted changes on it.',
            { blockedBy: 'branch-name-too-long' },
          ),
          waitable: false,
        };
      }

      const full = await ledgerWouldOverflow(rt, admitted, journals);
      if (full) {
        return {
          kind: 'busy',
          error: documentChangeError(
            'uncommitted-limit',
            'Too many uncommitted paths; commit the pending changes first.',
          ),
          waitable: false,
        };
      }
    }

    const sequence =
      journals.reduce((highest, journal) => Math.max(highest, journal.sequence), 0) + 1;
    await writePayload(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId, [
      ...admitted.payloads,
      { sha256: encoded.sha256, content: encoded.text },
    ]);
    await rt.hooks.beforeReservationPublish?.();
    const now = rt.nowIso();
    const journal: DocumentChangeJournal = {
      version: 1,
      projectId: rt.context.project.projectId,
      operationId,
      specId: loaded.specId,
      slug: loaded.slug,
      workspaceId: loaded.workspaceId,
      workspaceRoot: loaded.workspaceRoot,
      action: plan.action,
      inputFingerprint: fingerprint,
      sequence,
      createdAt: now,
      updatedAt: now,
      stage: 'reserved',
      plan: {
        sha256: encoded.sha256,
        bytes: encoded.bytes,
        pathCount: plan.paths.length,
        documentCount: plan.documents.length,
      },
      ...(admitted.git.enabled
        ? admitted.git.mode === 'auto'
          ? { commit: { branch: admitted.git.branch }, commitMode: 'auto' as const }
          : { commitMode: 'manual' as const }
        : {}),
      executor: await rt.executor(),
      attempts: 0,
    };
    await publishJournal(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, journal);

    return { kind: 'reserved', journal };
  });
}

/**
 * Whether the uncommitted paths of the Specification, the ones its manual-mode writers still in flight
 * will add, and this plan's would exceed what one ledger record holds. Judged before anything is
 * written, so a refusal changes nothing (ADR 0018 decision 6).
 */
async function ledgerWouldOverflow(
  rt: WriteRuntime,
  admitted: AdmittedDocumentChange,
  journals: readonly DocumentChangeJournal[],
): Promise<boolean> {
  const { loaded, plan } = admitted;
  let record;
  try {
    record = await readLedgerRecord(rt.context, loaded.workspaceId, {
      kind: 'specification',
      id: loaded.specId,
    });
  } catch (error) {
    if (error instanceof LedgerCorruptError) {
      throw documentChangeError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
    }

    throw error;
  }

  const paths = new Set((record?.entries ?? []).map((entry) => entry.path));
  for (const other of journals) {
    if (other.specId !== loaded.specId || other.commitMode !== 'manual') {
      continue;
    }

    if (!isWriterStage(other.stage) && other.stage !== 'recovery-required') {
      continue;
    }

    const theirs = decodePlanWithEvidence(
      await readPayload(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, other.operationId, other.plan),
      other.plan,
    );
    for (const path of theirs.paths) {
      paths.add(path.path);
    }
  }

  for (const path of plan.paths) {
    paths.add(path.path);
  }

  return paths.size > LEDGER_MAX_PATHS;
}

function busy(
  cause:
    | 'busy-queue-full'
    | 'busy-held-limit'
    | 'busy-recovery-required'
    | 'busy-write-in-progress'
    | 'busy-create-or-close'
    | 'busy-task-resource-change',
  message: string,
  waitable: boolean,
): ReservationOutcome {
  return {
    kind: 'busy',
    error: documentChangeError(
      cause,
      message,
      cause === 'busy-recovery-required' || cause === 'busy-held-limit'
        ? {}
        : { retryAfterMs: BUSY_RETRY_AFTER_MS },
    ),
    waitable,
  };
}
