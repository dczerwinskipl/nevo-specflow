import type { UncommittedView } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { ledgerRevisionOf, readLedgerRecord, LedgerCorruptError } from '../durable';
import { DocumentError } from '../document-rules/errors';
import { loadSpecification } from './loaded-specification';
import { resolveReadOptions, type DocumentReadOptions } from './read-options';
import { commitSubjectOf, readDocumentCommitView } from './reads/commit-reader';

/**
 * What the uncommitted-changes ledger holds for one Specification (`GET .../uncommitted`, ADR 0018):
 * the entries (path, reason, when, how many operations), the revision a manual commit can quote, the
 * effective commit policy with its source, and the work of the Specification that has not settled
 * (why a manual commit may be unavailable). Lock-free and Git-free.
 */
export async function readSpecificationUncommitted(
  engine: SpecFlowEngine,
  specId: string,
  options: DocumentReadOptions = {},
): Promise<UncommittedView> {
  const resolved = resolveReadOptions(options);
  const loaded = await loadSpecification(engine, specId, resolved.fs);
  let record;
  try {
    record = await readLedgerRecord(engine.context, loaded.workspaceId, {
      kind: 'specification',
      id: loaded.specId,
    });
  } catch (error) {
    if (error instanceof LedgerCorruptError) {
      throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The uncommitted changes are unreadable.');
    }
    throw error;
  }
  const entries = record?.entries ?? [];
  const prefix = 'specs/active/' + loaded.slug + '/';
  const idOfPath = new Map(
    loaded.manifest.documents.map((document) => [prefix + document.path, document.id]),
  );
  const view = await readDocumentCommitView(engine.context, commitSubjectOf(loaded), {
    now: resolved.now,
  });
  const { policy } = await readProjectGitPolicy(engine.context).catch(() => ({
    policy: undefined,
  }));
  const effective = policy !== undefined ? effectiveAutoCommit(policy, 'documents') : undefined;
  return {
    ledgerRevision: ledgerRevisionOf(entries),
    policy: {
      documents: effective?.auto === false ? 'manual' : 'auto',
      source: effective?.source ?? 'default',
    },
    entries: entries.map((entry) => {
      const documentId = idOfPath.get(entry.path);
      return {
        path: entry.path,
        ...(documentId !== undefined ? { documentId } : {}),
        reason: entry.reason,
        recordedAt: entry.recordedAt,
        operations: entry.operationCount,
      };
    }),
    queue: {
      pending: view.summary.pending,
      failed: view.summary.failed,
      recoveryRequired: view.summary.recoveryRequired,
    },
  };
}
