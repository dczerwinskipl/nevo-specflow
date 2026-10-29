import { useCallback, useMemo, useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { DemoCreateRequest, DemoSessionInput } from '@nevo/specflow-contracts/demo';
import { useAppServices } from '../../../../app/useAppServices';
import { useNotify } from '../../../../shared/notifications/notifications';
import { retainRequest, type RequestAttempt } from '../../../../shared/operations/retainedRequest';
import { useRequestSessionRecovery } from '../../../sessions';
import { specsOverviewKeys } from '../../overview/data/queries';
import { specificationKeys } from '../../read-model/queries';
import {
  continueDemoCreation,
  RequestNotSentError,
  type CreationProgress,
} from './creationPipeline';
import { createOperationLedger } from './createOperationLedger';
import {
  createOperationReducer,
  initialCreateOperation,
  selectCreateOperationFlags,
  visibleCreateOperation,
  type CreateOperationFlags,
  type CreateOperationState,
  type UnknownPhase,
} from './createOperationReducer';
import { classifyDemoCreateFailure } from '../errors/classifyDemoCreateFailure';
import type { CreateFailure } from '../errors/createFailure';

/** Everything the form contributes to one submit, captured when the user submits. */
export interface CreateSubmission {
  title: string;
  archetype: {
    id: string;
    version: DemoCreateRequest['archetypeVersion'];
    /** The ticked optional templates of the archetype. */
    optionalDocumentIds: readonly string[];
  };
  /** Real slug override the owner typed (never an untouched default), else undefined. */
  slug?: string;
  /** Lazy: a replay never rebuilds the target, so it must not be evaluated for one. */
  buildTarget: () => DemoCreateRequest['target'] | undefined;
  /** Present for the agent path: the initial Session requested together with the specification. */
  session?: Omit<DemoSessionInput, 'requestId' | 'catalogueRevision'>;
  /** Fingerprint of the form, so editing it retires the alert of a definite failure. */
  snapshot: string;
  /**
   * Called synchronously with a definite failure, just before it is published, so the form can
   * react (for example open the branch settings) in the same render as the alert.
   */
  onFailed?: (failure: CreateFailure) => void;
}

export type CreateSubmitOutcome =
  | { kind: 'ignored' }
  | { kind: 'completed' }
  | { kind: 'failed'; failure: CreateFailure }
  /** The status check was made; when it found the operation completed, `resumed` is the replay. */
  | { kind: 'checked'; resumed?: CreateSubmitOutcome };

export interface CreateSpecificationActions {
  /**
   * Starts, replays or (in `recovery-required`) status-checks the operation, whichever the current
   * phase calls for. Resolves with how that attempt ended.
   */
  submit: (submission: CreateSubmission) => Promise<CreateSubmitOutcome>;
  /** Retires the alert of a definite failure (never an unknown outcome). */
  dismissFailure: () => void;
  /** Sync read for the leave guard: completing the operation navigates away on purpose. */
  isNavigationAllowed: () => boolean;
}

export interface CreateSpecificationModel {
  state: CreateOperationState;
  flags: CreateOperationFlags;
  actions: CreateSpecificationActions;
}

export interface UseCreateSpecificationOptions {
  /** Present when only a Session is created for an existing specification. */
  specId?: string;
  catalogueRevision: DemoCreateRequest['catalogueRevision'];
  /** Current form fingerprint (see {@link CreateSubmission.snapshot}). */
  snapshot: string;
  onCreated: (id: string, document?: string) => void;
  onSession: (spec: string, session: string) => void;
  /** Polite live-region announcement. */
  announce: (message: string) => void;
}

/** The shared ledger plus what only the demo flow retains: the Session request and the committed result. */
function createDemoLedger() {
  return {
    ...createOperationLedger<DemoCreateRequest>(),
    sessionAttempt: { current: null } as { current: RequestAttempt<DemoSessionInput> | null },
    progress: {} as CreationProgress,
  };
}

/**
 * Orchestrates the Create operation: retained requests, replay of an unknown outcome, status check
 * and the optional initial Session. State transitions are decided by `createOperationReducer`;
 * this hook only performs the I/O and reports each result as an event. Effects exist for
 * synchronisation only.
 */
export function useCreateDemoSpecification(
  options: UseCreateSpecificationOptions,
): CreateSpecificationModel {
  const { specId, catalogueRevision, snapshot, onCreated, onSession, announce } = options;
  const { t } = useTranslation();
  const { demoCreationApi, sessionsApi } = useAppServices();
  const cache = useQueryClient();
  const notify = useNotify();
  const requestSessionRecovery = useRequestSessionRecovery();
  const [raw, dispatch] = useReducer(createOperationReducer, initialCreateOperation);
  const state = useMemo(() => visibleCreateOperation(raw, snapshot), [raw, snapshot]);
  const [ledger] = useState(createDemoLedger);

  const execute = useCallback(
    async (
      submission: CreateSubmission,
      resumedFrom: UnknownPhase | null,
    ): Promise<CreateSubmitOutcome> => {
      // The stored attempt is replayed verbatim while the outcome is unknown: the operation id,
      // the body and the session request never depend on the catalogue revision, refetched options
      // or later form state.
      const replay = resumedFrom !== null && ledger.attempt.current !== null;
      const session = submission.session
        ? replay && ledger.sessionAttempt.current
          ? ledger.sessionAttempt.current.input
          : retainRequest(ledger.sessionAttempt, { catalogueRevision, ...submission.session })
        : undefined;
      try {
        const result = await continueDemoCreation(ledger.progress, {
          existingSpecId: specId,
          create: async () => {
            const input =
              replay && ledger.attempt.current
                ? ledger.attempt.current.input
                : (() => {
                    const target = submission.buildTarget();
                    return retainRequest<DemoCreateRequest, 'operationId'>(
                      ledger.attempt,
                      {
                        title: submission.title.trim(),
                        ...(submission.slug ? { slug: submission.slug } : {}),
                        catalogueRevision,
                        archetypeId: submission.archetype.id,
                        archetypeVersion: submission.archetype.version,
                        optionalDocumentIds: [...submission.archetype.optionalDocumentIds],
                        ...(target ? { target } : {}),
                      },
                      undefined,
                      'operationId',
                    );
                  })();
            dispatch({
              type: 'request-prepared',
              sent: { operationId: input.operationId, title: input.title, target: input.target },
            });
            if (typeof navigator !== 'undefined' && navigator.onLine === false)
              throw new RequestNotSentError();
            const created = await demoCreationApi.create(input);
            await cache.invalidateQueries({ queryKey: specsOverviewKeys.all });
            return created;
          },
          ...(session ? { allocate: (id: string) => sessionsApi.allocate(id, session) } : {}),
        });
        await cache.invalidateQueries({ queryKey: specificationKeys.detail(result.specId) });
        notify(specId ? t('create.sessionReady') : t('create.specificationCreated'));
        ledger.navigationAllowed = true;
        dispatch({ type: 'submit-succeeded' });
        if (result.sessionId) onSession(result.specId, result.sessionId);
        else onCreated(result.specId, result.documentId);
        return { kind: 'completed' };
      } catch (error) {
        const created = ledger.progress.created;
        if (created && session) {
          requestSessionRecovery(created.specId, { session });
          ledger.navigationAllowed = true;
          dispatch({ type: 'submit-succeeded' });
          onCreated(created.specId, created.documentIds[0]);
          return { kind: 'completed' };
        }
        const sentTarget = ledger.attempt.current?.input.target;
        const next = classifyDemoCreateFailure(error, {
          customBranch: sentTarget?.kind === 'new-worktree' ? sentTarget.branch : undefined,
          newWorkspace: sentTarget?.kind === 'new-worktree',
        });
        if (next.kind === 'offline' && replay) {
          // Nothing was dispatched, so the earlier unknown outcome is unchanged.
          dispatch({ type: 'submit-offline-replay' });
          return { kind: 'failed', failure: next };
        }
        submission.onFailed?.(next);
        const discardSent = next.kind === 'operation-conflict';
        if (discardSent) ledger.attempt.current = null;
        dispatch({
          type: 'submit-failed',
          failure: { ...next, snapshot: submission.snapshot },
          discardSent,
        });
        return { kind: 'failed', failure: next };
      }
    },
    [
      cache,
      catalogueRevision,
      demoCreationApi,
      ledger,
      notify,
      onCreated,
      onSession,
      requestSessionRecovery,
      sessionsApi,
      specId,
      t,
    ],
  );

  /** Asks the server what became of the sent operation (`recovery-required` has no replay yet). */
  const checkOperation = useCallback(
    async (submission: CreateSubmission): Promise<CreateSubmitOutcome> => {
      dispatch({ type: 'check-started' });
      const operationId = ledger.attempt.current?.input.operationId;
      let status;
      try {
        if (!operationId) throw new Error('Operation id missing');
        status = await demoCreationApi.operationStatus(operationId);
      } catch {
        dispatch({ type: 'check-unreadable' });
        return { kind: 'checked' };
      }
      if (status.status === 'completed' && status.result) {
        ledger.progress.created = status.result;
        dispatch({ type: 'check-found-completed' });
        return { kind: 'checked', resumed: await execute(submission, 'recovery-required') };
      }
      if (status.status === 'not-started') {
        // `not-started` is a point-in-time answer: the original request may still be in flight or
        // queued. Keep the operation id and body and replay that same operation (idempotent); a new
        // operation starts only once the previous one is known to be finished.
        dispatch({ type: 'check-not-started', status, snapshot: submission.snapshot });
        announce(t('create.announce.notStarted'));
      } else if (status.status === 'failed') {
        // The server finished this operation without a result: the form is safe to use with a new id.
        ledger.attempt.current = null;
        dispatch({ type: 'check-failed-operation', status, snapshot: submission.snapshot });
        announce(t('create.announce.operationFailed'));
      } else {
        // A completed operation without its result cannot be resumed: say so, keep the lock.
        dispatch({ type: 'check-unreadable', status });
      }
      return { kind: 'checked' };
    },
    [announce, demoCreationApi, execute, ledger, t],
  );

  const submit = useCallback(
    async (submission: CreateSubmission): Promise<CreateSubmitOutcome> => {
      if (state.phase === 'recovery-required') {
        if (state.checking || !ledger.begin()) return { kind: 'ignored' };
        try {
          return await checkOperation(submission);
        } finally {
          ledger.end();
        }
      }
      if (state.phase === 'submitting' || state.phase === 'completed' || !ledger.begin())
        return { kind: 'ignored' };
      try {
        const resumedFrom = state.phase === 'outcome-unknown' ? state.phase : null;
        dispatch({ type: 'submit-started' });
        return await execute(submission, resumedFrom);
      } finally {
        ledger.end();
      }
    },
    [checkOperation, execute, ledger, state.checking, state.phase],
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
