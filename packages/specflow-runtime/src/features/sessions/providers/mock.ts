import { SessionLimits } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';
import type { EmitFact, Invocation, SessionDriver } from './driver';

/** Directly injected test seam. It is never a route, query parameter or prompt convention. */
export type MockScenario = (
  invocation: Invocation,
  emit: EmitFact,
  signal: AbortSignal,
  question: (key: string) => Promise<unknown>,
) => Promise<void>;

export function createMockDriver(scenario?: MockScenario): SessionDriver {
  return {
    describe: () => ({
      providerId: 'mock',
      title: 'Controlled mock (test only)',
      readiness: 'ready',
      capabilities: {
        questions: true,
        permissions: true,
        cancel: true,
        resume: false,
        modelOverride: true,
        effortOverride: false,
      },
      models: [{ modelId: 'mock', title: 'Deterministic test model', efforts: [] }],
      modes: ['read-only'],
    }),
    validate(selection) {
      if (selection.providerId !== 'mock') {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'Provider is unavailable.');
      }

      if (selection.mode !== 'read-only') {
        throw new SessionError('CAPABILITY_UNSUPPORTED', 'Mock execution has no write capability.');
      }

      if (selection.modelId && selection.modelId !== 'mock') {
        throw new SessionError('MODEL_UNSUPPORTED', 'Model is unavailable.');
      }

      if (selection.effort) {
        throw new SessionError('CAPABILITY_UNSUPPORTED', 'Mock effort selection is unsupported.');
      }
    },
    start(invocation, emit, signal) {
      const waiting = new Map<
        string,
        { resolve: (value: unknown) => void; reject: (reason: Error) => void }
      >();
      const onAbort = () => {
        for (const task of waiting.values()) {
          task.reject(new Error('Invocation aborted'));
        }

        waiting.clear();
      };

      signal.addEventListener('abort', onAbort, { once: true });
      const publish: EmitFact = async (fact) => {
        signal.throwIfAborted();
        await emit(fact);
      };

      const done = (async () => {
        await publish({ kind: 'correlation', providerSessionId: invocation.sessionId });
        if (scenario) {
          await scenario(invocation, publish, signal, (key) => {
            const pending = new Promise((resolve, reject) => {
              if (signal.aborted) {
                reject(new Error('Invocation aborted'));
              } else {
                waiting.set(key, { resolve, reject });
              }
            });
            // A question may be registered before its request fact commits. Cancellation in that
            // window must not create an unhandled rejection before the scenario awaits the answer.
            void pending.catch(() => undefined);

            return pending;
          });
        } else {
          await publish({
            kind: 'work-open',
            key: 'progress',
            workKind: 'commentary',
            title: 'Preparing test response',
          });
          await publish({
            kind: 'text',
            key: 'progress',
            channel: 'commentary',
            text: 'Running the configured no-effect mock.',
          });
          await publish({ kind: 'work-update', key: 'progress', state: 'completed' });
          const bytes = new TextEncoder().encode('Mock response: ' + invocation.request.message);
          // Decode complete characters at chunk boundaries; no full conversation is retained here.
          let offset = 0;
          while (offset < bytes.length) {
            let end = Math.min(bytes.length, offset + SessionLimits.chunkBytes);
            while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
              end--;
            }

            await publish({
              kind: 'text',
              key: 'answer',
              channel: 'answer',
              text: new TextDecoder().decode(bytes.subarray(offset, end)),
            });
            offset = end;
          }
        }

        await publish({ kind: 'outcome', outcome: 'completed' });
      })().finally(() => {
        signal.removeEventListener('abort', onAbort);
        waiting.clear();
      });

      return {
        done,
        respond(key, response) {
          const pending = waiting.get(key);
          if (!pending) {
            throw new SessionError(
              'INTERACTION_EXPIRED',
              'Live provider interaction no longer exists.',
            );
          }

          waiting.delete(key);
          pending.resolve(response);

          return Promise.resolve({ deliveredKeys: [key] });
        },
      };
    },
  };
}
