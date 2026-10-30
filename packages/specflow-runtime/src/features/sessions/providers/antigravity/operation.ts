import type { RespondInteraction } from '@nevo/specflow-contracts/sessions';
import type { DriverFact } from '../../persistence/protocol';
import { SessionError } from '../../errors';
import {
  ProviderTimeouts,
  type EmitFact,
  type Invocation,
  type ProviderOperation,
} from '../driver';
import { ProviderProcessError, type launchOwnedProcess } from '../process';
import {
  AntigravityProtocolError,
  createAntigravityProtocol,
  parseAntigravityFrame,
  parseAntigravityInit,
  type AntigravityInit,
} from './protocol';

export type AntigravityProcess = Pick<
  Awaited<ReturnType<typeof launchOwnedProcess>>,
  'write' | 'endInput' | 'lines' | 'dispose' | 'done'
>;
export interface AntigravityInteractions {
  activate(): void;
  awaitNativeIdle(signal: AbortSignal): Promise<void>;
  respond(key: string, response: RespondInteraction): Promise<{ deliveredKeys: readonly string[] }>;
  close(): Promise<void>;
  done: Promise<void>;
}

const settlementMs = 5000;

export interface AntigravityOperationOptions {
  launch(
    signal: AbortSignal,
  ): Promise<{ owner: AntigravityProcess; interactions?: AntigravityInteractions }>;
  beforeInput(init: AntigravityInit, signal: AbortSignal): Promise<void>;
}

/** One native invocation. CLI outcomes and stopped-tree receipts remain separate;
 * Engine admission/settlement belongs to the existing managed invocation wrapper. */
export function createAntigravityOperation(
  invocation: Invocation,
  emit: EmitFact,
  signal: AbortSignal,
  options: AntigravityOperationOptions,
): ProviderOperation {
  const context = invocation.providerContext;
  if (!context || !invocation.beforeDispatch) {
    throw new SessionError('SESSION_RECOVERY_REQUIRED', 'Durable provider context is required.');
  }

  const controller = new AbortController();
  let owner: AntigravityProcess | undefined;
  let interactions: AntigravityInteractions | undefined;
  let reader: AsyncIterator<string> | undefined;
  let dispatched = false;
  let closed = false;
  let pendingOutcome: Extract<DriverFact, { kind: 'outcome' }> | undefined;
  const stopped = Promise.withResolvers<Awaited<NonNullable<ProviderOperation['settlement']>>>();
  const aborted = Promise.withResolvers<never>();
  // The abort can race a completed read; keep its rejection consumed in both cases.
  void aborted.promise.catch(() => undefined);
  function cancel() {
    if (!closed) {
      controller.abort(signal.reason);
      aborted.reject(new SessionError('INTERACTION_EXPIRED', 'Antigravity operation stopped.'));
      void owner?.dispose().catch(() => undefined);
    }
  }

  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) {
    cancel();
  }

  const publish: EmitFact = async (fact) => {
    if (fact.kind === 'outcome') {
      pendingOutcome = fact;
    } else {
      await emit(fact);
    }
  };

  const done = (async () => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let failure: unknown;
    let launched = false;
    let nativeQuiesced = false;
    function timeout(ms: number, phase: 'initialize' | 'settlement' = 'initialize') {
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        controller.abort(phase + '-timeout');
        aborted.reject(
          new SessionError(
            'PROVIDER_UNAVAILABLE',
            phase === 'initialize'
              ? 'Antigravity initialization timed out.'
              : 'Antigravity graceful settlement timed out.',
          ),
        );
        void owner?.dispose().catch(() => undefined);
      }, ms);
      deadline.unref();
    }

    try {
      controller.signal.throwIfAborted();
      timeout(ProviderTimeouts.discoveryMs);
      // Launch owns partial acquisition rollback. Do not race it and lose the
      // eventual process handle; its AbortSignal is the startup cancellation path.
      const launchedResources = await options.launch(controller.signal);
      owner = launchedResources.owner;
      interactions = launchedResources.interactions;
      launched = true;
      controller.signal.throwIfAborted();
      timeout(ProviderTimeouts.initializeMs);
      reader = owner.lines()[Symbol.asyncIterator]();
      const first = await Promise.race([reader.next(), aborted.promise]);
      if (first.done) {
        throw new AntigravityProtocolError();
      }

      const init = parseAntigravityInit(parseAntigravityFrame(first.value));
      if (context.resume && context.nativeSessionId !== init.conversationId) {
        throw new AntigravityProtocolError();
      }

      // Validate the selected account and effective native policy before binding
      // this context durably to the canonical Session.
      await options.beforeInput(init, controller.signal);
      controller.signal.throwIfAborted();
      await emit({ kind: 'correlation', providerSessionId: init.conversationId });
      await invocation.beforeDispatch!();
      controller.signal.throwIfAborted();
      interactions?.activate();
      const protocol = createAntigravityProtocol(publish, init.conversationId, !context.resume);
      dispatched = true;
      await owner.write(
        JSON.stringify({ event: 'user', message: { content: invocation.request.message } }) + '\n',
      );
      clearTimeout(deadline);
      const bridgeFailure = interactions
        ? interactions.done.then(() => {
            throw new SessionError(
              'INTERACTION_EXPIRED',
              'Antigravity question transport stopped.',
            );
          })
        : undefined;
      void bridgeFailure?.catch(() => undefined);
      while (!protocol.terminal) {
        const next = await Promise.race([
          reader.next(),
          aborted.promise,
          ...(bridgeFailure ? [bridgeFailure] : []),
        ]);
        if (next.done) {
          throw new AntigravityProtocolError();
        }

        await protocol.frame(parseAntigravityFrame(next.value));
      }

      // A result can precede the native Stop hook and durable continuation writes.
      // EOF requests graceful draining, not cancellation. Keep the output iterator
      // alive: returning it would dispose the process before natural completion.
      timeout(settlementMs, 'settlement');
      const graceful = (async () => {
        await owner.endInput();
        controller.signal.throwIfAborted();
        if (!interactions) {
          throw new SessionError('PROVIDER_UNAVAILABLE', 'Native idle evidence is unavailable.');
        }

        await Promise.all([
          interactions.awaitNativeIdle(controller.signal),
          owner.done.then((exit) => {
            if (
              exit.signal !== null ||
              exit.code === null ||
              (pendingOutcome?.outcome === 'completed' && exit.code !== 0)
            ) {
              throw new SessionError(
                'PROVIDER_UNAVAILABLE',
                'Antigravity did not finish the native operation cleanly.',
              );
            }
          }),
        ]);
      })();
      await Promise.race([graceful, aborted.promise, ...(bridgeFailure ? [bridgeFailure] : [])]);
      controller.signal.throwIfAborted();
      nativeQuiesced = true;
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(deadline);
      closed = true;
      signal.removeEventListener('abort', cancel);
      // Quiesce native execution before waiting on canonical interaction cleanup.
      const disposition = await owner?.dispose().catch(() => undefined);
      const bridgeClosed = await interactions?.close().then(
        () => true,
        () => false,
      );
      await reader?.return?.().catch(() => undefined);
      const unknown =
        (launched && disposition?.process.state !== 'stopped') ||
        (failure instanceof ProviderProcessError &&
          failure.cleanup.some((issue) => issue.code === 'PROCESS_NOT_STOPPED'));
      const forcedStop =
        disposition?.process.state === 'stopped' && disposition.process.reason === 'tree-killed';
      let result: Extract<DriverFact, { kind: 'outcome' }> | undefined;
      if (
        !unknown &&
        !failure &&
        nativeQuiesced &&
        !forcedStop &&
        pendingOutcome &&
        bridgeClosed !== false
      ) {
        result = pendingOutcome;
      } else if (!unknown && !dispatched) {
        result = signal.aborted
          ? { kind: 'outcome', outcome: signal.reason === 'shutdown' ? 'interrupted' : 'cancelled' }
          : {
              kind: 'outcome',
              outcome: 'failed',
              error:
                failure instanceof SessionError
                  ? { code: failure.code, message: failure.message }
                  : {
                      code: 'PROVIDER_UNAVAILABLE',
                      message: 'Antigravity could not initialize the requested operation.',
                    },
            };
      }

      let source: Awaited<NonNullable<ProviderOperation['settlement']>>['source'];
      if (unknown) {
        source = 'unverified';
      } else if (pendingOutcome && result) {
        source = 'native-result';
      } else if (!dispatched) {
        source = 'not-started';
      } else if (signal.aborted || (pendingOutcome && forcedStop)) {
        source = 'forced-stop';
      } else {
        source = 'unverified';
      }

      stopped.resolve({
        process: unknown ? 'unknown' : 'stopped',
        source,
        ...(result ? { result } : {}),
      });
      if (result) {
        await emit(result);
      } else {
        await emit({
          kind: 'lost',
          message: unknown
            ? 'Antigravity process-tree settlement is unknown.'
            : 'Antigravity stopped without a confirmed native outcome.',
        });
      }
    }
  })();

  return {
    done,
    settlement: stopped.promise,
    respond(key, response) {
      if (closed || !dispatched || !interactions) {
        return Promise.reject(
          new SessionError('INTERACTION_EXPIRED', 'The native question expired.'),
        );
      }

      return interactions.respond(key, response);
    },
  };
}
