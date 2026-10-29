import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createManagedInvocation } from './managed-invocation';
import { createMockDriver } from '../providers/mock';
import type { Invocation, ProviderOperation, SessionDriver } from '../providers/driver';
import type { DriverFact } from '../persistence/protocol';
import type { SessionEffectClaim, SessionEffects } from './effects';
import { SessionError } from '../errors';

type Result = Extract<DriverFact, { kind: 'outcome' }>;
function fixture(source: 'native-result' | 'forced-stop' = 'native-result') {
  const order: string[] = [];
  const result: Result = {
    kind: 'outcome',
    outcome: source === 'forced-stop' ? 'cancelled' : 'completed',
  };
  let phase = 'admitted';
  const claim = {
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
  };
  const start = vi.fn(
    (_invocation: Invocation, emit: (fact: DriverFact) => Promise<void>): ProviderOperation => {
      order.push('driver-start');

      return {
        done: emit(result),
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
    'engine-dispatch',
    'driver-start',
    'engine-settle',
    'canonical-outcome',
  ]);
  expect(f.start.mock.calls[0]![0].executionContext).toMatchObject({
    kind: 'workspace-write',
    admission: { operationId: f.options.invocation.invocationId, scope: 'project' },
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
  expect(f.phase()).toBe('unknown');
  expect(f.finalize).not.toHaveBeenCalled();
});
it('rejects contradictory outcome facts despite a later positive receipt', async () => {
  const f = fixture();
  f.start.mockImplementation((_invocation, emit) => ({
    done: (async () => {
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
  f.start.mockImplementation((_invocation, emit) => ({
    done: emit(f.result),
    respond: () => Promise.resolve({ deliveredKeys: [] }),
  }));
  await createManagedInvocation(f.options).done;
  expect(f.phase()).toBe('unknown');
  expect(f.finalize).not.toHaveBeenCalled();
});
