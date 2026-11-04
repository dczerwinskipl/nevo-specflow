import { useState } from 'react';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { writeRetention } from '../writeRetention';
import { createOperationLock } from './operationLock';

/**
 * The outcome may still change and only a replay of the same operation decides it: no answer at
 * all, or an answer `writeRetention` keeps for a replay (`DOCUMENT_WRITE_FAILED`). A classified
 * refusal before anything was sent (`not-applied`) is definite.
 */
export const outcomeUnknown = (failure: unknown) => writeRetention(failure) === 'unknown';

/** Refusals after which the tree is read again (it is stale, or the Specification is read-only now). */
const refetchCodes = new Set([
  'DOCUMENT_ALREADY_CLASSIFIED',
  'DOCUMENT_REVISION_CONFLICT',
  'BRANCH_PROTECTED',
  'COMMIT_BLOCKED',
  'GIT_POLICY_INVALID',
  'SPEC_ARCHIVED',
]);

/**
 * The lifecycle every tree write shares: one operation in flight, an unknown outcome that blocks
 * everything else until it is retried, the failure message and the resume offer.
 */
export function useOperationLifecycle(options: {
  onBusyChange?: (busy: boolean) => void;
  /** Reads the tree again (after a refusal that means the tree is stale or read-only now). */
  onRefresh?: () => Promise<unknown>;
}) {
  const { onBusyChange, onRefresh } = options;
  const [lock] = useState(createOperationLock);
  const [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(''),
    [resumable, setResumable] = useState(false);

  const markBusy = (value: boolean) => {
    lock.setBusy(value);
    setBusy(value);
    onBusyChange?.(value || lock.unknown);
  };

  const setRecovery = (value: boolean) => {
    lock.setUnknown(value);
    setUnknown(value);
  };

  /**
   * The bookkeeping of every failed operation: unknown outcome (locks the tree), resume offer and
   * the tree refetch the code calls for. Returns whether the outcome is unknown.
   */
  const settleFailure = (failure: unknown) => {
    const unknownOutcome = outcomeUnknown(failure);
    setRecovery(unknownOutcome);
    const code = apiErrorCode(failure);
    setResumable(writeRetention(failure) === 'recovery');
    if (code && refetchCodes.has(code)) {
      void onRefresh?.();
    }

    return unknownOutcome;
  };

  return {
    lock,
    busy,
    unknown,
    error,
    resumable,
    markBusy,
    setRecovery,
    setError,
    setResumable,
    settleFailure,
  };
}

export type OperationLifecycle = ReturnType<typeof useOperationLifecycle>;
