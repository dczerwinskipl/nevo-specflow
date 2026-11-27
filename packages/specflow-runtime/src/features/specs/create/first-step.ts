import { join } from 'node:path';

import type { CreateFirstStepRequest, CreateFirstStepResult } from '@nevo/specflow-contracts/specs';
import type { AgentOption } from '@nevo/specflow-contracts/workflow';
import {
  CreateOperationError,
  inspectPublicCreateOperation,
  readArchetypeFirstStep,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import {
  FIRST_STEP_INTENT_RELATIVE_DIR,
  createFileFirstStepIntentStore,
  type FirstStepIntentStore,
  type StoredFirstStepIntent,
} from './first-step-store';

/**
 * The agent start a Create's first-step intent asks for, as agent step execution provides it. The
 * composition supplies it (the Specifications feature does not own agent execution).
 */
export interface FirstStepStarter {
  /**
   * Starts an agent attempt of `step` of the new Specification as `principal`. The request id is
   * derived from `operationId`, so a repeated call finds what the first one made instead of
   * starting a second attempt.
   */
  start(input: {
    readonly operationId: string;
    readonly specId: string;
    readonly principal: string;
    readonly step: string;
    readonly provider: string;
    readonly model?: string;
    readonly effort?: string;
  }): Promise<{ readonly sessionId: string; readonly attemptId: string }>;
  /** A refusal of the start in the workflow vocabulary; undefined for an unexpected failure. */
  refusal(error: unknown): { readonly code: string; readonly agent?: AgentOption } | undefined;
}

export interface CreateFirstStep {
  /**
   * Admission of a Create's intent before anything is written: a retry must carry the same intent
   * (or none, when the first request had none), the archetype's first step must be an agent's, and
   * the intent is stored with who asked. Undefined when the request carries no intent.
   */
  admit(input: {
    readonly engine: SpecFlowEngine;
    readonly operationId: string;
    readonly request: CreateFirstStepRequest | undefined;
    readonly archetypeId: string;
    readonly principal: string;
  }): Promise<StoredFirstStepIntent | undefined>;
  /**
   * Makes the start for the created Specification once, records and returns its result. Undefined:
   * the start could not be made for a reason that may pass (the Session store unavailable, an
   * unexpected failure, the Runtime shutting down); the intent stays pending and the startup step
   * makes the start after the next Runtime start.
   */
  settle(intent: StoredFirstStepIntent, specId: string): Promise<CreateFirstStepResult | undefined>;
  /** The stored intent of an operation (inspection, operations list). */
  read(operationId: string): Promise<StoredFirstStepIntent | undefined>;
  /**
   * Drops the intent of a Create that failed: always when its journal never existed, and when the
   * Create was definitely refused (`definite`); an uncertain outcome keeps it for the retry.
   */
  forgetFailed(engine: SpecFlowEngine, operationId: string, definite: boolean): Promise<void>;
  /** The Runtime is shutting down: no further in-process retry of a start is made. */
  stop(): void;
  /**
   * The Runtime startup step: the start of every intent whose Create completed while no start was
   * made (the Runtime stopped in between), as the principal stored with it. Intents of Creates that
   * never reserved anything are dropped; intents of unfinished Creates wait for the Create's retry.
   */
  resume(
    engine: SpecFlowEngine,
    onFailure: (operationId: string, error: unknown) => void,
  ): Promise<void>;
}

/**
 * Settled intents are kept this long for the inspection and the operations list, then pruned; so
 * are the pending intents of Creates that never completed.
 */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Refusals that say nothing final about the agent: the start is tried again later. */
const TRANSIENT_CODES: ReadonlySet<string> = new Set(['WORKFLOW_UNAVAILABLE']);

/** Waits between in-process attempts of a start that failed for a reason that may pass. */
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000];

const sameRequest = (left: CreateFirstStepRequest, right: CreateFirstStepRequest) =>
  left.run === right.run &&
  left.provider === right.provider &&
  left.model === right.model &&
  left.effort === right.effort;

const conflict = () =>
  new CreateOperationError(
    'CREATE_CONFLICT',
    'This operation id was used for a Create with another first-step intent.',
  );

export function firstStepIntentDirectory(engine: SpecFlowEngine): string {
  return join(engine.context.project.stateRoot, FIRST_STEP_INTENT_RELATIVE_DIR);
}

export function createFirstStep(options: {
  readonly starter: FirstStepStarter;
  readonly store?: FirstStepIntentStore;
  /** The Runtime's store directory when no store is injected (read on first use). */
  readonly directory?: () => string;
  readonly now?: () => Date;
  /** Waits between in-process attempts of a transient failure (tests: `[]`). */
  readonly retryDelaysMs?: readonly number[];
}): CreateFirstStep {
  const now = options.now ?? (() => new Date());
  const directory = options.directory;
  let fileStore: FirstStepIntentStore | undefined;
  const fileStoreOf = (): FirstStepIntentStore => {
    if (!directory) {
      throw new Error('A first-step intent store or directory is required.');
    }

    fileStore ??= createFileFirstStepIntentStore(directory());

    return fileStore;
  };

  // Resolved lazily: composing the Runtime never touches the Engine.
  const store: FirstStepIntentStore = options.store ?? {
    read: (operationId) => fileStoreOf().read(operationId),
    write: (intent) => fileStoreOf().write(intent),
    list: () => fileStoreOf().list(),
    remove: (operationId) => fileStoreOf().remove(operationId),
  };

  // Before the Runtime started: what the startup step may act on (a newer intent belongs to a
  // request in flight, whose own Create settles it).
  const startedAt = now().getTime();
  // One start per operation in this process: a retry that arrives while the first start runs waits
  // for it instead of racing it.
  const inFlight = new Map<string, Promise<CreateFirstStepResult | undefined>>();
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let stopped = false;

  /** One attempt: the result, `final` only for a start made or a real refusal. */
  async function attempt(
    current: StoredFirstStepIntent,
    specId: string,
  ): Promise<CreateFirstStepResult | undefined> {
    const { request, step } = current;
    try {
      const started = await options.starter.start({
        operationId: current.operationId,
        specId,
        principal: current.principal,
        step: step.id,
        provider: request.provider,
        ...(request.model !== undefined ? { model: request.model } : {}),
        ...(request.effort !== undefined ? { effort: request.effort } : {}),
      });

      return {
        status: 'started',
        step,
        sessionId: started.sessionId,
        attemptId: started.attemptId,
      };
    } catch (error) {
      const refusal = options.starter.refusal(error);
      // An unexpected failure, a store that is unavailable for now or a shutdown is not the
      // agent's answer: the intent stays pending (the derived request id finds a start that was
      // made meanwhile, so a later attempt never starts twice).
      if (!refusal || TRANSIENT_CODES.has(refusal.code)) {
        return undefined;
      }

      return {
        status: 'not-started',
        step,
        code: refusal.code,
        ...(refusal.agent ? { agent: refusal.agent } : {}),
      };
    }
  }

  async function makeStart(
    intent: StoredFirstStepIntent,
    specId: string,
  ): Promise<CreateFirstStepResult | undefined> {
    const current = (await store.read(intent.operationId)) ?? intent;
    if (current.result) {
      return current.result;
    }

    let result = await attempt(current, specId);
    for (const delay of retryDelays) {
      if (result || stopped) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      result = stopped ? undefined : await attempt(current, specId);
    }

    if (result) {
      await store.write({ ...current, result });
    }

    return result;
  }

  const settle: CreateFirstStep['settle'] = (intent, specId) => {
    const running = inFlight.get(intent.operationId);
    if (running) {
      return running;
    }

    const started = makeStart(intent, specId).finally(() => inFlight.delete(intent.operationId));
    inFlight.set(intent.operationId, started);

    return started;
  };

  return {
    async admit({ engine, operationId, request, archetypeId, principal }) {
      const existing = await store.read(operationId);
      if (!request) {
        if (existing) {
          throw conflict();
        }

        return undefined;
      }

      if (existing) {
        if (!sameRequest(existing.request, request)) {
          throw conflict();
        }

        return existing;
      }

      // A completed journal without an intent is an earlier request without one: not this
      // request's retry. (An unfinished one may be the retry of a refused Create whose intent was
      // dropped with its refusal.)
      if ((await inspectPublicCreateOperation(engine, operationId))?.status === 'completed') {
        throw conflict();
      }

      const step = await readArchetypeFirstStep(engine, archetypeId);
      if (!step) {
        throw new CreateOperationError(
          'CREATE_OPERATION_INVALID',
          `The archetype "${archetypeId}" starts no workflow, so no agent can run its first step.`,
        );
      }

      if (!step.agent) {
        throw new CreateOperationError(
          'CREATE_OPERATION_INVALID',
          `The first step of the archetype "${archetypeId}" (${step.title}) is the owner's; an agent cannot run it.`,
        );
      }

      const intent: StoredFirstStepIntent = {
        version: 1,
        operationId,
        principal,
        request: {
          run: 'agent',
          provider: request.provider,
          ...(request.model !== undefined ? { model: request.model } : {}),
          ...(request.effort !== undefined ? { effort: request.effort } : {}),
        },
        step: { id: step.id, title: step.title },
        createdAt: now().toISOString(),
      };
      await store.write(intent);

      return intent;
    },
    settle,
    read: (operationId) => store.read(operationId),
    async forgetFailed(engine, operationId, definite) {
      const journal = await inspectPublicCreateOperation(engine, operationId).catch(
        () => 'unknown' as const,
      );
      if (!journal || (definite && journal !== 'unknown' && journal.status !== 'completed')) {
        await store.remove(operationId);
      }
    },
    stop() {
      stopped = true;
    },
    async resume(engine, onFailure) {
      for (const intent of await store.list()) {
        try {
          const expired = now().getTime() - Date.parse(intent.createdAt) > RETENTION_MS;
          if (intent.result) {
            if (expired) {
              await store.remove(intent.operationId);
            }

            continue;
          }

          if (Date.parse(intent.createdAt) >= startedAt) {
            continue;
          }

          const inspection = await inspectPublicCreateOperation(engine, intent.operationId);
          if (!inspection || (expired && inspection.status !== 'completed')) {
            await store.remove(intent.operationId);
          } else if (inspection.status === 'completed') {
            await settle(intent, inspection.specId);
          }
        } catch (error) {
          onFailure(intent.operationId, error);
        }
      }
    },
  };
}
