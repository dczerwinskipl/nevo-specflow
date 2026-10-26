import type {
  CreateSession,
  StartTurn,
  RespondInteraction,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import { SessionLimits, utf8Bytes } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';
import { setTimeout as delay } from 'node:timers/promises';
import type { SessionStore } from '../persistence/store';
import type { DriverFact, SnapshotSource, StartAdmission } from '../persistence/protocol';
import type { SessionDriver, ProviderOperation, Invocation } from '../providers/driver';
import { validateDriverFact } from '../providers/facts';

interface ActiveInvocation {
  controller: AbortController;
  operation?: ProviderOperation;
  done: Promise<void>;
  emit: (fact: DriverFact) => Promise<void>;
}
export function createSessionCoordinator(
  store: SessionStore,
  drivers: SessionDriver | readonly SessionDriver[],
  projectId: string,
  available = true,
  executionContext: Invocation['executionContext'] = { kind: 'no-effects' },
) {
  const driverList: readonly SessionDriver[] = Array.isArray(drivers)
    ? drivers
    : [drivers as SessionDriver];
  const registry = new Map<string, SessionDriver>(
    driverList.map((driver) => [driver.describe().providerId, driver]),
  );
  function driverFor(providerId: string) {
    const driver = available ? registry.get(providerId) : undefined;
    if (!driver) throw new SessionError('PROVIDER_UNAVAILABLE', 'Session provider is not enabled.');
    return driver;
  }
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T> | T): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new SessionError('PROVIDER_UNAVAILABLE', 'Provider discovery or validation timed out.'),
        );
      }, 10000);
      timer.unref();
    });
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function validate(driver: SessionDriver, selection: Invocation['selection']) {
    await bounded((signal) => driver.validate(selection, signal));
  }
  const active = new Map<string, ActiveInvocation>();
  let closed = false;
  const call = store.call;
  async function snapshot(sessionId: string, actor: string): Promise<SessionSnapshot> {
    return (await call<SnapshotSource>({ op: 'snapshot', sessionId, actor })).snapshot;
  }
  function accepting() {
    if (closed) throw new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Runtime is stopping.');
  }
  return {
    store,
    snapshot,
    describe: () => [...registry.values()][0]?.describe(),
    provider: (providerId: string) =>
      available ? registry.get(providerId)?.describe() : undefined,
    available: (providerId: string) =>
      available && registry.get(providerId)?.describe().readiness === 'ready',
    async providers() {
      if (!available) return [];
      return Promise.all(
        [...registry.values()].map(async (driver) => {
          try {
            if (driver.refresh) await bounded((signal) => driver.refresh!(signal));
            return driver.describe();
          } catch {
            return {
              ...driver.describe(),
              readiness: 'unavailable' as const,
              reason: 'Provider discovery could not be completed.',
            };
          }
        }),
      );
    },
    async create(actor: string, input: CreateSession): Promise<{ sessionId: string }> {
      accepting();
      const cached = await call<{ sessionId: string } | undefined>({
        op: 'replay',
        actor,
        command: 'create',
        scope: projectId,
        requestId: input.requestId,
        input,
      });
      if (cached) return cached;
      if (!available)
        throw new SessionError('PROVIDER_UNAVAILABLE', 'No Session provider is enabled.');
      const driver = driverFor(input.providerId);
      await validate(driver, input);
      return call({ op: 'create', actor, input });
    },
    async start(actor: string, sessionId: string, input: StartTurn): Promise<{ turnId: string }> {
      accepting();
      const cached = await call<{ turnId: string } | undefined>({
        op: 'replay',
        actor,
        command: 'start',
        scope: sessionId,
        requestId: input.requestId,
        input,
      });
      if (cached) return { turnId: cached.turnId };
      if (!available)
        throw new SessionError('PROVIDER_UNAVAILABLE', 'No Session provider is enabled.');
      if (!input.message.trim() || utf8Bytes(input.message) > SessionLimits.messageBytes)
        throw new SessionError('SESSION_INPUT_INVALID', 'A nonempty bounded message is required.');
      const before = await snapshot(sessionId, actor);
      const selection = {
        providerId: before.session.providerId,
        mode: before.session.mode,
        ...(before.session.modelId ? { modelId: before.session.modelId } : {}),
        ...(before.session.effort ? { effort: before.session.effort } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
      };
      const driver = driverFor(selection.providerId);
      await validate(driver, selection);
      const native = selection.providerId !== 'mock' && executionContext.kind === 'read-only';
      const admitted = await call<StartAdmission>({
        op: 'start',
        actor,
        sessionId,
        input,
        ...(native
          ? { nativeWorkspace: executionContext.workspace, nativeScope: driver.contextScope?.() }
          : {}),
      });
      if (!admitted.fresh) return { turnId: admitted.turnId };
      if (closed) return { turnId: admitted.turnId };
      const controller = new AbortController();
      let seq = 0,
        tail = Promise.resolve();
      let uncertain = false;
      const emit = async (fact: DriverFact) => {
        validateDriverFact(fact);
        if (fact.kind === 'text' && utf8Bytes(fact.text) > SessionLimits.chunkBytes)
          throw new SessionError('SESSION_PAYLOAD_TOO_LARGE', 'Driver text chunk exceeds budget.');
        if (utf8Bytes(JSON.stringify(fact)) > SessionLimits.eventBytes)
          throw new SessionError('SESSION_PAYLOAD_TOO_LARGE', 'Driver fact exceeds budget.');
        const operation = tail.then(async () => {
          const next = seq + 1;
          const accepted = await call<boolean>({
            op: 'fact',
            sessionId,
            turnId: admitted.turnId,
            invocationId: admitted.invocationId,
            driverSeq: next,
            fact,
          });
          if (accepted && fact.kind === 'lost') uncertain = true;
          if (accepted && fact.kind === 'outcome') uncertain = false;
          seq = next;
        });
        tail = operation.catch(() => undefined);
        await operation;
      };
      const live: ActiveInvocation = { controller, emit, done: Promise.resolve() };
      active.set(admitted.turnId, live);
      live.done = (async () => {
        try {
          live.operation = driver.start(
            {
              sessionId,
              turnId: admitted.turnId,
              invocationId: admitted.invocationId,
              request: input,
              selection,
              executionContext:
                selection.providerId === 'mock' ? { kind: 'no-effects' } : executionContext,
              ...(admitted.providerContext
                ? {
                    providerContext: admitted.providerContext,
                    beforeDispatch: async () => {
                      await call({
                        op: 'dispatch-intent',
                        sessionId,
                        turnId: admitted.turnId,
                        invocationId: admitted.invocationId,
                      });
                    },
                  }
                : {}),
            },
            emit,
            controller.signal,
          );
          await live.operation.done;
          // A transport ending is not evidence that a previously lost operation settled.
          if (uncertain) return;
          // A settled read-only operation without protocol outcome is interrupted, never invented success.
          await emit({
            kind: 'outcome',
            outcome: 'interrupted',
            error: {
              code: 'INTERRUPTED',
              message: 'Provider operation ended without a terminal outcome.',
            },
          });
        } catch (error) {
          if (uncertain) return;
          await emit({
            kind: 'outcome',
            outcome: controller.signal.aborted
              ? controller.signal.reason === 'shutdown'
                ? 'interrupted'
                : 'cancelled'
              : 'failed',
            ...(controller.signal.aborted
              ? {}
              : {
                  error: {
                    code: 'PROVIDER_FAILED',
                    message:
                      error instanceof SessionError ? error.message : 'Provider operation failed.',
                  },
                }),
          });
        } finally {
          if (active.get(admitted.turnId) === live) active.delete(admitted.turnId);
        }
      })();
      // Store errors must not become unhandled rejection; lifecycle remains recoverable on disk.
      void live.done.catch(() => undefined);
      return { turnId: admitted.turnId };
    },
    async cancel(actor: string, sessionId: string, turnId: string, requestId: string) {
      accepting();
      await call({ op: 'cancel', actor, sessionId, turnId, requestId });
      active.get(turnId)?.controller.abort();
      return { turnId };
    },
    async respond(
      actor: string,
      sessionId: string,
      interactionId: string,
      input: RespondInteraction,
    ) {
      accepting();
      if (input.kind === 'question' && utf8Bytes(input.answer.text ?? '') > 16384)
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Answer exceeds byte budget.');
      const result = await call<{
        turnId: string;
        interactionId: string;
        fresh: boolean;
        nativeKey: string;
      }>({ op: 'respond', actor, sessionId, interactionId, input });
      if (result.fresh) {
        const live = active.get(result.turnId);
        if (!live?.operation)
          throw new SessionError('INTERACTION_EXPIRED', 'Live operation has ended.');
        try {
          await live.operation.respond(result.nativeKey, input);
        } catch {
          await live.emit({
            kind: 'lost',
            message: 'Provider interaction continuation is unavailable.',
          });
        }
      }
      return { turnId: result.turnId, interactionId };
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const live of active.values()) live.controller.abort('shutdown');
      const timeout = new AbortController();
      try {
        await Promise.race([
          Promise.all([...active.values()].map((live) => live.done)),
          delay(5000, undefined, { signal: timeout.signal }).then(() => {
            throw new SessionError(
              'SESSION_RECOVERY_REQUIRED',
              'Provider shutdown could not be settled.',
            );
          }),
        ]);
        await store.close();
      } catch (error) {
        await store.abandon();
        throw error;
      } finally {
        timeout.abort();
      }
    },
  };
}
export type SessionCoordinator = ReturnType<typeof createSessionCoordinator>;
