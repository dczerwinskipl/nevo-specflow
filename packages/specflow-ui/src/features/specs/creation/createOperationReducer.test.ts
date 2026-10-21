import { describe, expect, it } from 'vitest';
import {
  createOperationReducer,
  initialCreateOperation,
  phaseOfFailure,
  selectCreateOperationFlags,
  type CreateOperationEvent,
  type CreateOperationState,
  type CreateOperationStatus,
  type CreatePhase,
  type StoredFailure,
} from './createOperationReducer';

const snapshot = 'form-1';
const status: CreateOperationStatus = { status: 'not-started' };
const sent = { operationId: 'op-1', title: 'Title' };
const failure = (kind: StoredFailure['kind'], at = snapshot): StoredFailure =>
  ({ kind, snapshot: at, ...(kind === 'stale' ? { code: 'X' } : {}) }) as StoredFailure;

const reduce = (state: CreateOperationState, ...events: CreateOperationEvent[]) =>
  events.reduce(createOperationReducer, state);

const submitting = reduce(initialCreateOperation, { type: 'submit-started' });
const failed = reduce(submitting, { type: 'submit-failed', failure: failure('stale') });
const uncertain = reduce(submitting, { type: 'submit-failed', failure: failure('uncertain') });
const recovery = reduce(submitting, {
  type: 'submit-failed',
  failure: failure('recovery-required'),
});
const completed = reduce(submitting, { type: 'submit-succeeded' });
const monitoring = reduce(submitting, { type: 'monitoring-started' });
const states: Record<CreatePhase, CreateOperationState> = {
  idle: initialCreateOperation,
  submitting,
  monitoring,
  failed,
  'outcome-unknown': uncertain,
  'recovery-required': recovery,
  completed,
};

describe('createOperationReducer legal transitions', () => {
  it('starts every state in the expected phase', () => {
    for (const [phase, state] of Object.entries(states)) expect(state.phase).toBe(phase);
  });

  it('idle -> submitting clears the previous attempt', () => {
    expect(submitting).toMatchObject({ phase: 'submitting', failure: null, resumedFrom: null });
  });

  it('failed -> submitting starts a fresh attempt and drops the failure', () => {
    const next = reduce(failed, { type: 'submit-started' });
    expect(next).toMatchObject({ phase: 'submitting', failure: null, resumedFrom: null });
  });

  it.each(['outcome-unknown', 'recovery-required'] as const)(
    '%s -> submitting replays and keeps the failure on screen',
    (phase) => {
      const next = reduce(states[phase], { type: 'submit-started' });
      expect(next.phase).toBe('submitting');
      expect(next.resumedFrom).toBe(phase);
      expect(next.failure).toBe(states[phase].failure);
    },
  );

  it('records the sent request while submitting', () => {
    expect(reduce(submitting, { type: 'request-prepared', sent }).sent).toEqual(sent);
  });

  it('submitting -> completed', () => {
    expect(completed.phase).toBe('completed');
    expect(completed.submitFailed).toBe(false);
  });

  it.each([
    ['uncertain', 'outcome-unknown'],
    ['recovery-required', 'recovery-required'],
    ['stale', 'failed'],
    ['branch-exists', 'failed'],
    ['operation-conflict', 'failed'],
    ['forbidden', 'failed'],
    ['unauthenticated', 'failed'],
    ['offline', 'failed'],
    ['failed', 'failed'],
  ] as const)('submit-failed(%s) -> %s', (kind, phase) => {
    const next = reduce(submitting, { type: 'submit-failed', failure: failure(kind) });
    expect(next).toMatchObject({ phase, submitFailed: true, errorSeq: 1 });
    expect(phaseOfFailure(failure(kind))).toBe(phase);
  });

  it('submit-failed discards the sent request when asked', () => {
    const withSent = reduce(submitting, { type: 'request-prepared', sent });
    expect(
      reduce(withSent, {
        type: 'submit-failed',
        failure: failure('operation-conflict'),
        discardSent: true,
      }).sent,
    ).toBeNull();
    expect(reduce(withSent, { type: 'submit-failed', failure: failure('uncertain') }).sent).toEqual(
      sent,
    );
  });

  it.each(['outcome-unknown', 'recovery-required'] as const)(
    'offline replay returns to %s without changing the failure',
    (phase) => {
      const replay = reduce(states[phase], { type: 'submit-started' });
      const next = reduce(replay, { type: 'submit-offline-replay' });
      expect(next).toMatchObject({ phase, connectionLost: true, submitFailed: true });
      expect(next.failure).toBe(states[phase].failure);
    },
  );

  it('checks the operation status from recovery-required', () => {
    const checking = reduce(recovery, { type: 'check-started' });
    expect(checking).toMatchObject({ phase: 'recovery-required', checking: true });
  });

  it('a completed check resumes the replay and clears the unknown failure', () => {
    const next = reduce(recovery, { type: 'check-started' }, { type: 'check-found-completed' });
    expect(next).toMatchObject({
      phase: 'submitting',
      resumedFrom: 'recovery-required',
      failure: null,
      checking: false,
    });
  });

  it('a not-started check keeps the outcome unknown', () => {
    const next = reduce(
      recovery,
      { type: 'check-started' },
      { type: 'check-not-started', status, snapshot },
    );
    expect(next).toMatchObject({
      phase: 'outcome-unknown',
      failure: { kind: 'uncertain', snapshot },
      status,
      checking: false,
    });
  });

  it('a failed operation unlocks the form and forgets the sent request', () => {
    const next = reduce(
      reduce(recovery, { type: 'request-prepared', sent }),
      { type: 'check-started' },
      { type: 'check-failed-operation', status, snapshot },
    );
    expect(next).toMatchObject({
      phase: 'failed',
      failure: { kind: 'failed', operationFailed: true },
      sent: null,
    });
  });

  it('an unreadable check keeps the phase and flags the status', () => {
    const next = reduce(recovery, { type: 'check-started' }, { type: 'check-unreadable' });
    expect(next).toMatchObject({
      phase: 'recovery-required',
      checking: false,
      statusUnreadable: true,
    });
    const withStatus = reduce(
      recovery,
      { type: 'check-started' },
      { type: 'check-unreadable', status },
    );
    expect(withStatus.status).toBe(status);
  });

  it('dismissing a failure returns to idle', () => {
    expect(reduce(failed, { type: 'failure-dismissed' })).toMatchObject({
      phase: 'idle',
      failure: null,
    });
  });

  it('editing the form retires only a definite failure of another form snapshot', () => {
    expect(reduce(failed, { type: 'form-edited', snapshot: 'form-2' }).phase).toBe('idle');
    expect(reduce(failed, { type: 'form-edited', snapshot }).phase).toBe('failed');
  });
});

describe('createOperationReducer ignores illegal events', () => {
  const ignored = (phase: CreatePhase, event: CreateOperationEvent) => {
    const state = states[phase];
    expect(createOperationReducer(state, event)).toBe(state);
  };

  it.each(['submitting', 'completed'] as const)('submit-started is ignored in %s', (phase) =>
    ignored(phase, { type: 'submit-started' }),
  );

  it.each(['idle', 'failed', 'outcome-unknown', 'recovery-required', 'completed'] as const)(
    'submit results are ignored in %s',
    (phase) => {
      ignored(phase, { type: 'submit-succeeded' });
      ignored(phase, { type: 'submit-failed', failure: failure('failed') });
      ignored(phase, { type: 'request-prepared', sent });
      ignored(phase, { type: 'submit-offline-replay' });
    },
  );

  it('offline replay needs a replayed attempt', () => {
    ignored('submitting', { type: 'submit-offline-replay' });
  });

  it.each(['idle', 'submitting', 'failed', 'completed'] as const)(
    'check-started is ignored in %s',
    (phase) => ignored(phase, { type: 'check-started' }),
  );

  it('check-started is ignored while a check is already running', () => {
    const checking = reduce(recovery, { type: 'check-started' });
    expect(createOperationReducer(checking, { type: 'check-started' })).toBe(checking);
  });

  it.each(['idle', 'submitting', 'failed', 'completed', 'outcome-unknown'] as const)(
    'check results are ignored in %s without a running check',
    (phase) => {
      ignored(phase, { type: 'check-found-completed' });
      ignored(phase, { type: 'check-not-started', status, snapshot });
      ignored(phase, { type: 'check-failed-operation', status, snapshot });
      ignored(phase, { type: 'check-unreadable' });
    },
  );

  it.each(['idle', 'submitting', 'outcome-unknown', 'recovery-required', 'completed'] as const)(
    'failure-dismissed and form-edited never end %s',
    (phase) => {
      ignored(phase, { type: 'failure-dismissed' });
      ignored(phase, { type: 'form-edited', snapshot: 'another' });
    },
  );
});

describe('monitoring (a submit that outlived its soft deadline)', () => {
  it('submitting -> monitoring keeps the sent request and is busy, not failed', () => {
    const prepared = reduce(
      submitting,
      { type: 'request-prepared', sent },
      { type: 'monitoring-started' },
    );
    expect(prepared).toMatchObject({ phase: 'monitoring', sent, failure: null });
    expect(selectCreateOperationFlags(prepared)).toMatchObject({
      busy: true,
      monitoring: true,
      blocksLeave: true,
    });
  });

  it('monitoring ends like submitting: success or a failure', () => {
    expect(reduce(monitoring, { type: 'submit-succeeded' }).phase).toBe('completed');
    expect(reduce(monitoring, { type: 'submit-failed', failure: failure('uncertain') }).phase).toBe(
      'outcome-unknown',
    );
    expect(
      reduce(monitoring, { type: 'submit-failed', failure: failure('recovery-required') }).phase,
    ).toBe('recovery-required');
    expect(reduce(monitoring, { type: 'submit-failed', failure: failure('stale') }).phase).toBe(
      'failed',
    );
  });

  it.each([
    'idle',
    'monitoring',
    'failed',
    'outcome-unknown',
    'recovery-required',
    'completed',
  ] as const)('monitoring-started is ignored in %s', (phase) =>
    expect(createOperationReducer(states[phase], { type: 'monitoring-started' })).toBe(
      states[phase],
    ),
  );

  it('a status check that finds the operation still open keeps the phase and records the status', () => {
    const checking = reduce(recovery, { type: 'check-started' });
    const open = reduce(checking, { type: 'check-still-open', status: { status: 'in-progress' } });
    expect(open).toMatchObject({
      phase: 'recovery-required',
      checking: false,
      status: { status: 'in-progress' },
    });
    expect(
      createOperationReducer(uncertain, {
        type: 'check-still-open',
        status: { status: 'in-progress' },
      }),
    ).toBe(uncertain);
  });
});

describe('selectCreateOperationFlags', () => {
  it('derives the flags from phase and failure', () => {
    expect(selectCreateOperationFlags(initialCreateOperation)).toMatchObject({
      busy: false,
      blocksLeave: false,
    });
    expect(selectCreateOperationFlags(submitting)).toMatchObject({ busy: true, blocksLeave: true });
    expect(selectCreateOperationFlags(uncertain)).toMatchObject({
      uncertain: true,
      blocksLeave: true,
    });
    expect(selectCreateOperationFlags(recovery)).toMatchObject({
      recovery: true,
      blocksLeave: true,
    });
    const forbidden = reduce(submitting, { type: 'submit-failed', failure: failure('forbidden') });
    expect(selectCreateOperationFlags(forbidden)).toMatchObject({
      forbidden: true,
      blocksLeave: false,
    });
  });

  it('keeps an unknown outcome visible while the replay is submitting', () => {
    const replaying = reduce(uncertain, { type: 'submit-started' });
    expect(selectCreateOperationFlags(replaying)).toMatchObject({ busy: true, uncertain: true });
  });
});
