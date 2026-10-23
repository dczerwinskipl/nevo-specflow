import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CreatedSpec, CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../api';
import { useAppServices } from '../../../app/useAppServices';
import { useNotify } from '../../../shared/notifications/notifications';
import { useUnmountSignal } from '../../../shared/operations/useUnmountSignal';
import { retainRequest } from '../../../shared/operations/retainedRequest';
import { specsOverviewKeys } from '../overview/queries';
import { projectCreationKeys } from './api/api.project';
import type { CreateFailure } from './errors/createFailure';
import { createOperationLedger } from './createOperationLedger';
import {
  createOperationReducer,
  initialCreateOperation,
  selectCreateOperationFlags,
  visibleCreateOperation,
  type CreateOperationFlags,
  type CreateOperationState,
} from './createOperationReducer';
import {
  useCreateOperationStorage,
  type SentCreateRequest,
  type StoredCreateOperation,
} from './createOperationStorage';
import { toOperationFailure } from './errors/createSpecErrors';
import { interpretWatchResult } from './interpretWatchResult';
import {
  createStreamHints,
  readOperation,
  resumeCreateOperation,
  submitCreateOperation,
  type CreateWatchResult,
  type StreamHint,
} from './watchCreateOperation';

/** Everything the form contributes to one submit, captured when the user submits. */
export interface ProjectSubmission {
  title: string;
  goal: string;
  /** Real slug override the owner typed (never an untouched default), else undefined. */
  slug?: string;
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
  /**
   * The operation was opened by its id alone (no request is retained here) and the server has no
   * record of it: nothing is running and there is nothing to resume.
   */
  unknownOperation: boolean;
  actions: {
    /**
     * Starts the operation, or (after an unknown outcome) first asks the server what became of it:
     * a finished one is opened, a running one is watched and only an operation the server never
     * saw is sent again, with the same identifier.
     */
    submit: (submission: ProjectSubmission) => Promise<void>;
    /**
     * The status check of an unknown outcome (or of a recovery-required one) without the form: it
     * asks the server what became of the operation, never starting a different one.
     */
    check: () => Promise<void>;
    /** Tries a failed operation again, asking the server first (see the implementation). */
    retry: () => Promise<void>;
    /** Retires the alert of a definite failure (never an unknown outcome). */
    dismissFailure: () => void;
    /** Sync read for the leave guard: completing the operation navigates away on purpose. */
    isNavigationAllowed: () => boolean;
    /**
     * What the live progress stream says (display aid, best effort). It only decides how soon the
     * inspection endpoint is read again; it never changes the state of the operation.
     */
    setStreamHint: (hint: StreamHint) => void;
  };
}

export interface UseCreateProjectSpecificationOptions {
  /** The operation a reloaded page found unconfirmed; it resumes watching it. */
  stored: StoredCreateOperation | undefined;
  /**
   * Opens an operation this page holds no request for (a direct link, cleared storage): the server
   * is asked what it knows and the answer is watched. Ignored when `stored` is given.
   */
  operationId?: string;
  /** Current form fingerprint (see {@link ProjectSubmission.snapshot}). */
  snapshot: string;
  onCreated: (created: CreatedSpec) => void;
  /** Polite live-region announcement. */
  announce: (message: string) => void;
}

/** The shared ledger seeded with the stored operation, plus the progress-stream hints. */
function createProjectLedger(stored: StoredCreateOperation | undefined) {
  const { operationId: _id, ...body } = stored?.request ?? {};
  return {
    ...createOperationLedger<SentCreateRequest>(
      stored ? { signature: JSON.stringify(body), input: stored.request } : null,
      stored?.startedAt,
    ),
    resumed: false,
    stream: createStreamHints(),
  };
}

/**
 * A reloaded page starts as an unknown outcome that is being checked (never assumed), so it is
 * already "submitting" in its first render: no frame shows an unconfirmed-outcome alert for an
 * operation the page is just about to read.
 */
function stateOfStored(seed: {
  stored: StoredCreateOperation | undefined;
  operationId: string | undefined;
}): CreateOperationState {
  const { stored, operationId } = seed;
  if (!stored && !operationId) return initialCreateOperation;
  const request = stored?.request ?? {
    operationId: operationId ?? '',
    title: '',
    target: undefined,
  };
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
    { type: 'submit-started' as const },
  ].reduce(createOperationReducer, initialCreateOperation);
}

type Settling = Pick<ProjectSubmission, 'snapshot' | 'onFailed'>;

/**
 * Orchestrates Create against the project Runtime: one retained operation id per distinct request,
 * async submit (202) followed by inspection polling (hint from the progress stream, hard limit), the
 * check of an unknown outcome and the resume of a persisted operation after a reload. State
 * transitions are decided by `createOperationReducer` and what a result means by
 * `interpretWatchResult`; this hook only performs the I/O and reports each result as an event.
 */
export function useCreateProjectSpecification(
  options: UseCreateProjectSpecificationOptions,
): ProjectCreateModel {
  const { stored, operationId, snapshot, onCreated, announce } = options;
  const { t } = useTranslation();
  const { projectCreationApi: api } = useAppServices();
  const storage = useCreateOperationStorage();
  const cache = useQueryClient();
  const notify = useNotify();
  const [raw, dispatch] = useReducer(
    createOperationReducer,
    { stored, operationId },
    stateOfStored,
  );
  const [unknownOperation, setUnknownOperation] = useState(false);
  const [ledger] = useState(() => createProjectLedger(stored));
  // The request is never cancelled when the page goes away (the server finishes it and the journal
  // keeps it); only the watching stops.
  const lifetime = useUnmountSignal();
  const state = useMemo(() => visibleCreateOperation(raw, snapshot), [raw, snapshot]);

  const onAccepted = useCallback(() => {
    dispatch({ type: 'submit-accepted' });
    announce(t('create.announce.monitoring'));
  }, [announce, t]);

  const finish = useCallback(
    (result: CreateWatchResult, submission: Settling) => {
      // The page is gone: nothing may navigate or publish for it; the stored operation stays.
      if (lifetime.aborted) return;
      const sentTarget = ledger.attempt.current?.input.target;
      // The ledger entry of this operation only: another operation's entry is never touched.
      const id = ledger.attempt.current?.input.operationId ?? operationId;
      const outcome = interpretWatchResult(result, {
        customBranch: sentTarget?.kind === 'new-worktree' ? sentTarget.branch : undefined,
        newWorkspace: sentTarget?.kind === 'new-worktree',
      });
      if (outcome.kind === 'completed') {
        if (id) {
          storage.clear(id);
          storage.clearDraft(id);
        }
        ledger.navigationAllowed = true;
        void cache.invalidateQueries({ queryKey: specsOverviewKeys.all });
        void cache.invalidateQueries({ queryKey: projectCreationKeys.createOptions });
        notify(t('create.specificationCreated'));
        dispatch({ type: 'submit-succeeded' });
        onCreated(outcome.created);
        return;
      }
      if (outcome.announce) announce(t(`create.announce.${outcome.announce}`));
      if (outcome.releaseStorage && id) storage.clear(id);
      if (outcome.discardAttempt) ledger.attempt.current = null;
      if (outcome.releaseStorage) submission.onFailed?.(outcome.failure);
      dispatch({
        type: 'submit-failed',
        failure: { ...outcome.failure, snapshot: submission.snapshot },
        discardSent: outcome.discardAttempt,
        retained: !outcome.releaseStorage,
      });
    },
    [announce, cache, ledger, lifetime, notify, onCreated, operationId, storage, t],
  );

  const hooksOf = useCallback(
    () => ({ onAccepted, signal: lifetime, stream: ledger.stream }),
    [ledger, lifetime, onAccepted],
  );

  /** Asks the server about a sent operation and acts on the answer (see `submit`). */
  const resolveUnknown = useCallback(
    async (submission: Settling) => {
      const input = ledger.attempt.current?.input;
      const id = input?.operationId ?? operationId;
      if (!id) return;
      const reading = await readOperation(api, id, lifetime);
      if (reading.kind === 'completed') return finish(reading, submission);
      if (reading.kind === 'recovery-required') return finish(reading, submission);
      if (reading.kind === 'failed')
        return finish({ kind: 'operation-failed', code: reading.code }, submission);
      if (reading.kind === 'unreadable') {
        // The check itself failed: the earlier unknown outcome is unchanged.
        if (isApiError(reading.error) && reading.error.kind === 'network')
          dispatch({ type: 'submit-offline-replay' });
        else finish({ kind: 'unresolved', error: reading.error }, submission);
        return;
      }
      if (reading.kind === 'in-progress') {
        onAccepted();
        return finish(
          await resumeCreateOperation(api, id, {
            startedAt: ledger.startedAt,
            hooks: hooksOf(),
          }),
          submission,
        );
      }
      // Without a retained request there is nothing to send: the operation simply does not exist.
      if (!input) {
        if (!lifetime.aborted) setUnknownOperation(true);
        return finish({ kind: 'not-started' }, submission);
      }
      // The Engine has no record: the request never arrived, so sending it again (same id) is safe.
      return finish(await submitCreateOperation(api, input, hooksOf()), submission);
    },
    [api, finish, hooksOf, ledger, lifetime, onAccepted, operationId],
  );

  // A reloaded page resumes the operation it found stored.
  useEffect(() => {
    if ((!stored && !operationId) || ledger.resumed) return;
    ledger.resumed = true;
    ledger.begin();
    void resolveUnknown({ snapshot: '' }).finally(() => ledger.end());
  }, [ledger, operationId, resolveUnknown, stored]);

  /** The status check of a `recovery-required` operation (it has no replay). */
  const checkRecovery = useCallback(
    async (submission: ProjectSubmission) => {
      dispatch({ type: 'check-started' });
      const id = ledger.attempt.current?.input.operationId ?? operationId;
      const reading = id ? await readOperation(api, id, lifetime) : undefined;
      if (lifetime.aborted) return;
      if (reading?.kind === 'completed') {
        dispatch({ type: 'check-found-completed' });
        return finish(reading, submission);
      }
      if (reading?.kind === 'failed') {
        const failure = toOperationFailure(reading.code);
        if (failure.kind === 'uncertain' || failure.kind === 'recovery-required')
          dispatch({ type: 'check-still-open', status: { status: 'failed' } });
        else
          dispatch({
            type: 'check-failed-operation',
            status: { status: 'failed' },
            snapshot: submission.snapshot,
            failure,
          });
      } else if (reading?.kind === 'in-progress' || reading?.kind === 'recovery-required')
        dispatch({ type: 'check-still-open', status: { status: reading.kind } });
      else if (reading?.kind === 'not-started')
        dispatch({
          type: 'check-not-started',
          status: { status: 'not-started' },
          snapshot: submission.snapshot,
        });
      else dispatch({ type: 'check-unreadable' });
    },
    [api, finish, ledger, lifetime, operationId],
  );

  const start = useCallback(
    async (submission: ProjectSubmission) => {
      let input: SentCreateRequest;
      try {
        const target = submission.buildTarget();
        const goal = submission.goal.trim();
        input = retainRequest<SentCreateRequest, 'operationId'>(
          ledger.attempt,
          {
            title: submission.title.trim(),
            ...(goal ? { goal } : {}),
            ...(submission.slug ? { slug: submission.slug } : {}),
            ...(target ? { target } : {}),
          },
          undefined,
          'operationId',
        );
      } catch {
        // Nothing was sent, so this is a definite failure and the form stays usable.
        const failure: CreateFailure = { kind: 'failed' };
        submission.onFailed?.(failure);
        dispatch({ type: 'submit-failed', failure: { ...failure, snapshot: submission.snapshot } });
        return;
      }
      ledger.startedAt = Date.now();
      storage.save({ request: input, startedAt: ledger.startedAt });
      dispatch({
        type: 'request-prepared',
        sent: { operationId: input.operationId, title: input.title, target: input.target },
      });
      finish(await submitCreateOperation(api, input, hooksOf()), submission);
    },
    [api, finish, hooksOf, ledger, storage],
  );

  const submit = useCallback(
    async (submission: ProjectSubmission) => {
      const { phase } = state;
      if (phase === 'submitting' || phase === 'monitoring' || phase === 'completed') return;
      if (!ledger.begin()) return;
      try {
        if (phase === 'recovery-required') {
          if (!state.checking) await checkRecovery(submission);
          return;
        }
        dispatch({ type: 'submit-started' });
        if (phase === 'outcome-unknown') await resolveUnknown(submission);
        else await start(submission);
      } finally {
        ledger.end();
      }
    },
    [checkRecovery, ledger, resolveUnknown, start, state],
  );

  const check = useCallback(
    () => submit({ title: '', goal: '', buildTarget: () => undefined, snapshot: '' }),
    [submit],
  );

  /**
   * Tries a failed operation again: the server is asked first, so it is never started twice. Only
   * for a failure that kept the operation (a lost session, for instance); a refusal ends it.
   */
  const retry = useCallback(async () => {
    if (state.phase !== 'failed' || !ledger.begin()) return;
    try {
      dispatch({ type: 'submit-started' });
      await resolveUnknown({ snapshot: '' });
    } finally {
      ledger.end();
    }
  }, [ledger, resolveUnknown, state.phase]);

  const dismissFailure = useCallback(() => dispatch({ type: 'failure-dismissed' }), []);
  const isNavigationAllowed = useCallback(() => ledger.navigationAllowed, [ledger]);
  const setStreamHint = useCallback((hint: StreamHint) => ledger.stream.set(hint), [ledger]);
  const actions = useMemo(
    () => ({ submit, check, retry, dismissFailure, isNavigationAllowed, setStreamHint }),
    [submit, check, retry, dismissFailure, isNavigationAllowed, setStreamHint],
  );
  const flags = useMemo(() => selectCreateOperationFlags(state), [state]);
  return useMemo(
    () => ({ state, flags, unknownOperation, actions }),
    [state, flags, unknownOperation, actions],
  );
}
