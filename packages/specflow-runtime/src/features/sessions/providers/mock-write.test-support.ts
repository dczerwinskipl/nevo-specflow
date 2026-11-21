import type { EmitFact, Invocation, SessionDriver } from './driver';
import { createMockDriver } from './mock';

/**
 * A minimal writable test driver (the mock driver is read-only): each Turn records a fake process
 * identity, crosses the dispatch barrier, correlates its native context, runs `turn` (what the
 * "agent" does) and completes, with positive native-stop evidence. A `turn` that throws leaves the
 * Turn's outcome unverified, as a lost provider does. Shared by the Runtime tests of agent Turns.
 */
export function createWritableTestDriver(
  turn: (invocation: Invocation, emit: EmitFact) => Promise<void>,
  options: { providerId?: string } = {},
): SessionDriver {
  const providerId = options.providerId ?? 'controlled';
  const mock = createMockDriver();

  return {
    ...mock,
    supportsManagedWrites: true,
    supportsSessionWorkspaces: true,
    describe: () => ({
      ...mock.describe(),
      providerId,
      modes: ['read-only', 'workspace-write'],
    }),
    validate: () => undefined,
    contextScope: () => 'account',
    start(invocation, emit) {
      const result = { kind: 'outcome' as const, outcome: 'completed' as const };
      const done = (async () => {
        await invocation.recordProcess?.({ platform: 'posix', groupId: 4242 });
        await invocation.beforeDispatch?.();
        if (invocation.providerContext) {
          await emit({
            kind: 'correlation',
            providerSessionId: invocation.providerContext.nativeSessionId,
          });
        }

        await turn(invocation, emit);
        await emit(result);
      })();

      return {
        done,
        settlement: done.then(() => ({
          process: 'stopped' as const,
          source: 'native-result' as const,
          result,
        })),
        respond: () => Promise.resolve({ deliveredKeys: [] }),
      };
    },
  };
}
