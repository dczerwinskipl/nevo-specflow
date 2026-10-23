import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import type { CreateFailure } from './errors/createFailure';

/**
 * What the server said about an operation, as far as the UI displays it. Both Runtime flavours fit
 * (the demo adds a failed/not-started status and a step; the project Runtime answers in-progress,
 * recovery-required or the result, and 404 means not-started).
 */
export interface CreateOperationStatus {
  status: 'completed' | 'in-progress' | 'recovery-required' | 'not-started' | 'failed';
  step?: string;
  branch?: string;
  updatedAt?: string;
}

/**
 * State machine of one Create operation (pure; the async orchestration lives in
 * `useCreateProjectSpecification`).
 *
 * ```text
 *                      submit-started
 *   idle ───────────────────────────────────────┐
 *     ▲                                         ▼
 *     │ failure-dismissed                 ┌────────────┐  submit-succeeded   ┌───────────┐
 *     │                                   │ submitting │────────────────────▶│ completed │ (terminal)
 *     │                                   └────────────┘  (201, sync answer) └───────────┘
 *   ┌────────┐   submit-failed (definite answer)  │ │ │ submit-failed (no / unreadable answer)
 *   │ failed │◀───────────────────────────────────┘ │ └──────────────────────────┐
 *   └────────┘     submit-started (new attempt)     │ submit-failed (503 recovery)│
 *        │                                          │                             │
 *        └─────────────▶ submitting                 │                             │
 *                                                   ▼                             ▼
 *   submitting ──submit-accepted (202, or a check──▶ ┌────────────┐   ┌───────────────────┐
 *   found the operation still running)               │ monitoring │   │ outcome-unknown / │
 *                                                    └────────────┘   │ recovery-required │
 *   monitoring ──submit-succeeded──▶ completed       (inspection is   └───────────────────┘
 *   monitoring ──submit-failed─────▶ failed | outcome-unknown | recovery-required
 *                                                    polled; the live stream only hastens it)
 *
 *   Both unknown phases: submit-started replays the retained operation (-> submitting, failure
 *   kept); submit-offline-replay returns to the same phase (nothing was dispatched);
 *   check-started -> check-found-completed (-> submitting, replay) | check-not-started
 *   (-> outcome-unknown) | check-failed-operation (-> failed) | check-unreadable (same phase).
 * ```
 *
 * `monitoring` is an operation the Runtime accepted (HTTP 202, work continues detached) or one a
 * check found still running: the request is over and the inspection endpoint is polled. It is an
 * expected state, not a failure; `submit-succeeded` and `submit-failed` end it like `submitting`.
 * An older Runtime that ignores async mode answers 201 directly (submitting -> completed).
 *
 * Illegal events for the current phase are ignored (the state object is returned unchanged).
 * Editing the form retires the alert of a definite failure, but only in what is shown
 * (`visibleCreateOperation`, derived in render): an unknown outcome is never retired by an edit, only
 * the server's answer ends it.
 */
export type CreatePhase =
  | 'idle'
  | 'submitting'
  | 'monitoring'
  | 'outcome-unknown'
  | 'recovery-required'
  | 'completed'
  | 'failed';

export type UnknownPhase = 'outcome-unknown' | 'recovery-required';

/** A failure remembers the form it belongs to: editing the form retires its alert. */
export type StoredFailure = CreateFailure & { snapshot: string };

/** Facts of the create request as it was SENT (display only; the retained body is in the ledger). */
export interface SentRequest {
  operationId: string;
  title: string;
  target?: CreateSpecRequest['target'];
}

export interface CreateOperationState {
  phase: CreatePhase;
  failure: StoredFailure | null;
  /** While `submitting`: the unknown phase this attempt replays (null for a fresh attempt). */
  resumedFrom: UnknownPhase | null;
  sent: SentRequest | null;
  status: CreateOperationStatus | null;
  /** The operation status check is in flight. */
  checking: boolean;
  statusUnreadable: boolean;
  /** A replay was refused because the browser is offline: the earlier unknown outcome stands. */
  connectionLost: boolean;
  /** The last submit ended in a failure (drives revealing the failure under the submit button). */
  submitFailed: boolean;
  /** The failure kept the stored operation, so the same request can be tried again from the page. */
  retained: boolean;
  /** Counts failed submits, so a repeated identical failure is still observable. */
  errorSeq: number;
}

export type CreateOperationEvent =
  | { type: 'submit-started' }
  | { type: 'request-prepared'; sent: SentRequest }
  /** The Runtime accepted the operation (202) and runs it detached, or it was found running. */
  | { type: 'submit-accepted' }
  | { type: 'submit-succeeded' }
  | { type: 'submit-failed'; failure: StoredFailure; discardSent?: boolean; retained?: boolean }
  | { type: 'submit-offline-replay' }
  | { type: 'check-started' }
  | { type: 'check-found-completed' }
  | { type: 'check-not-started'; status: CreateOperationStatus; snapshot: string }
  | {
      type: 'check-failed-operation';
      status: CreateOperationStatus;
      snapshot: string;
      /** What the failure code means; the plain "finished without a result" failure when absent. */
      failure?: CreateFailure;
    }
  | { type: 'check-unreadable'; status?: CreateOperationStatus }
  /** The checked operation is still open on the server (in progress / awaiting recovery). */
  | { type: 'check-still-open'; status: CreateOperationStatus }
  | { type: 'failure-dismissed' };

export const initialCreateOperation: CreateOperationState = {
  phase: 'idle',
  failure: null,
  resumedFrom: null,
  sent: null,
  status: null,
  checking: false,
  statusUnreadable: false,
  connectionLost: false,
  submitFailed: false,
  retained: false,
  errorSeq: 0,
};

const isUnknown = (phase: CreatePhase): phase is UnknownPhase =>
  phase === 'outcome-unknown' || phase === 'recovery-required';

/** The phase a definite or unknown failure leads to. */
export function phaseOfFailure(failure: CreateFailure): CreatePhase {
  if (failure.kind === 'uncertain') return 'outcome-unknown';
  if (failure.kind === 'recovery-required') return 'recovery-required';
  return 'failed';
}

export function createOperationReducer(
  state: CreateOperationState,
  event: CreateOperationEvent,
): CreateOperationState {
  switch (event.type) {
    case 'submit-started': {
      if (state.phase === 'idle' || state.phase === 'failed')
        return {
          ...state,
          phase: 'submitting',
          failure: null,
          resumedFrom: null,
          status: null,
          statusUnreadable: false,
          connectionLost: false,
          submitFailed: false,
          retained: false,
        };
      // An unknown outcome stays on screen while it is being checked.
      if (isUnknown(state.phase))
        return {
          ...state,
          phase: 'submitting',
          resumedFrom: state.phase,
          status: null,
          statusUnreadable: false,
          connectionLost: false,
          submitFailed: false,
        };
      return state;
    }
    case 'request-prepared':
      return state.phase === 'submitting' ? { ...state, sent: event.sent } : state;
    case 'submit-accepted':
      return state.phase === 'submitting' ? { ...state, phase: 'monitoring' } : state;
    case 'submit-succeeded':
      return state.phase === 'submitting' || state.phase === 'monitoring'
        ? { ...state, phase: 'completed', resumedFrom: null, submitFailed: false }
        : state;
    case 'submit-failed':
      return state.phase === 'submitting' || state.phase === 'monitoring'
        ? {
            ...state,
            phase: phaseOfFailure(event.failure),
            failure: event.failure,
            resumedFrom: null,
            sent: event.discardSent ? null : state.sent,
            submitFailed: true,
            retained: event.retained === true,
            errorSeq: state.errorSeq + 1,
          }
        : state;
    case 'submit-offline-replay':
      return state.phase === 'submitting' && state.resumedFrom
        ? {
            ...state,
            phase: state.resumedFrom,
            resumedFrom: null,
            connectionLost: true,
            submitFailed: true,
            errorSeq: state.errorSeq + 1,
          }
        : state;
    case 'check-started':
      return isUnknown(state.phase) && !state.checking
        ? { ...state, checking: true, statusUnreadable: false }
        : state;
    case 'check-found-completed':
      return state.checking && isUnknown(state.phase)
        ? {
            ...state,
            phase: 'submitting',
            resumedFrom: state.phase,
            failure: null,
            status: null,
            checking: false,
            statusUnreadable: false,
            connectionLost: false,
            submitFailed: false,
          }
        : state;
    case 'check-not-started':
      return state.checking && isUnknown(state.phase)
        ? {
            ...state,
            phase: 'outcome-unknown',
            failure: { kind: 'uncertain', snapshot: event.snapshot },
            status: event.status,
            checking: false,
          }
        : state;
    case 'check-failed-operation':
      return state.checking && isUnknown(state.phase)
        ? {
            ...state,
            phase: event.failure ? phaseOfFailure(event.failure) : 'failed',
            failure: {
              ...(event.failure ?? { kind: 'failed', operationFailed: true }),
              snapshot: event.snapshot,
            },
            sent: null,
            status: event.status,
            checking: false,
          }
        : state;
    case 'check-unreadable':
      return state.checking
        ? {
            ...state,
            status: event.status ?? state.status,
            checking: false,
            statusUnreadable: true,
          }
        : state;
    case 'check-still-open':
      return state.checking ? { ...state, status: event.status, checking: false } : state;
    case 'failure-dismissed':
      return state.phase === 'failed'
        ? { ...state, phase: 'idle', failure: null, submitFailed: false }
        : state;
  }
}

/**
 * What the screen shows for the form it currently has: a definite failure describes the attempt
 * (form snapshot) that produced it, so for another snapshot it is not shown and the form is idle.
 * An unknown outcome is never hidden by an edit.
 */
export function visibleCreateOperation(
  state: CreateOperationState,
  snapshot: string,
): CreateOperationState {
  return state.phase === 'failed' && state.failure && state.failure.snapshot !== snapshot
    ? { ...state, phase: 'idle', failure: null }
    : state;
}

/** What the presentation asks about the operation; derived, never stored. */
export interface CreateOperationFlags {
  busy: boolean;
  /** The Runtime accepted the operation and it is being watched (inspection polling). */
  monitoring: boolean;
  checking: boolean;
  uncertain: boolean;
  recovery: boolean;
  forbidden: boolean;
  /**
   * An operation is in flight or unresolved. Leaving is allowed (the server finishes it and the
   * stored operation is resumed on return); only closing the tab loses that, so it asks the browser.
   */
  unfinished: boolean;
}

export function selectCreateOperationFlags(state: CreateOperationState): CreateOperationFlags {
  const uncertain = state.failure?.kind === 'uncertain';
  const recovery = state.failure?.kind === 'recovery-required';
  const monitoring = state.phase === 'monitoring';
  const busy = state.phase === 'submitting' || monitoring;
  return {
    busy,
    monitoring,
    checking: state.checking,
    uncertain,
    recovery,
    forbidden: state.failure?.kind === 'forbidden',
    unfinished: busy || uncertain || recovery,
  };
}
