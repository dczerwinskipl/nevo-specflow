import type { DriverFact } from '../persistence/protocol';
import type { Invocation, SessionDriver, ProviderOperation, EmitFact } from '../providers/driver';
import { validateDriverFact } from '../providers/facts';
import { SessionError } from '../errors';
import type { SessionEffects, SessionEffectClaim } from './effects';

type Outcome = Extract<DriverFact, { kind: 'outcome' }>;
/** Engine owns effects; the SQLite Worker remains the only canonical Turn authority. */
export function createManagedInvocation(options: {
  invocation: Invocation;
  binding: string;
  driver: SessionDriver;
  effects: SessionEffects;
  signal: AbortSignal;
  stop(): void;
  persist: EmitFact;
  finalize(
    result: Outcome,
    source: 'native-result' | 'not-dispatched',
    recovered?: boolean,
  ): Promise<void>;
}): ProviderOperation & { emit: EmitFact } {
  let native: ProviderOperation | undefined;
  let claim: SessionEffectClaim | undefined;
  let driverInvoked = false;
  let observed: Outcome | undefined;
  let contradictory = false;
  const emit: EmitFact = async (fact) => {
    validateDriverFact(fact);
    if (fact.kind === 'outcome') {
      if (
        observed &&
        (observed.outcome !== fact.outcome ||
          observed.error?.code !== fact.error?.code ||
          observed.error?.message !== fact.error?.message)
      ) {
        contradictory = true;

        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'Provider outcomes contradict each other.',
        );
      }

      observed = fact;

      return;
    }

    if (fact.kind === 'lost') {
      options.stop();
    }

    await options.persist(fact);
  };

  async function unknown(message: string) {
    options.stop();
    await claim?.unknown().catch(() => undefined);
    await options.persist({ kind: 'lost', message });
  }

  const done = (async () => {
    try {
      const context = options.invocation.executionContext;
      if (context.kind !== 'read-only' || !context.workspaceIdentity) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Verified workspace execution context is required.',
        );
      }

      claim = await options.effects.admit({
        invocationId: options.invocation.invocationId,
        sessionId: options.invocation.sessionId,
        binding: options.binding,
        workspace: context.workspace,
        workspaceIdentity: context.workspaceIdentity,
      });
      if (options.signal.aborted) {
        await claim.abandon();
        await options.finalize(
          {
            kind: 'outcome',
            outcome: options.signal.reason === 'shutdown' ? 'interrupted' : 'cancelled',
          },
          'not-dispatched',
        );

        return;
      }

      await claim.dispatch();
      if (options.signal.aborted) {
        const outcome = options.signal.reason === 'shutdown' ? 'interrupted' : 'cancelled';
        await claim.settle({ process: 'stopped', outcome });
        await options.finalize({ kind: 'outcome', outcome }, 'native-result');

        return;
      }

      driverInvoked = true;
      native = options.driver.start(
        {
          ...options.invocation,
          executionContext: {
            ...context,
            workspaceIdentity: context.workspaceIdentity,
            kind: 'workspace-write',
            admission: { operationId: options.invocation.invocationId, scope: 'project' },
          },
        },
        emit,
        options.signal,
      );
      // A rejected canonical write need not destroy the process owner's independent
      // proof. Wait for its final disposition, never relaunch the native operation.
      let outputUncertain = false;
      await native.done.catch(() => {
        outputUncertain = true;
      });
      const evidence = await native.settlement?.catch(() => undefined);
      if (
        evidence?.process !== 'stopped' ||
        !evidence.result ||
        contradictory ||
        evidence.source === 'forced-stop' ||
        evidence.source === 'unverified'
      ) {
        await unknown('Agent process or execution outcome cannot be verified.');

        return;
      }

      const result = evidence.result;
      validateDriverFact(result);
      if (
        observed &&
        (observed.outcome !== result.outcome ||
          observed.error?.code !== result.error?.code ||
          observed.error?.message !== result.error?.message)
      ) {
        await unknown('Agent settlement evidence contradicts its reported outcome.');

        return;
      }

      await claim.settle({ process: 'stopped', outcome: result.outcome });
      await options.finalize(result, 'native-result', outputUncertain);
    } catch (error) {
      if (
        !driverInvoked &&
        error instanceof SessionError &&
        error.code === 'TURN_CONFLICT' &&
        !claim
      ) {
        await options.finalize(
          {
            kind: 'outcome',
            outcome: 'failed',
            error: { code: 'TURN_CONFLICT', message: error.message },
          },
          'not-dispatched',
        );

        return;
      }

      if (!driverInvoked && claim) {
        const result: Outcome = {
          kind: 'outcome',
          outcome: options.signal.aborted ? 'cancelled' : 'failed',
          error: { code: 'PROVIDER_UNAVAILABLE', message: 'Agent execution could not start.' },
        };
        try {
          // This Runtime has not called the driver: the stopped/not-started
          // evidence is positive, even if an Engine acknowledgement disappeared.
          try {
            await claim.abandon();
          } catch {
            await claim.settle({ process: 'stopped', outcome: result.outcome });
          }

          await options.finalize(result, 'not-dispatched');

          return;
        } catch {
          /* Preserve ambiguous publication; recovery reads the same claim. */
        }
      }

      await unknown('Agent lifecycle or Engine settlement could not be persisted.');
    }
  })();

  return {
    done,
    emit,
    respond(key, response) {
      if (!native) {
        throw new SessionError('INTERACTION_EXPIRED', 'Agent operation has not started.');
      }

      return native.respond(key, response);
    },
  };
}
