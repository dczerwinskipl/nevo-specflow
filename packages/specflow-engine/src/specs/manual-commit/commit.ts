/**
 * The manual commit as one use case (ADR 0018 decision 8): validate the request, replay an operation id
 * that is known, admit, reserve and execute a new one. The caller resolves WHO the request covers
 * (`ManualCommitTarget`) and supplies the ports to the document queue; authorization is the caller's.
 */
import { OPERATION_ID_PATTERN } from '../durable/journal-store';
import {
  admitManualCommit,
  reserveManualCommit,
  type ManualCommitRequestFields,
} from './admission';
import { manualCommitError } from './errors';
import {
  doneOf,
  errorOfFailedJournal,
  executeManualCommit,
  settleEnded,
  type ManualCommitDone,
} from './execute';
import { findManualCommitJournal } from './journal-store';
import { resolveMessage } from './message';
import type { ManualCommitJournal } from './model';
import type { ManualCommitPorts, ManualCommitRuntime, ManualCommitTarget } from './runtime';
import { fingerprintOfRequest } from './selection';

/** The reservation starts over this many times when the ledger keeps moving under it. */
const MAX_ADMISSIONS = 5;

export interface ManualCommitRequest extends ManualCommitRequestFields {
  /** The person's message (see `parseUserCommitMessage`); the default message of the scope when absent. */
  readonly message?: string;
}

/**
 * The operation an id already names: the stored result of one that ended, a roll-forward of one that
 * was interrupted, a refusal that was recorded, `MANUAL_COMMIT_RECOVERY_REQUIRED` for one that needs
 * the operator. Another body with the same id is `DOCUMENT_OPERATION_CONFLICT`.
 */
async function continueExisting(
  rt: ManualCommitRuntime,
  existing: ManualCommitJournal,
  fingerprint: string,
): Promise<ManualCommitDone> {
  if (existing.inputFingerprint !== fingerprint) {
    throw manualCommitError(
      'operation-conflict',
      'This operation id was used for a different request.',
    );
  }

  switch (existing.stage) {
    case 'completed':
      await settleEnded(rt, existing);

      return doneOf(rt, existing, true);
    case 'failed':
      await settleEnded(rt, existing);

      throw errorOfFailedJournal(existing);
    case 'recovery-required':
      throw manualCommitError('recovery-required', 'The manual commit needs recovery.');
    case 'reserved':
    case 'committing':
      return executeManualCommit(rt, existing);
  }
}

export async function commitUncommitted(
  rt: ManualCommitRuntime,
  target: ManualCommitTarget,
  request: ManualCommitRequest,
  ports: ManualCommitPorts,
): Promise<ManualCommitDone> {
  if (!OPERATION_ID_PATTERN.test(request.operationId)) {
    throw manualCommitError('operation-invalid', 'A UUID operationId is required.');
  }

  const resolved = resolveMessage(request.message, { scope: target.scope, slug: target.slug });
  if (!resolved.ok) {
    throw manualCommitError('message-invalid', 'The commit message is not valid.', {
      cause: resolved.problem,
    });
  }

  const { message } = resolved;
  const fingerprint = fingerprintOfRequest({
    scope: target.scope,
    specId: target.specId,
    message: message.subject + '\n\n' + message.body,
    paths: request.paths,
    ledgerRevision: request.ledgerRevision,
  });

  const known = await findManualCommitJournal(rt.context, request.operationId);
  if (known !== undefined) {
    return continueExisting(rt, known, fingerprint);
  }

  for (let attempt = 1; attempt <= MAX_ADMISSIONS; attempt += 1) {
    const admitted = await admitManualCommit(rt, target, request, message, fingerprint, ports);
    const reserved = await reserveManualCommit(rt, admitted, request.operationId, ports);
    if (reserved.kind === 'replan') {
      continue;
    }

    if (reserved.kind === 'existing') {
      return continueExisting(rt, reserved.journal, fingerprint);
    }

    return executeManualCommit(rt, reserved.journal);
  }

  throw manualCommitError(
    'busy-commit-in-progress',
    'The uncommitted changes keep changing; retry shortly.',
    { retryAfterMs: 1000 },
  );
}
