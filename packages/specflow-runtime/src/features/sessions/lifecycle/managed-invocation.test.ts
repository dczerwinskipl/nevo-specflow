import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createManagedInvocation } from './managed-invocation';
import { createMockDriver } from '../providers/mock';
import type { Invocation, ProviderOperation, SessionDriver } from '../providers/driver';
import type { DriverFact } from '../persistence/protocol';
import type { SessionEffectClaim, SessionEffects } from './effects';
import { SessionError } from '../errors';

type Result = Extract<DriverFact, { kind: 'outcome' }>;
/** What a launching driver does: record its process's evidence, then cross the dispatch barrier. */
async function launched(invocation: Invocation) {
  await invocation.recordProcess!({ platform: 'posix', groupId: 4242 });
  await invocation.beforeDispatch!();
}

function fixture(
  source: 'native-result' | 'forced-stop' = 'native-result',
  claimed = '/verified/workspace',
) {
  const order: string[] = [];
  const result: Result = {
    kind: 'outcome',
    outcome: source === 'forced-stop' ? 'cancelled' : 'completed',
  };
  let phase = 'admitted';
  const claim = {
    workspace: claimed,
    dispatch: vi.fn(() => {
      order.push('engine-dispatch');
      phase = 'dispatched';

      return Promise.resolve();
    }),
    abandon: vi.fn(() => {
      phase = 'settled';

      return Promise.resolve();
    }),
    unknown: vi.fn(() => {
      if (phase !== 'settled') {
        phase = 'unknown';
      }

      return Promise.resolve();
    }),
    settle: vi.fn(() => {
      order.push('engine-settle');
      phase = 'settled';

      return Promise.resolve();
    }),
  } satisfies SessionEffectClaim;
  const effects: SessionEffects = {
    admit: vi.fn(() => {
      order.push('engine-admit');

      return Promise.resolve(claim);
    }),
    reconcile: () => Promise.resolve(undefined),
    settleStopped: () => Promise.reject(new Error('Unexpected native-stop settlement')),
  };
  const start = vi.fn(
    (invocation: Invocation, emit: (fact: DriverFact) => Promise<void>): ProviderOperation => {
      order.push('driver-start');

      return {
        done: (async () => {
          await launched(invocation);
          await emit(result);
        })(),
        settlement: Promise.resolve({ process: 'stopped', source, result }),
        respond: () => Promise.resolve({ deliveredKeys: [] }),
      };
    },
  );
  const driver: SessionDriver = { ...createMockDriver(), supportsManagedWrites: true, start };
  const invocation: Invocation = {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    invocationId: randomUUID(),
    request: { requestId: randomUUID(), message: 'Do work' },
    selection: { providerId: 'claude', mode: 'workspace-write', providerModeId: 'acceptEdits' },
    executionContext: {
      kind: 'read-only',
      workspace: '/verified/workspace',
      temporaryRoot: '/owned/temp',
      workspaceIdentity: 'b'.repeat(64),
    },
    recordProcess: vi.fn(() => {
      order.push('process-identity');

      return Promise.resolve();
    }),
    beforeDispatch: vi.fn(() => {
      order.push('dispatch-intent');

      return Promise.resolve();
    }),
  };
  const persist = vi.fn(() => Promise.resolve());
  const finalize = vi.fn(() => {
    order.push('canonical-outcome');

    return Promise.resolve();
  });
  const stop = vi.fn();
  const options = {
    invocation,
    binding: 'a'.repeat(64),
    effects,
    driver,
    signal: new AbortController().signal,
    persist,
    finalize,
    stop,
  };

  return { options, order, result, claim, start, persist, finalize, phase: () => phase };
}

it('admits before launching and proves settlement before canonical terminal publication', async () => {
  const f = fixture();
  await createManagedInvocation(f.options).done;
  expect(f.order).toEqual([
    'engine-admit',
    'driver-start',
    'process-identity',
    'engine-dispatch',
    'dispatch-intent',
    'engine-settle',
    'canonical-outcome',
  ]);
  expect(f.start.mock.calls[0]![0].executionContext).toMatchObject({
    kind: 'workspace-write',
    admission: {
      operationId: f.options.invocation.invocationId,
      scope: 'project',
      workspace: '/verified/workspace',
    },
  });
  expect(f.persist).not.toHaveBeenCalled();
  expect(f.finalize).toHaveBeenCalledWith(f.result, 'native-result', false);
});
it('retains an unknown claim after a forced stop without an authoritative native terminal result', async () => {
  const f = fixture('forced-stop');
  await createManagedInvocation(f.options).done;
  expect(f.claim.settle).not.toHaveBeenCalled();
  expect(f.finalize).not.toHaveBeenCalled();
  expect(f.phase()).toBe('unknown');
  expect(f.persist).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lost' }));
});
it('preserves the Engine receipt when canonical persistence fails, without redispatch', async () => {
  const f = fixture();
  f.finalize.mockRejectedValue(new SessionError('SESSION_STORE_UNAVAILABLE', 'Store unavailable.'));
  await createManagedInvocation(f.options).done;
  expect(f.phase()).toBe('settled');
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(f.persist).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lost' }));
});
it('does not launch when admission conflicts with another writer', async () => {
  const f = fixture();
  f.options.effects.admit = () =>
    Promise.reject(new SessionError('TURN_CONFLICT', 'Project busy.'));
  await createManagedInvocation(f.options).done;
  expect(f.start).not.toHaveBeenCalled();
  expect(f.finalize).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: 'failed' }),
    'not-dispatched',
  );
});
it('does not manufacture a failed outcome if the driver throws after invocation', async () => {
  const f = fixture();
  f.start.mockImplementation(() => {
    throw new Error('Unknown driver startup.');
  });
  await createManagedInvocation(f.options).done;
  // Nothing was recorded or dispatched: the claim keeps its not-dispatched proof for recovery.
  expect(f.phase()).toBe('admitted');
  expect(f.persist).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lost' }));
  expect(f.finalize).not.toHaveBeenCalled();
});
it('rejects contradictory outcome facts despite a later positive receipt', async () => {
  const f = fixture();
  f.start.mockImplementation((invocation, emit) => ({
    done: (async () => {
      await launched(invocation);
      await emit(f.result);
      await emit({ kind: 'outcome', outcome: 'failed' });
    })(),
    settlement: Promise.resolve({ process: 'stopped', source: 'native-result', result: f.result }),
    respond: () => Promise.resolve({ deliveredKeys: [] }),
  }));
  await createManagedInvocation(f.options).done;
  expect(f.phase()).toBe('unknown');
  expect(f.finalize).not.toHaveBeenCalled();
});
it('requires explicit process-owner evidence even if an adapter declares writable support', async () => {
  const f = fixture();
  f.start.mockImplementation((invocation, emit) => ({
    done: (async () => {
      await launched(invocation);
      await emit(f.result);
    })(),
    respond: () => Promise.resolve({ deliveredKeys: [] }),
  }));
  await createManagedInvocation(f.options).done;
  expect(f.phase()).toBe('unknown');
  expect(f.finalize).not.toHaveBeenCalled();
});

it('never starts a write driver outside the root the Engine claimed', async () => {
  const f = fixture('native-result', '/another/worktree');
  await createManagedInvocation(f.options).done;

  expect(f.start).not.toHaveBeenCalled();
  expect(f.claim.dispatch).not.toHaveBeenCalled();
  expect(f.claim.abandon).toHaveBeenCalledOnce();
  expect(f.finalize).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: 'failed' }),
    'not-dispatched',
  );
});

it('retires a claim as never dispatched when the driver fails before recording its process', async () => {
  const f = fixture();
  const failed: Result = {
    kind: 'outcome',
    outcome: 'failed',
    error: { code: 'PROVIDER_UNAVAILABLE', message: 'Claude is unavailable.' },
  };
  f.start.mockImplementation((_invocation, emit) => ({
    done: emit(failed),
    settlement: Promise.resolve({ process: 'stopped', source: 'not-started', result: failed }),
    respond: () => Promise.resolve({ deliveredKeys: [] }),
  }));
  await createManagedInvocation(f.options).done;
  expect(f.claim.dispatch).not.toHaveBeenCalled();
  expect(f.claim.abandon).toHaveBeenCalledOnce();
  expect(f.finalize).toHaveBeenCalledWith(failed, 'not-dispatched');
});

it('refuses to cross the dispatch barrier before the process evidence and the claim are durable', async () => {
  const f = fixture();
  let refused: unknown;
  f.start.mockImplementation((invocation) => ({
    done: invocation.beforeDispatch!().catch((error: unknown) => {
      refused = error;
    }),
    settlement: Promise.resolve({ process: 'stopped', source: 'not-started' }),
    respond: () => Promise.resolve({ deliveredKeys: [] }),
  }));
  await createManagedInvocation(f.options).done;
  expect(refused).toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
  expect(f.options.invocation.beforeDispatch).not.toHaveBeenCalled();
  expect(f.claim.dispatch).not.toHaveBeenCalled();
  expect(f.phase()).toBe('settled');
});
