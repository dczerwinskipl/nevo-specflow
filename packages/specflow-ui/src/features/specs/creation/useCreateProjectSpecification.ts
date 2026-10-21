import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CreatedSpec, CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../api';
import { useAppServices } from '../../../app/useAppServices';
import { useNotify } from '../../../shared/notifications/notifications';
import { retainRequest, type RequestAttempt } from '../../../shared/operations/retainedRequest';
import { specsOverviewKeys } from '../overview/queries';
import { projectCreationKeys } from './api.project';
import { toCreateFailure } from './createSpecErrors';
import type { CreateFailure } from './createFailure';
import {
  createOperationReducer,
  initialCreateOperation,
  selectCreateOperationFlags,
  type CreateOperationFlags,
  type CreateOperationState,
} from './createOperationReducer';
import {
  useCreateOperationStorage,
  type SentCreateRequest,
  type StoredCreateOperation,
} from './createOperationStorage';
import {
  readOperation,
  resumeCreateOperation,
  submitCreateOperation,
  type CreateWatchResult,
} from './watchCreateOperation';

/** Everything the form contributes to one submit, captured when the user submits. */
export interface ProjectSubmission {
  title: string;
  goal: string;
  /** Lazy: a replay never rebuilds the target, so it must not be evaluated for one. */
  buildTarget: () => CreateSpecRequest['target'] | undefined;
  /** Fingerprint of the form, so editing it retires the alert of a definite failure. */
  snapshot: string;
  /** Called synchronously with a definite failure, just before it is published. */
  onFailed?: (failure: CreateFailure) => void;
}

export interface ProjectCreateModel {
  state: CreateOperationState;
  flags: CreateOperationFlags;
  actions: {
    /**
     * Starts the operation, or (after an unknown outcome) first asks the server what became of it:
     * a finished one is opened, a running one is watched and only an operation the server never
     * saw is sent again, with the same identifier.
     */
    submit: (submission: ProjectSubmission) => Promise<void>;
    /** Retires the alert of a definite failure (never an unknown outcome). */
    dismissFailure: () => void;
    /** Sync read for the leave guard: completing the operation navigates away on purpose. */
    isNavigationAllowed: () => boolean;
  };
}

export interface UseCreateProjectSpecificationOptions {
  /** The operation a reloaded page found unconfirmed; it resumes watching it. */
  stored: StoredCreateOperation | undefined;
  /** Current form fingerprint (see {@link ProjectSubmission.snapshot}). */
  snapshot: string;
  onCreated: (created: CreatedSpec) => void;
  /** Polite live-region announcement. */
  announce: (message: string) => void;
}

interface Ledger {
  attempt: { current: RequestAttempt<SentCreateRequest> | null };
  startedAt: number | undefined;
  navigationAllowed: boolean;
  resumed: boolean;
  inFlight: boolean;
}

function createLedger(stored: StoredCreateOperation | undefined): Ledger {
  const { operationId: _id, ...body } = stored?.request ?? {};
  return {
    attempt: {
      current: stored ? { signature: JSON.stringify(body), input: stored.request } : null,
    },
    startedAt: stored?.startedAt,
    navigationAllowed: false,
    resumed: false,
    inFlight: false,
  };
}

/** A reloaded page starts as an unknown outcome: the operation is checked, never assumed. */
function stateOfStored(stored: StoredCreateOperation | undefined): CreateOperationState {
  if (!stored) return initialCreateOperation;
  const { request } = stored;
  return [
    { type: 'submit-started' as const },
    {
      type: 'request-prepared' as const,
      sent: { operationId: request.operationId, title: request.title, target: request.target },
    },
    {
      type: 'submit-failed' as const,
      failure: { kind: 'uncertain' as const, snapshot: '' },
    },
  ].reduce(createOperationReducer, initialCreateOperation);
}

/**
 * Orchestrates Create against the project Runtime: one retained operation id per distinct request,
 * long-running watching (soft deadline, hard limit), the check of an unknown outcome and the
 * resume of a persisted operation after a reload. State transitions are decided by
 * `createOperationReducer`; this hook only performs the I/O and reports each result as an event.
 */
export function useCreateProjectSpecification(
  options: UseCreateProjectSpecificationOptions,
): ProjectCreateModel {
  const { stored, snapshot, onCreated, announce } = options;
  const { t } = useTranslation();
  const { projectCreationApi: api } = useAppServices();
  const storage = useCreateOperationStorage();
  const cache = useQueryClient();
  const notify = useNotify();
  const [state, dispatch] = useReducer(createOperationReducer, stored, stateOfStored);
  const [ledger] = useState(() => createLedger(stored));
  const [lifetime] = useState(() => new AbortController());
  const mounted = useRef(false);

  // The page may unmount while an operation runs: the request is never cancelled (the server
  // finishes it and the journal keeps it), only the watching stops. StrictMode remounts at once,
  // so a real unmount is the one that is still unmounted after the current task.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) lifetime.abort();
      }, 0);
    };
  }, [lifetime]);

  // A conflict describes the attempt that produced it: editing the form retires its alert.
  useEffect(() => {
    dispatch({ type: 'form-edited', snapshot });
  }, [state.failure, snapshot]);

  const onMonitoring = useCallback(() => {
    dispatch({ type: 'monitoring-started' });
    announce(t('create.announce.monitoring'));
  }, [announce, t]);

  const finish = useCallback(
    (
      result: CreateWatchResult,
      submission: { snapshot: string; onFailed?: (f: CreateFailure) => void },
    ) => {
      // The page is gone: nothing may navigate or publish for it; the stored operation stays.
      if (lifetime.signal.aborted) return;
      if (result.kind === 'completed') {
        storage.clear();
        ledger.navigationAllowed = true;
        void cache.invalidateQueries({ queryKey: specsOverviewKeys.all });
        void cache.invalidateQueries({ queryKey: projectCreationKeys.createOptions });
        notify(t('create.specificationCreated'));
        dispatch({ type: 'submit-succeeded' });
        onCreated(result.created);
        return;
      }
      let failure: CreateFailure;
      let discardSent = false;
      if (result.kind === 'recovery-required') {
        failure = { kind: 'recovery-required' };
      } else if (result.kind === 'not-started') {
        announce(t('create.announce.notStarted'));
        failure = { kind: 'uncertain' };
      } else if (result.kind === 'unresolved') {
        failure = isApiError(result.error) ? toCreateFailure(result.error) : { kind: 'uncertain' };
        if (failure.kind !== 'uncertain' && failure.kind !== 'recovery-required')
          failure = { kind: 'uncertain' };
      } else {
        // A definite refusal: nothing was created, so the stored operation is released.
        const sentTarget = ledger.attempt.current?.input.target;
        failure = isApiError(result.error)
          ? toCreateFailure(result.error, {
              customBranch: sentTarget?.kind === 'new-worktree' ? sentTarget.branch : undefined,
            })
          : { kind: 'failed' };
        storage.clear();
        discardSent = failure.kind === 'operation-conflict' || failure.kind === 'name-conflict';
        if (discardSent) ledger.attempt.current = null;
        submission.onFailed?.(failure);
      }
      dispatch({
        type: 'submit-failed',
        failure: { ...failure, snapshot: submission.snapshot },
        discardSent,
      });
    },
    [announce, cache, ledger, lifetime, notify, onCreated, storage, t],
  );

  /** Asks the server about a sent operation and acts on the answer (see `submit`). */
  const resolveUnknown = useCallback(
    async (submission: { snapshot: string; onFailed?: (f: CreateFailure) => void }) => {
      const input = ledger.attempt.current?.input;
      if (!input) return;
      const reading = await readOperation(api, input.operationId, lifetime.signal);
      if (reading.kind === 'completed') return finish(reading, submission);
      if (reading.kind === 'recovery-required') return finish(reading, submission);
      if (reading.kind === 'unreadable') {
        // The check itself failed: the earlier unknown outcome is unchanged.
        if (isApiError(reading.error) && reading.error.kind === 'network')
          dispatch({ type: 'submit-offline-replay' });
        else finish({ kind: 'unresolved', error: reading.error }, submission);
        return;
      }
      if (reading.kind === 'in-progress') {
        onMonitoring();
        return finish(
          await resumeCreateOperation(api, input.operationId, {
            startedAt: ledger.startedAt,
            hooks: { signal: lifetime.signal },
          }),
          submission,
        );
      }
      // The Engine has no record: the request never arrived, so sending it again (same id) is safe.
      return finish(
        await submitCreateOperation(api, input, { onMonitoring, signal: lifetime.signal }),
        submission,
      );
    },
    [api, finish, ledger, lifetime, onMonitoring],
  );

  // A reloaded page resumes the operation it found stored.
  useEffect(() => {
    if (!stored || ledger.resumed) return;
    ledger.resumed = true;
    ledger.inFlight = true;
    dispatch({ type: 'submit-started' });
    void resolveUnknown({ snapshot: '' }).finally(() => {
      ledger.inFlight = false;
    });
  }, [ledger, resolveUnknown, stored]);

  /** The status check of a `recovery-required` operation (it has no replay). */
  const checkRecovery = useCallback(
    async (submission: ProjectSubmission) => {
      dispatch({ type: 'check-started' });
      const input = ledger.attempt.current?.input;
      const reading = input
        ? await readOperation(api, input.operationId, lifetime.signal)
        : undefined;
      if (lifetime.signal.aborted) return;
      if (reading?.kind === 'completed') {
        dispatch({ type: 'check-found-completed' });
        return finish(reading, submission);
      }
      if (reading?.kind === 'in-progress' || reading?.kind === 'recovery-required')
        dispatch({ type: 'check-still-open', status: { status: reading.kind } });
      else if (reading?.kind === 'not-started')
        dispatch({
          type: 'check-not-started',
          status: { status: 'not-started' },
          snapshot: submission.snapshot,
        });
      else dispatch({ type: 'check-unreadable' });
    },
    [api, finish, ledger, lifetime],
  );

  const start = useCallback(
    async (submission: ProjectSubmission) => {
      const target = submission.buildTarget();
      const goal = submission.goal.trim();
      const input = retainRequest<SentCreateRequest, 'operationId'>(
        ledger.attempt,
        {
          title: submission.title.trim(),
          ...(goal ? { goal } : {}),
          ...(target ? { target } : {}),
        },
        undefined,
        'operationId',
      );
      ledger.startedAt = Date.now();
      storage.save({ request: input, startedAt: ledger.startedAt });
      dispatch({
        type: 'request-prepared',
        sent: { operationId: input.operationId, title: input.title, target: input.target },
      });
      finish(
        await submitCreateOperation(api, input, { onMonitoring, signal: lifetime.signal }),
        submission,
      );
    },
    [api, finish, ledger, lifetime, onMonitoring, storage],
  );

  const submit = useCallback(
    async (submission: ProjectSubmission) => {
      if (ledger.inFlight) return;
      const { phase } = state;
      if (phase === 'submitting' || phase === 'monitoring' || phase === 'completed') return;
      ledger.inFlight = true;
      try {
        if (phase === 'recovery-required') {
          if (!state.checking) await checkRecovery(submission);
          return;
        }
        dispatch({ type: 'submit-started' });
        if (phase === 'outcome-unknown') await resolveUnknown(submission);
        else await start(submission);
      } finally {
        ledger.inFlight = false;
      }
    },
    [checkRecovery, ledger, resolveUnknown, start, state],
  );

  const dismissFailure = useCallback(() => dispatch({ type: 'failure-dismissed' }), []);
  const isNavigationAllowed = useCallback(() => ledger.navigationAllowed, [ledger]);
  const actions = useMemo(
    () => ({ submit, dismissFailure, isNavigationAllowed }),
    [submit, dismissFailure, isNavigationAllowed],
  );
  const flags = useMemo(() => selectCreateOperationFlags(state), [state]);
  return useMemo(() => ({ state, flags, actions }), [state, flags, actions]);
}
