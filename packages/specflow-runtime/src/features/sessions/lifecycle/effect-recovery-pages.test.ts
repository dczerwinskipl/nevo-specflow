import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createSessionCoordinator } from './coordinator';
import { createMockDriver } from '../providers/mock';
import type { SessionStore } from '../persistence/store';
import type { EffectRecoveryCandidate, StoreCommand } from '../persistence/protocol';
import type { SessionEffects } from './effects';

it('reaches positive evidence after a full page of unrecoverable operations', async () => {
  const candidates: EffectRecoveryCandidate[] = Array.from({ length: 41 }, (_, index) => ({
    sessionId: String(index + 1).padStart(8, '0') + '-0000-4000-8000-000000000000',
    turnId: randomUUID(),
    invocationId: randomUUID(),
    binding: 'a'.repeat(64),
    workspace: '/workspace',
    nativeDispatched: true,
  }));
  const commands: StoreCommand[] = [];
  const store: SessionStore = {
    call<T>(command: StoreCommand): Promise<T> {
      commands.push(command);
      const result =
        command.op === 'effect-candidates'
          ? candidates.filter((item) => item.sessionId > (command.afterSession ?? '')).slice(0, 40)
          : { turnId: candidates[40]!.turnId, outcome: 'completed', reconciled: true };

      return Promise.resolve(result as T);
    },
    close: () => Promise.resolve(),
    abandon: () => Promise.resolve(),
    subscribe: () => () => undefined,
    readMetrics: () => ({ rows: 0, contentBytes: 0 }),
  };
  const reconcile = vi.fn<SessionEffects['reconcile']>((identity) =>
    Promise.resolve(
      identity.sessionId === candidates[40]!.sessionId
        ? { process: 'stopped', source: 'native-result', outcome: 'completed' }
        : undefined,
    ),
  );
  const effects: SessionEffects = {
    admit: () => Promise.reject(new Error('Unexpected admission')),
    reconcile,
  };
  const coordinator = createSessionCoordinator(
    store,
    createMockDriver(),
    'project',
    true,
    { kind: 'no-effects' },
    effects,
  );
  await coordinator.recoverEffects();
  expect(reconcile).toHaveBeenCalledTimes(41);
  expect(commands.filter((command) => command.op === 'effect-candidates')).toHaveLength(3);
  expect(commands.filter((command) => command.op === 'reconcile-effect')).toEqual([
    expect.objectContaining({ invocationId: candidates[40]!.invocationId }),
  ]);
});
