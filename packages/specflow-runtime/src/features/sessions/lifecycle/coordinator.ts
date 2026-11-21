import type {
  CreateSession,
  StartTurn,
  RespondInteraction,
  SessionSnapshot,
  RenameSession,
  ArchiveSession,
  ReconcileTurnResult,
} from '@nevo/specflow-contracts/sessions';
import { SessionLimits, utf8Bytes } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';
import { setTimeout as delay } from 'node:timers/promises';
import type { SessionStore } from '../persistence/store';
import {
  createFingerprint,
  type AssociationWrite,
  type StoredAssociation,
} from '../persistence/associations';
import type {
  DriverFact,
  SnapshotSource,
  StartAdmission,
  StoreCommand,
  EffectRecoveryCandidate,
  SessionView,
} from '../persistence/protocol';
import type { SessionDriver, ProviderOperation, Invocation } from '../providers/driver';
import { ProviderTimeouts } from '../providers/driver';
import { validateDriverFact } from '../providers/facts';
import { nativeStopEvidence } from '../providers/process';
import { executionBinding, type SessionEffects } from './effects';
import { createManagedInvocation } from './managed-invocation';
import { redactFact, type InvocationCapabilities } from './invocation-capabilities';
import { redactAgentCapabilityShapes } from '@nevo/specflow-contracts/runtime';
import { createSessionTelemetryService } from './telemetry';

/** In-process options of a Turn start (Ask agent); never taken from a request. */
export interface TurnStartOptions {
  readonly ids?: { readonly turnId: string; readonly invocationId: string };
  readonly agentAttempt?: { readonly attemptId: string };
}

interface ActiveInvocation {
  sessionId: string;
  invocationId: string;
  controller: AbortController;
  operation?: ProviderOperation;
  done: Promise<void>;
  emit: (fact: DriverFact) => Promise<void>;
}

/** Where a Specification's Session was resolved to run: its workspace, root and checkout incarnation. */
interface ResolvedWorkspace {
  readonly specId: string;
  readonly workspaceId: string;
  readonly root: string;
  readonly workspaceIdentity: string;
}

export function createSessionCoordinator(
  store: SessionStore,
  drivers: SessionDriver | readonly SessionDriver[],
  projectId: string,
  available = true,
  executionContext: Exclude<Invocation['executionContext'], { kind: 'workspace-write' }> = {
    kind: 'no-effects',
  },
  effects?: SessionEffects,
  /**
   * The verified root of a Specification's workspace (its worktree, or the primary checkout),
   * resolved through the Engine at Turn start. Refuses with a SessionError when unavailable.
   */
  specificationWorkspace?: (specId: string) => Promise<{
    readonly root: string;
    readonly workspaceId: string;
    readonly workspaceIdentity: string;
  }>,
  /**
   * Turns registered by workspace, so Close never removes a checkout an agent works in; `undefined`
   * while a Close holds the workspace (the Turn is refused).
   */
  workspaceOccupancy?: {
    beginTurn(workspaceId: string, sessionId: string): { end(): void } | undefined;
  },
  /** Gives a write Turn of a Specification's Session its invocation capability (D11). */
  invocationCapabilities?: InvocationCapabilities,
) {
  const driverList: readonly SessionDriver[] = Array.isArray(drivers)
    ? drivers
    : [drivers as SessionDriver];
  const registry = new Map<string, SessionDriver>(
    driverList.map((driver) => [driver.describe().providerId, driver]),
  );
  const telemetry = createSessionTelemetryService(store, (id) =>
    available ? registry.get(id) : undefined,
  );
  function driverFor(providerId: string) {
    const driver = available ? registry.get(providerId) : undefined;
    if (!driver) {
      throw new SessionError('PROVIDER_UNAVAILABLE', 'Session provider is not enabled.');
    }

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
      }, ProviderTimeouts.discoveryMs);
      timer.unref();
    });
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function validate(driver: SessionDriver, selection: Invocation['selection']) {
    if (
      selection.mode === 'workspace-write' &&
      (!effects ||
        executionContext.kind !== 'read-only' ||
        !executionContext.workspaceIdentity ||
        driver.supportsManagedWrites !== true)
    ) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Managed agent execution is not available in this Runtime.',
      );
    }

    await bounded((signal) => driver.validate(selection, signal));
  }

  function worktreeProviderUnsupported() {
    return new SessionError(
      'CAPABILITY_UNSUPPORTED',
      "This provider runs only in the Runtime's own checkout and cannot work in this Specification's worktree.",
      { reason: 'specification-worktree-provider-unsupported' },
    );
  }

  /**
   * Whether the Specification's workspace is a checkout other than the Runtime's own, read for the
   * catalogue and the create, which say early what a Turn start refuses. Unresolvable is `false`:
   * the Turn start resolves it again and refuses with its own reason.
   */
  async function inSeparateWorktree(specId: string): Promise<boolean> {
    if (!specificationWorkspace || executionContext.kind !== 'read-only') {
      return false;
    }

    try {
      return (await specificationWorkspace(specId)).root !== executionContext.workspace;
    } catch {
      return false;
    }
  }

  /** A provider bound to the Runtime's checkout (the mock runs nowhere else either). */
  const checkoutBound = (driver: SessionDriver) =>
    driver.supportsSessionWorkspaces !== true && driver.describe().providerId !== 'mock';

  /**
   * A Session associated with a Specification runs in that Specification's workspace; a standalone
   * Session (or a Runtime without the Engine) runs in the Runtime's own verified checkout. In write
   * mode the Engine claims that workspace (the claim stays project-wide); a provider that can only
   * run in the Runtime's checkout is refused elsewhere.
   */
  async function sessionExecutionContext(
    sessionId: string,
    driver: SessionDriver,
  ): Promise<{
    context: typeof executionContext;
    /** For a Session associated with a Specification: where it was resolved to run. */
    resolved?: ResolvedWorkspace;
  }> {
    if (!specificationWorkspace || executionContext.kind !== 'read-only') {
      return { context: executionContext };
    }

    const association = await call<StoredAssociation | null>({ op: 'association', sessionId });
    if (!association) {
      return { context: executionContext };
    }

    const workspace = await specificationWorkspace(association.specId);
    if (
      workspace.root !== executionContext.workspace &&
      driver.supportsSessionWorkspaces !== true
    ) {
      throw worktreeProviderUnsupported();
    }

    return {
      resolved: {
        specId: association.specId,
        workspaceId: workspace.workspaceId,
        root: workspace.root,
        workspaceIdentity: workspace.workspaceIdentity,
      },
      context:
        workspace.root === executionContext.workspace
          ? { ...executionContext, specId: association.specId }
          : {
              kind: 'read-only',
              workspace: workspace.root,
              temporaryRoot: executionContext.temporaryRoot,
              specId: association.specId,
              // Only a Runtime with Engine effects binds executions to a workspace incarnation.
              ...(executionContext.workspaceIdentity
                ? { workspaceIdentity: workspace.workspaceIdentity }
                : {}),
            },
    };
  }

  /**
   * Registers the Turn in its Specification's workspace, then verifies the resolution again: a Close
   * that starts after the registration sees the Turn and refuses, and one that started before it
   * (the resolution was read without a hold) is seen here. Any change ends the hold and refuses,
   * including a checkout recreated under the same path (another incarnation, another identity).
   */
  async function beginTurnIn(resolved: ResolvedWorkspace | undefined, sessionId: string) {
    if (resolved === undefined || !workspaceOccupancy || !specificationWorkspace) {
      return undefined;
    }

    const hold = workspaceOccupancy.beginTurn(resolved.workspaceId, sessionId);
    if (!hold) {
      throw new SessionError(
        'TURN_CONFLICT',
        "The Specification's worktree is being closed, so no agent can start in it.",
        { reason: 'specification-close-in-progress' },
      );
    }

    try {
      const current = await specificationWorkspace(resolved.specId);
      if (
        current.workspaceId !== resolved.workspaceId ||
        current.root !== resolved.root ||
        current.workspaceIdentity !== resolved.workspaceIdentity
      ) {
        throw new SessionError(
          'TURN_CONFLICT',
          "The Specification's workspace changed while the Turn was starting. Start it again.",
          { reason: 'specification-workspace-changed' },
        );
      }
    } catch (error) {
      hold.end();

      throw error;
    }

    return hold;
  }

  const active = new Map<string, ActiveInvocation>();
  let closed = false;
  const call = store.call;
  async function persistFact(command: Extract<StoreCommand, { op: 'fact' }>) {
    const deadline = performance.now() + 2000;
    const backoff = [25, 100];
    for (let attempt = 0; ; attempt++) {
      try {
        return await call<boolean>(command);
      } catch (error) {
        // Retry persistence of this exact sequenced fact, never provider input.
        // Worker deduplication handles a commit whose acknowledgement was lost.
        if (
          !(error instanceof SessionError) ||
          error.code !== 'SESSION_STORE_BUSY' ||
          closed ||
          attempt >= backoff.length ||
          performance.now() >= deadline
        ) {
          throw error;
        }

        await delay(backoff[attempt]);
        if (closed || performance.now() >= deadline) {
          throw error;
        }
      }
    }
  }

  async function snapshot(sessionId: string, actor: string): Promise<SessionSnapshot> {
    return (await call<SnapshotSource>({ op: 'snapshot', sessionId, actor })).snapshot;
  }

  function accepting() {
    if (closed) {
      throw new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Runtime is stopping.');
    }
  }

  /**
   * Settles a detached Turn on positive evidence only: the Engine claim's own settlement, else
   * native-stop evidence (no process of the identity recorded before dispatch remains), which
   * first settles the claim through its lifecycle. "Cannot tell" and a live process stay unknown.
   */
  async function recover(candidate: EffectRecoveryCandidate, actor: string, requestId: string) {
    const { nativeProcess, binding, ...identity } = candidate;
    if (active.has(candidate.turnId) || (binding !== undefined && !effects)) {
      throw new SessionError(
        'SESSION_RECOVERY_REQUIRED',
        'Execution is still attached or has no recovery evidence service.',
      );
    }

    const evidence = nativeProcess ? nativeStopEvidence(nativeProcess) : undefined;
    const claim =
      binding !== undefined
        ? {
            ...identity,
            binding,
            // A recorded process that may still run is never retired as not dispatched.
            nativeDispatched:
              identity.nativeDispatched || (evidence !== undefined && evidence !== 'stopped'),
          }
        : undefined;
    const receipt = claim ? await effects!.reconcile(claim) : undefined;
    // An interrupted native-result receipt of a recorded process is this path's own claim
    // settlement, committed before a crash interrupted the Turn's settlement: finish it alike.
    let stopped =
      nativeProcess !== undefined &&
      receipt?.source === 'native-result' &&
      receipt.outcome === 'interrupted';
    if (!receipt && nativeProcess) {
      if (evidence !== 'stopped') {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          evidence === 'running'
            ? 'The agent process of this Turn is still running.'
            : 'Whether the agent process of this Turn stopped cannot be established.',
        );
      }

      if (claim) {
        await effects!.settleStopped(claim);
      }

      stopped = true;
    }

    if (!receipt && !stopped) {
      throw new SessionError(
        'SESSION_RECOVERY_REQUIRED',
        'No positive Engine settlement evidence is available.',
      );
    }

    return call<ReconcileTurnResult>({
      op: 'reconcile-effect',
      ...identity,
      ...(binding !== undefined ? { binding } : {}),
      actor,
      requestId,
      ...(stopped
        ? {
            source: 'native-stopped' as const,
            outcome: 'interrupted' as const,
            error: {
              code: 'PROCESS_STOPPED',
              message: 'The agent process stopped while its outcome was not recorded.',
            },
          }
        : { source: receipt!.source, outcome: receipt!.outcome }),
      recovered: true,
    });
  }

  return {
    store,
    telemetry,
    snapshot,
    describe: () => [...registry.values()][0]?.describe(),
    provider: (providerId: string) =>
      available ? registry.get(providerId)?.describe() : undefined,
    available: (providerId: string) =>
      available && registry.get(providerId)?.describe().readiness === 'ready',
    /** Some enabled provider is ready now (its last known readiness; no discovery is run). */
    usable: () =>
      available && [...registry.values()].some((driver) => driver.describe().readiness === 'ready'),
    /**
     * The Sessions with an unsettled native Turn in the checkout at `root`, this run's and those an
     * earlier run left `unknown` (which never enter the in-process workspace occupancy).
     */
    unsettledTurnsIn: (root: string) => call<readonly string[]>({ op: 'checkout-turns', root }),
    /** Startup recovery: every detached Turn that positive evidence settles, without a click. */
    async recoverEffects() {
      let afterSession: string | undefined;
      while (!closed) {
        const candidates = await call<EffectRecoveryCandidate[]>({
          op: 'effect-candidates',
          afterSession,
        });
        if (!candidates.length) {
          break;
        }

        for (const candidate of candidates) {
          if (afterSession !== undefined && candidate.sessionId <= afterSession) {
            throw new SessionError(
              'SESSION_STORE_UNAVAILABLE',
              'Execution recovery cursor did not advance.',
            );
          }

          afterSession = candidate.sessionId;
          try {
            await recover(candidate, 'runtime-recovery', candidate.invocationId);
          } catch {
            /* Missing proof remains unknown; continue past it without redispatch. */
          }
        }
      }
    },
    async reconcile(actor: string, sessionId: string, turnId: string, requestId: string) {
      accepting();
      const previous = await call<ReconcileTurnResult | undefined>({
        op: 'replay',
        actor,
        command: 'reconcile',
        scope: sessionId + ':' + turnId,
        requestId,
        input: { requestId },
      });
      if (previous) {
        return previous;
      }

      const [candidate] = await call<EffectRecoveryCandidate[]>({
        op: 'effect-candidates',
        sessionId,
        turnId,
      });
      if (!candidate) {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'This Turn has no pending verifiable execution.',
        );
      }

      return recover(candidate, actor, requestId);
    },
    /**
     * The provider catalogue; read for a Session started in `specId`, a provider that cannot run in
     * that Specification's separate worktree is listed unavailable
     * (`SPECIFICATION_WORKTREE_UNSUPPORTED`), as its create and Turn start would refuse it.
     */
    async providers(specId?: string, options: { recheck?: boolean } = {}) {
      if (!available) {
        return [];
      }

      const drivers = [...registry.values()];
      const separate =
        specId !== undefined && drivers.some(checkoutBound) && (await inSeparateWorktree(specId));

      return Promise.all(
        drivers.map(async (driver) => {
          if (separate && checkoutBound(driver)) {
            return {
              ...driver.describe(),
              readiness: 'unavailable' as const,
              reasonCode: 'SPECIFICATION_WORKTREE_UNSUPPORTED' as const,
              reason:
                "This provider runs only in the Runtime's own checkout and cannot work in this Specification's worktree.",
            };
          }

          try {
            if (driver.refresh) {
              await bounded((signal) => driver.refresh!(signal, options));
            }

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
    /** `association` is written verbatim; only a Turn start reads it (execution workspace). */
    /** `options.sessionId` is in-process only (agent step execution): the Session's chosen id. */
    async create(
      actor: string,
      input: CreateSession,
      association?: AssociationWrite,
      options: { readonly sessionId?: string } = {},
    ): Promise<{ sessionId: string }> {
      input = Object.freeze(structuredClone(input));
      association = association && Object.freeze(structuredClone(association));
      accepting();
      const cached = await call<{ sessionId: string } | undefined>({
        op: 'replay',
        actor,
        command: 'create',
        scope: projectId,
        requestId: input.requestId,
        input: createFingerprint(input, association),
      });
      if (cached) {
        return cached;
      }

      if (!available) {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'No Session provider is enabled.');
      }

      const driver = driverFor(input.providerId);
      await validate(driver, input);
      if (association && checkoutBound(driver) && (await inSeparateWorktree(association.specId))) {
        throw worktreeProviderUnsupported();
      }

      return call({
        op: 'create',
        actor,
        input,
        ...(association ? { association } : {}),
        ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      });
    },
    /**
     * Starts a Turn. `options` are in-process only (Ask agent): the Turn and invocation ids chosen
     * before the Turn exists and the agent attempt the Turn is bound to; such a Turn must write.
     */
    async start(
      actor: string,
      sessionId: string,
      input: StartTurn,
      options: TurnStartOptions = {},
    ): Promise<{ turnId: string }> {
      input = Object.freeze(structuredClone(input));
      accepting();
      const cached = await call<{ turnId: string } | undefined>({
        op: 'replay',
        actor,
        command: 'start',
        scope: sessionId,
        requestId: input.requestId,
        input,
      });
      if (cached) {
        return { turnId: cached.turnId };
      }

      if (!available) {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'No Session provider is enabled.');
      }

      if (!input.message.trim() || utf8Bytes(input.message) > SessionLimits.messageBytes) {
        throw new SessionError('SESSION_INPUT_INVALID', 'A nonempty bounded message is required.');
      }

      const before = await snapshot(sessionId, actor);
      // Early refusal only; the store re-checks archive state inside the admission transaction.
      if (before.session.archivedAt) {
        throw new SessionError('SESSION_ARCHIVED', 'Archived Sessions are read-only.');
      }

      const selection = {
        providerId: before.session.providerId,
        mode: before.session.mode,
        ...(before.session.providerModeId ? { providerModeId: before.session.providerModeId } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.providerModeId ? { providerModeId: input.providerModeId } : {}),
        ...(before.session.modelId ? { modelId: before.session.modelId } : {}),
        ...(before.session.effort ? { effort: before.session.effort } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
      };
      const driver = driverFor(selection.providerId);
      await validate(driver, selection);
      const writing = selection.mode === 'workspace-write';
      if (options.agentAttempt && !writing) {
        throw new SessionError('SESSION_INPUT_INVALID', 'An agent attempt Turn writes.');
      }

      const placement =
        selection.providerId === 'mock'
          ? { context: executionContext }
          : await sessionExecutionContext(sessionId, driver);
      const context = placement.context;
      // Held until the Turn's execution ends; released at once when it never starts.
      const turnHold = await beginTurnIn(placement.resolved, sessionId);
      let handedOver = false;
      try {
        const native = selection.providerId !== 'mock' && context.kind === 'read-only';
        const nativeScope = driver.contextScope?.();
        const binding =
          writing && context.kind === 'read-only'
            ? executionBinding(
                sessionId,
                input.requestId,
                selection,
                nativeScope ?? '',
                context.workspaceIdentity!,
              )
            : undefined;
        const admitted = await call<StartAdmission>({
          op: 'start',
          actor,
          sessionId,
          input,
          ...(native
            ? {
                nativeWorkspace: context.workspace,
                nativeScope,
                nativeContextMode: driver.nativeContextMode ?? 'reserved',
                nativeWorkspaceIdentity: context.workspaceIdentity,
              }
            : {}),
          ...(binding ? { effectBinding: binding } : {}),
          ...(options.ids ? { ids: options.ids } : {}),
        });
        if (!admitted.fresh) {
          return { turnId: admitted.turnId };
        }

        if (closed) {
          return { turnId: admitted.turnId };
        }

        const controller = new AbortController();
        let seq = 0,
          tail = Promise.resolve();
        let uncertain = false;
        const emit = async (reported: DriverFact) => {
          // Whatever the provider reports, nothing shaped like an agent capability is stored.
          const fact = redactFact(reported, redactAgentCapabilityShapes);
          validateDriverFact(fact);
          if (fact.kind === 'text' && utf8Bytes(fact.text) > SessionLimits.chunkBytes) {
            throw new SessionError(
              'SESSION_PAYLOAD_TOO_LARGE',
              'Driver text chunk exceeds budget.',
            );
          }

          if (utf8Bytes(JSON.stringify(fact)) > SessionLimits.eventBytes) {
            throw new SessionError('SESSION_PAYLOAD_TOO_LARGE', 'Driver fact exceeds budget.');
          }

          const operation = tail.then(async () => {
            const next = seq + 1;
            const accepted = await persistFact({
              op: 'fact',
              sessionId,
              turnId: admitted.turnId,
              invocationId: admitted.invocationId,
              driverSeq: next,
              fact,
            });
            // A replayed lost fact may already be committed despite a lost acknowledgement.
            if (fact.kind === 'lost') {
              uncertain = true;
            }

            if (accepted && fact.kind === 'outcome') {
              uncertain = false;
            }

            seq = next;
          });
          tail = operation.catch(() => undefined);
          await operation;
        };

        const live: ActiveInvocation = {
          sessionId,
          invocationId: admitted.invocationId,
          controller,
          emit,
          done: Promise.resolve(),
        };
        active.set(admitted.turnId, live);
        handedOver = true;
        live.done = (async () => {
          try {
            const invocation: Invocation = {
              sessionId,
              turnId: admitted.turnId,
              invocationId: admitted.invocationId,
              request: input,
              selection,
              executionContext: selection.providerId === 'mock' ? { kind: 'no-effects' } : context,
              ...(admitted.providerContext
                ? {
                    providerContext: admitted.providerContext,
                    recordProcess: async (identity) => {
                      await call({
                        op: 'process-identity',
                        sessionId,
                        turnId: admitted.turnId,
                        invocationId: admitted.invocationId,
                        identity,
                      });
                    },
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
            };
            if (writing) {
              const managed = createManagedInvocation({
                invocation,
                binding: binding!,
                driver,
                effects: effects!,
                ...(invocationCapabilities ? { capabilities: invocationCapabilities } : {}),
                ...(options.agentAttempt ? { agentAttempt: options.agentAttempt } : {}),
                signal: controller.signal,
                stop: () => controller.abort('persistence-loss'),
                persist: emit,
                finalize: async (result, source, recovered = false) => {
                  await call({
                    op: 'reconcile-effect',
                    sessionId,
                    turnId: admitted.turnId,
                    invocationId: admitted.invocationId,
                    binding: binding!,
                    actor: 'runtime-execution',
                    requestId: admitted.invocationId,
                    source,
                    outcome: result.outcome,
                    ...(result.error ? { error: result.error } : {}),
                    recovered,
                  });
                },
              });
              live.operation = managed;
              live.emit = managed.emit;
              await managed.done;

              return;
            }

            live.operation = driver.start(invocation, emit, controller.signal);
            await live.operation.done;
            // A transport ending is not evidence that a previously lost operation settled.
            if (uncertain) {
              return;
            }

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
            if (writing) {
              await emit({
                kind: 'lost',
                message: 'Agent lifecycle persistence requires recovery.',
              }).catch(() => undefined);

              return;
            }

            if (uncertain) {
              return;
            }

            if (
              error instanceof SessionError &&
              ['SESSION_STORE_BUSY', 'SESSION_STORE_UNAVAILABLE'].includes(error.code)
            ) {
              // A storage failure says nothing about the provider's execution outcome.
              // If this final write also fails, retain the nonterminal record for restart recovery.
              uncertain = true;
              await emit({
                kind: 'lost',
                message: 'Provider lifecycle persistence could not be confirmed.',
              });

              return;
            }

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
                        error instanceof SessionError
                          ? error.message
                          : 'Provider operation failed.',
                    },
                  }),
            });
          } finally {
            turnHold?.end();
            if (active.get(admitted.turnId) === live) {
              active.delete(admitted.turnId);
            }
          }
        })();
        // Store errors must not become unhandled rejection; lifecycle remains recoverable on disk.
        void live.done.catch(() => undefined);

        return { turnId: admitted.turnId };
      } finally {
        if (!handedOver) {
          turnHold?.end();
        }
      }
    },
    /** Whether the Session has the Turn `turnId` (a Turn start that may have been admitted). */
    hasTurn: (sessionId: string, turnId: string) =>
      call<boolean>({ op: 'has-turn', sessionId, turnId }),
    /** In-process workflow orchestration only: adds Tasks of its home Specification to a Session. */
    async associateTasks(sessionId: string, specId: string, taskIds: readonly string[]) {
      accepting();
      await call({
        op: 'associate-tasks',
        sessionId,
        specId,
        taskIds: [...taskIds],
        origin: 'workflow',
      });
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
      if (input.kind === 'question' && utf8Bytes(input.answer.text ?? '') > 16384) {
        throw new SessionError('INTERACTION_RESPONSE_INVALID', 'Answer exceeds byte budget.');
      }

      const result = await call<{
        turnId: string;
        interactionId: string;
        fresh: boolean;
        nativeKey: string;
      }>({ op: 'respond', actor, sessionId, interactionId, input });
      if (result.fresh) {
        const live = active.get(result.turnId);
        if (!live?.operation) {
          // Admission is durable, but no transport acknowledged delivery. Never resend it.
          throw new SessionError('INTERACTION_EXPIRED', 'Live operation has ended.');
        }

        try {
          const delivery = await live.operation.respond(result.nativeKey, input);
          if (delivery.deliveredKeys.length) {
            await call({
              op: 'response-delivered',
              sessionId,
              turnId: result.turnId,
              invocationId: live.invocationId,
              nativeKeys: delivery.deliveredKeys,
            });
          }
        } catch {
          await live.emit({
            kind: 'lost',
            message: 'Provider interaction continuation is unavailable.',
          });
        }
      }

      return { turnId: result.turnId, interactionId };
    },
    async rename(actor: string, sessionId: string, input: RenameSession) {
      accepting();

      return call<SessionView>({ op: 'rename', actor, sessionId, input });
    },
    async archive(actor: string, sessionId: string, input: ArchiveSession) {
      accepting();

      return call<SessionView>({ op: 'archive', actor, sessionId, input });
    },
    async unarchive(actor: string, sessionId: string, input: ArchiveSession) {
      accepting();

      return call<SessionView>({ op: 'unarchive', actor, sessionId, input });
    },
    /** Hard delete of Runtime-owned rows; Engine records and native transcripts are kept. */
    async remove(sessionId: string): Promise<void> {
      accepting();
      for (const [turnId, live] of active) {
        if (live.sessionId === sessionId) {
          throw new SessionError(
            'TURN_CONFLICT',
            'A live invocation of this Session has not settled.',
            { turnId },
          );
        }
      }

      await call({ op: 'delete', sessionId });
    },
    async close() {
      if (closed) {
        return;
      }

      closed = true;
      const telemetryClosing = telemetry.close();
      void telemetryClosing.catch(() => undefined);
      for (const live of active.values()) {
        live.controller.abort('shutdown');
      }

      const timeout = new AbortController();
      try {
        await telemetryClosing;
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
