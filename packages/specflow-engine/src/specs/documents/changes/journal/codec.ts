import { UNCOMMITTED_REASONS } from '@nevo/specflow-contracts/documents';

import { isExplicitSpecificationSlug } from '../../../model';
import { documentChangeError } from '../errors';
import {
  DOCUMENT_BATCH_MAX_PATHS,
  DOCUMENT_JOURNAL_MAX_BYTES,
  DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT,
} from '../limits';
import { DOCUMENT_CHANGE_ACTIONS } from '../plan/model';
import {
  DOCUMENT_CHANGE_JOURNAL_VERSION,
  DOCUMENT_CHANGE_OUTCOMES,
  DOCUMENT_COMMIT_MODES,
  type DocumentChangeJournal,
  type DocumentChangeOutcome,
} from './model';
import {
  OBJECT_ID,
  SHA256,
  UUID,
  exactKeys,
  isCount,
  isExecutorIdentity,
  isIsoInstant,
  isReason,
  isRecord,
} from './shared';
import { DOCUMENT_RECOVERY_PHASES, isDocumentChangeStage, isWriterStage } from './stages';

/** What a journal is validated against: only the project it must belong to. */
export interface JournalContext {
  readonly project: { readonly projectId: string };
}

const KEYS = [
  'version',
  'projectId',
  'operationId',
  'specId',
  'slug',
  'workspaceId',
  'workspaceRoot',
  'action',
  'inputFingerprint',
  'sequence',
  'createdAt',
  'updatedAt',
  'stage',
  'plan',
  'commit',
  'commitMode',
  'executor',
  'recoveryPhase',
  'queuedAt',
  'batchId',
  'attempts',
  'nextAttemptAt',
  'reason',
  'blockedBy',
  'outcome',
  'sha',
  'coalescedWith',
  'settledAt',
];
const OPTIONAL_KEYS = [
  'commit',
  'commitMode',
  'executor',
  'recoveryPhase',
  'queuedAt',
  'batchId',
  'nextAttemptAt',
  'reason',
  'blockedBy',
  'outcome',
  'sha',
  'coalescedWith',
  'settledAt',
];
const SPEC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** Attempts are bounded far above the documented 10, so a bug cannot grow the file. */
const ATTEMPTS_MAX = 1000;

export function invalidDocumentChangeJournal(): Error {
  return documentChangeError(
    'journal-corrupt',
    'The document operation journal is corrupt or redirected. Operator recovery is required.',
  );
}

export function unsupportedDocumentChangeJournal(): Error {
  return documentChangeError(
    'journal-unsupported',
    'The document operation journal is of an unsupported format and cannot be interpreted.',
  );
}

/**
 * Strict decode of a current-format journal: closed key set, every field typed, and the stage
 * decides which fields must or must not exist. Returns the value as it was serialised.
 */
export function parseDocumentChangeJournal(
  context: JournalContext,
  value: unknown,
  operationId: string,
): DocumentChangeJournal {
  if (
    !isRecord(value) ||
    !exactKeys(value, KEYS, OPTIONAL_KEYS) ||
    !isValidIdentity(context, value, operationId) ||
    !isValidPlanEvidence(value.plan) ||
    !isValidStageFields(value) ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > DOCUMENT_JOURNAL_MAX_BYTES
  ) {
    throw invalidDocumentChangeJournal();
  }

  return value as unknown as DocumentChangeJournal;
}

/** The text a journal is stored as; the same validation as a read, so only readable records are written. */
export function encodeDocumentChangeJournal(
  context: JournalContext,
  journal: DocumentChangeJournal,
): string {
  parseDocumentChangeJournal(context, journal, journal.operationId);

  return JSON.stringify(journal);
}

function isValidIdentity(
  context: JournalContext,
  value: Record<string, unknown>,
  operationId: string,
): boolean {
  return (
    value.version === DOCUMENT_CHANGE_JOURNAL_VERSION &&
    value.projectId === context.project.projectId &&
    value.operationId === operationId &&
    UUID.test(operationId) &&
    typeof value.specId === 'string' &&
    SPEC_ID.test(value.specId) &&
    isExplicitSpecificationSlug(value.slug) &&
    typeof value.workspaceId === 'string' &&
    UUID.test(value.workspaceId) &&
    typeof value.workspaceRoot === 'string' &&
    value.workspaceRoot.length > 0 &&
    value.workspaceRoot.length <= 1024 &&
    typeof value.action === 'string' &&
    (DOCUMENT_CHANGE_ACTIONS as readonly string[]).includes(value.action) &&
    typeof value.inputFingerprint === 'string' &&
    SHA256.test(value.inputFingerprint) &&
    typeof value.sequence === 'number' &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 1 &&
    isIsoInstant(value.createdAt) &&
    isIsoInstant(value.updatedAt) &&
    isDocumentChangeStage(value.stage) &&
    isCount(value.attempts, ATTEMPTS_MAX)
  );
}

function isValidPlanEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ['sha256', 'bytes', 'pathCount', 'documentCount']) &&
    typeof value.sha256 === 'string' &&
    SHA256.test(value.sha256) &&
    isCount(value.bytes, Number.MAX_SAFE_INTEGER) &&
    isCount(value.pathCount, DOCUMENT_BATCH_MAX_PATHS) &&
    isCount(value.documentCount, DOCUMENT_BATCH_MAX_PATHS)
  );
}

/** Which optional fields a stage requires, allows or forbids. */
function isValidStageFields(value: Record<string, unknown>): boolean {
  const stage = value.stage;
  if (!isDocumentChangeStage(stage)) {
    return false;
  }

  const has = (key: string): boolean => value[key] !== undefined;

  if (has('commit')) {
    const commit = value.commit;
    if (
      !isRecord(commit) ||
      !exactKeys(commit, ['branch']) ||
      typeof commit.branch !== 'string' ||
      commit.branch.length === 0 ||
      commit.branch.length > 240
    ) {
      return false;
    }
  }

  if (has('commitMode')) {
    if (!(DOCUMENT_COMMIT_MODES as readonly unknown[]).includes(value.commitMode)) {
      return false;
    }

    // `auto` pins the branch of its commit; `manual` ran no preflight, so it has no commit and never queues.
    if ((value.commitMode === 'auto') !== has('commit')) {
      return false;
    }

    if (value.commitMode === 'manual' && (stage === 'queued' || stage === 'committing')) {
      return false;
    }

    if (value.commitMode === 'manual' && stage === 'commit-failed') {
      return false;
    }
  }

  if (has('executor') !== isWriterStage(stage)) {
    return false;
  }

  if (has('executor') && !isExecutorIdentity(value.executor)) {
    return false;
  }

  if (has('recoveryPhase') !== (stage === 'recovery-required')) {
    return false;
  }

  if (
    has('recoveryPhase') &&
    !(DOCUMENT_RECOVERY_PHASES as readonly unknown[]).includes(value.recoveryPhase)
  ) {
    return false;
  }

  // The acknowledgement time exists exactly from `queued` on; a write-phase recovery or a refusal
  // before it never had one.
  const acknowledged = stage === 'queued' || stage === 'committing' || stage === 'commit-failed';
  const neverAcknowledged = isWriterStage(stage) || stage === 'failed';
  if (acknowledged && !isIsoInstant(value.queuedAt)) {
    return false;
  }

  if (neverAcknowledged && has('queuedAt')) {
    return false;
  }

  if (has('queuedAt') && !isIsoInstant(value.queuedAt)) {
    return false;
  }

  if (has('batchId')) {
    if (typeof value.batchId !== 'string' || !UUID.test(value.batchId) || neverAcknowledged) {
      return false;
    }
  }

  if (stage === 'committing' && !has('batchId')) {
    return false;
  }

  // A queued operation belongs to no claimed batch; a dissolve removes the id.
  if (stage === 'queued' && has('batchId')) {
    return false;
  }

  if (stage === 'committing' && !has('commit')) {
    return false;
  }

  if (has('nextAttemptAt') && (!isIsoInstant(value.nextAttemptAt) || stage !== 'queued')) {
    return false;
  }

  if (has('reason') && !isReason(value.reason)) {
    return false;
  }

  if (has('blockedBy') && !isReason(value.blockedBy)) {
    return false;
  }

  const needsReason =
    stage === 'failed' || stage === 'commit-failed' || stage === 'recovery-required';
  if (needsReason && !has('reason')) {
    return false;
  }

  if (has('blockedBy') && !has('reason')) {
    return false;
  }

  const completed = stage === 'completed';
  if (has('outcome') !== completed || has('settledAt') !== completed) {
    return false;
  }

  if (completed) {
    if (
      !(DOCUMENT_CHANGE_OUTCOMES as readonly unknown[]).includes(value.outcome) ||
      !isIsoInstant(value.settledAt)
    ) {
      return false;
    }

    const outcome = value.outcome as DocumentChangeOutcome;
    if (outcome === 'committed') {
      if (typeof value.sha !== 'string' || !OBJECT_ID.test(value.sha) || !has('commit')) {
        return false;
      }
    } else if (outcome === 'uncommitted') {
      if (
        has('sha') ||
        !(UNCOMMITTED_REASONS as readonly string[]).includes(value.reason as string)
      ) {
        return false;
      }
    } else if (has('sha') || !has('reason')) {
      return false;
    }
  } else if (has('sha')) {
    return false;
  }

  return (
    !has('coalescedWith') ||
    (completed && isCount(value.coalescedWith, DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT))
  );
}
