import { isExecutorIdentity } from '../durable/executor-identity';
import { exactKeys, isCount, isIsoInstant, isRecord } from '../durable/guards';
import { OPERATION_ID_PATTERN } from '../durable/journal-store';
import { ledgerOwnerOfKey } from '../durable/ledger/model';
import { manualCommitError } from './errors';
import {
  MANUAL_COMMIT_JOURNAL_MAX_BYTES,
  MANUAL_COMMIT_JOURNAL_VERSION,
  MANUAL_COMMIT_MAX_OWNERS,
  MANUAL_COMMIT_MAX_PATHS,
  MANUAL_COMMIT_OUTCOMES,
  MANUAL_COMMIT_SCOPES,
  isManualCommitStage,
  type ManualCommitJournal,
} from './model';

/** What a journal is validated against: only the project it must belong to. */
export interface ManualCommitJournalContext {
  readonly project: { readonly projectId: string };
}

const SHA256 = /^[0-9a-f]{64}$/u;
const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
const SPEC_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u;

export function invalidManualCommitJournal(): Error {
  return manualCommitError('journal-corrupt', 'A manual commit journal is corrupt.');
}

const isReason = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && KEBAB_CASE.test(value);

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

function isEvidence(value: unknown, withPathCount: boolean): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, withPathCount ? ['sha256', 'bytes', 'pathCount'] : ['sha256', 'bytes']) &&
    typeof value.sha256 === 'string' &&
    SHA256.test(value.sha256) &&
    isCount(value.bytes, 1024 * 1024) &&
    (!withPathCount || isCount(value.pathCount, MANUAL_COMMIT_MAX_PATHS * MANUAL_COMMIT_MAX_OWNERS))
  );
}

/**
 * Validates a current-format record against the operation id of its file name and the project;
 * anything else is `journal-corrupt` (fail closed). Pure.
 */
export function parseManualCommitJournal(
  context: ManualCommitJournalContext,
  value: unknown,
  operationId: string,
): ManualCommitJournal {
  if (!isRecord(value)) {
    throw invalidManualCommitJournal();
  }

  const stageOk = isManualCommitStage(value.stage);
  if (
    !exactKeys(
      value,
      [
        'version',
        'projectId',
        'operationId',
        'workspaceId',
        'workspaceRoot',
        'scope',
        'specId',
        'owners',
        'inputFingerprint',
        'stage',
        'branch',
        'snapshot',
        'message',
        'createdAt',
        'updatedAt',
        'parentHead',
        'executor',
        'commitStartedAt',
        'outcome',
        'sha',
        'pathCount',
        'reason',
        'blockedBy',
        'settledAt',
      ],
      [
        'specId',
        'parentHead',
        'executor',
        'commitStartedAt',
        'outcome',
        'sha',
        'pathCount',
        'reason',
        'blockedBy',
        'settledAt',
      ],
    ) ||
    !stageOk ||
    value.version !== MANUAL_COMMIT_JOURNAL_VERSION ||
    value.projectId !== context.project.projectId ||
    value.operationId !== operationId ||
    !OPERATION_ID_PATTERN.test(operationId) ||
    typeof value.workspaceId !== 'string' ||
    !OPERATION_ID_PATTERN.test(value.workspaceId) ||
    !isText(value.workspaceRoot, 4096) ||
    !MANUAL_COMMIT_SCOPES.includes(value.scope as never) ||
    (value.specId !== undefined &&
      !(typeof value.specId === 'string' && SPEC_ID.test(value.specId))) ||
    !Array.isArray(value.owners) ||
    value.owners.length === 0 ||
    value.owners.length > MANUAL_COMMIT_MAX_OWNERS ||
    !value.owners.every(
      (owner) => typeof owner === 'string' && ledgerOwnerOfKey(owner) !== undefined,
    ) ||
    new Set(value.owners).size !== value.owners.length ||
    typeof value.inputFingerprint !== 'string' ||
    !SHA256.test(value.inputFingerprint) ||
    !isText(value.branch, 512) ||
    !isEvidence(value.snapshot, true) ||
    !isEvidence(value.message, false) ||
    !isIsoInstant(value.createdAt) ||
    !isIsoInstant(value.updatedAt) ||
    (value.parentHead !== undefined &&
      !(typeof value.parentHead === 'string' && OBJECT_ID.test(value.parentHead))) ||
    (value.executor !== undefined && !isExecutorIdentity(value.executor)) ||
    (value.commitStartedAt !== undefined && !isIsoInstant(value.commitStartedAt)) ||
    (value.outcome !== undefined && !MANUAL_COMMIT_OUTCOMES.includes(value.outcome as never)) ||
    (value.sha !== undefined && !(typeof value.sha === 'string' && OBJECT_ID.test(value.sha))) ||
    (value.pathCount !== undefined && !isCount(value.pathCount, MANUAL_COMMIT_MAX_PATHS)) ||
    (value.reason !== undefined && !isReason(value.reason)) ||
    (value.blockedBy !== undefined && !isReason(value.blockedBy)) ||
    (value.settledAt !== undefined && !isIsoInstant(value.settledAt)) ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > MANUAL_COMMIT_JOURNAL_MAX_BYTES
  ) {
    throw invalidManualCommitJournal();
  }

  const journal = value as unknown as ManualCommitJournal;
  if (!stateIsCoherent(journal)) {
    throw invalidManualCommitJournal();
  }

  return journal;
}

/** The fields a stage requires and forbids: a record that breaks them is not one this Engine wrote. */
function stateIsCoherent(journal: ManualCommitJournal): boolean {
  switch (journal.stage) {
    case 'reserved':
      return (
        journal.executor === undefined &&
        journal.outcome === undefined &&
        journal.sha === undefined &&
        journal.commitStartedAt === undefined
      );
    case 'committing':
      return (
        journal.parentHead !== undefined &&
        journal.executor !== undefined &&
        journal.outcome === undefined &&
        journal.sha === undefined
      );
    case 'completed':
      return (
        journal.outcome !== undefined &&
        journal.executor === undefined &&
        journal.settledAt !== undefined &&
        (journal.outcome === 'committed'
          ? journal.sha !== undefined && journal.pathCount !== undefined
          : journal.sha === undefined)
      );
    case 'failed':
      return (
        journal.reason !== undefined &&
        journal.executor === undefined &&
        journal.outcome === undefined &&
        journal.sha === undefined &&
        journal.settledAt !== undefined
      );
    case 'recovery-required':
      return (
        journal.reason !== undefined &&
        journal.executor === undefined &&
        journal.outcome === undefined &&
        journal.sha === undefined
      );
  }
}
