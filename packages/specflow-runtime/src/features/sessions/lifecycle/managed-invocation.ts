import type { DriverFact } from '../persistence/protocol';
import type { Invocation, SessionDriver, ProviderOperation, EmitFact } from '../providers/driver';
import { validateDriverFact } from '../providers/facts';
import { SessionError } from '../errors';
import { planPermissionAllowlist } from './permission-allowlist';
import type { SessionEffects, SessionEffectClaim } from './effects';
import {
  redactFact,
  type InvocationCapabilities,
  type InvocationGrant,
} from './invocation-capabilities';

type Outcome = Extract<DriverFact, { kind: 'outcome' }>;
/** Engine owns effects; the SQLite Worker remains the only canonical Turn authority. */
export function createManagedInvocation(options: {
  invocation: Invocation;
  binding: string;
  driver: SessionDriver;
  effects: SessionEffects;
  /**
   * Mints the invocation capability of a Turn of a Session associated with a Specification (D11):
   * after the Engine claim, before the driver starts; active once the claim is dispatched, revoked
   * when the Turn's transport ends, before the claim settles.
   */
  capabilities?: InvocationCapabilities;
  /** The agent attempt the Turn is bound to (agent step execution): recorded in the claim, scopes the capability. */
  agentAttempt?: { readonly attemptId: string };
  /** The archetype allowlist of an agent step execution Turn (D20); reported when the driver cannot apply it. */
  permissions?: { readonly allow: readonly string[] };
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
  let grant: InvocationGrant | undefined;
  // One revocation per invocation: every later path waits for the same outcome.
  let revocation: Promise<'drained' | 'timed-out'> | undefined;
  const revoke = () => (grant ? (revocation ??= grant.revoke()) : Promise.resolve('drained'));
  // Nothing the provider reports is stored with a capability value in it.
  const redact = <T extends DriverFact>(fact: T): T =>
    grant ? redactFact(fact, (text) => grant!.redact(text)) : fact;
  const emit: EmitFact = async (reported) => {
    const fact = redact(reported);
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

  // The claim is marked dispatched only once the provider process's native-stop evidence is
  // durable, so a dispatched claim always has a recorded process to prove stopped. Until then it
  // stays admitted: no provider process of this invocation can have received input.
  let dispatchAttempted = false,
    dispatched = false;

  async function unknown(message: string) {
    await revoke();
    options.stop();
    // An admitted claim keeps its not-dispatched proof for recovery; only a possibly dispatched
    // one becomes unknown.
    if (dispatchAttempted) {
      await claim?.unknown().catch(() => undefined);
    }

    await options.persist({ kind: 'lost', message });
  }

  const recordProcess = options.invocation.recordProcess;
  const beforeDispatch = options.invocation.beforeDispatch;
  const evidenceFirst: Pick<Invocation, 'recordProcess' | 'beforeDispatch'> = {
    ...(recordProcess
      ? {
          recordProcess: async (identity) => {
            await recordProcess(identity);
            dispatchAttempted = true;
            await claim!.dispatch();
            dispatched = true;
            grant?.activate();
          },
        }
      : {}),
    ...(beforeDispatch
      ? {
          beforeDispatch: async () => {
            if (!dispatched) {
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Agent process evidence was not recorded before dispatch.',
              );
            }

            await beforeDispatch();
          },
        }
      : {}),
  };

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
        ...(context.specId !== undefined ? { specId: context.specId } : {}),
        ...(options.agentAttempt ? { attemptId: options.agentAttempt.attemptId } : {}),
      });
      // Every write driver works only in the root the Engine claimed; checked before dispatch, so a
      // mismatch is abandoned as never started.
      if (claim.workspace !== context.workspace) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'The claimed workspace is not the execution workspace.',
        );
      }

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

      if (options.agentAttempt && (!options.capabilities || context.specId === undefined)) {
        // An attempt's Turn writes only through the broker: never dispatched without a capability.
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'An agent attempt runs only in its Specification with the agent broker.',
        );
      }

      if (options.capabilities && context.specId !== undefined) {
        grant = await options.capabilities.mint({
          invocationId: options.invocation.invocationId,
          sessionId: options.invocation.sessionId,
          turnId: options.invocation.turnId,
          specId: context.specId,
          workspace: claim.workspace,
          provider: options.invocation.selection.providerId,
          ...(options.invocation.selection.modelId !== undefined
            ? { model: options.invocation.selection.modelId }
            : {}),
          ...(options.agentAttempt ? { attemptId: options.agentAttempt.attemptId } : {}),
        });
      }

      const allowlist = planPermissionAllowlist(
        options.invocation.selection.providerId,
        options.driver.supportsPermissionAllowlist === true,
        options.permissions?.allow ?? [],
      );
      if (allowlist.notice !== undefined) {
        const key = 'permission-allowlist';
        await emit({
          kind: 'work-open',
          key,
          workKind: 'commentary',
          title: 'Permission allowlist',
        });
        await emit({
          kind: 'text',
          key,
          channel: 'commentary',
          text: allowlist.notice,
          notice: 'warning',
        });
      }

      driverInvoked = true;
      native = options.driver.start(
        {
          ...options.invocation,
          ...(allowlist.permissions ? { permissions: allowlist.permissions } : {}),
          ...evidenceFirst,
          ...(grant
            ? { runtimeEnvironment: { values: grant.environment, secrets: grant.secrets } }
            : {}),
          executionContext: {
            ...context,
            workspaceIdentity: context.workspaceIdentity,
            kind: 'workspace-write',
            admission: {
              operationId: options.invocation.invocationId,
              scope: 'project',
              workspace: claim.workspace,
            },
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
      // The Turn is ending: its capability admits nothing more, and the broker calls still running
      // finish before any settlement.
      if ((await revoke()) === 'timed-out') {
        // A broker write may still land: recovery or finalize decides, never a normal settlement.
        await unknown('Agent broker calls were still running when the Turn ended.');

        return;
      }

      const settled = await native.settlement?.catch(() => undefined);
      const evidence = settled?.result ? { ...settled, result: redact(settled.result) } : settled;
      if (!dispatchAttempted) {
        // No provider process of this invocation was recorded, so none received input: the claim
        // is still admitted and settles as never dispatched.
        const reported = evidence?.result ?? observed;
        const result: Outcome = options.signal.aborted
          ? {
              kind: 'outcome',
              outcome: options.signal.reason === 'shutdown' ? 'interrupted' : 'cancelled',
            }
          : reported && reported.outcome !== 'completed'
            ? reported
            : {
                kind: 'outcome',
                outcome: 'failed',
                error: {
                  code: 'PROVIDER_UNAVAILABLE',
                  message: 'Agent execution could not start.',
                },
              };
        await claim.abandon();
        await options.finalize(result, 'not-dispatched');

        return;
      }

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
    } finally {
      await revoke();
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
