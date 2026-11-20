import { createDefaultDefinitionRegistry } from '../definitions/shipped-registry';
import { openSeedSource } from '../definitions/seed';
import { loadDefinitions } from '../specs/definitions/loader';
import { specificationExitPort } from './composition';
import {
  executionEntitiesOf,
  type ExecutionCatalogue,
  type ExecutionEntities,
} from './definitions/catalogue';
import type { ExecutionHolds, WorkflowDependencies } from './operations/loaded-execution';
import type { SpecificationExitPort } from './operations/actions';
import type { TaskReferences } from './operations/task-references';
import { createMemoryWorkflowStore } from './state/memory-store';
import type { WorkflowStore } from './state/store';

/**
 * The workflow operations over state held in memory (the demo Runtime): the same operations, rules
 * and projections as `openWorkflow`, with an in-memory execution store and the lookups the host
 * gives. Nothing is written to disk, nothing is committed, and the state lives as long as the
 * returned dependencies.
 */
export interface InMemoryWorkflowOptions {
  readonly catalogue: ExecutionCatalogue;
  /** The lookups outside the execution store (archetype, documents, context references). */
  readonly references: TaskReferences;
  /** Default: an empty in-memory store. */
  readonly store?: WorkflowStore;
  /** Default: nothing holds a Specification (no journal, no other durable operation). */
  readonly holds?: ExecutionHolds;
  readonly now?: () => Date;
}

const NO_HOLDS: ExecutionHolds = {
  pendingExecutionChange: () => Promise.resolve(false),
  operationInProgress: () => Promise.resolve(false),
};

/** Mutations run one at a time, in call order (the project control lock of `openWorkflow`). */
function serialQueue(): WorkflowDependencies['serialize'] {
  let queue: Promise<unknown> = Promise.resolve();

  return <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  };
}

export function openInMemoryWorkflow(options: InMemoryWorkflowOptions): WorkflowDependencies {
  const dependencies: Omit<WorkflowDependencies, 'specificationExit'> = {
    catalogue: options.catalogue,
    store: options.store ?? createMemoryWorkflowStore(),
    references: options.references,
    holds: options.holds ?? NO_HOLDS,
    now: options.now ?? (() => new Date()),
    serialize: serialQueue(),
  };

  return {
    ...dependencies,
    specificationExit: inMemoryExitPort(specificationExitPort(dependencies)),
  };
}

/**
 * Close archives the Specification in its checkout, which state held in memory does not have: it
 * is projected unavailable (`no-repository`), so a client says so before anyone tries. Abandon is
 * the workflow's own and stays as the Engine projects it.
 */
function inMemoryExitPort(port: SpecificationExitPort): SpecificationExitPort {
  return {
    async exitActions(snapshot) {
      const actions = await port.exitActions(snapshot);

      return { ...actions, close: { kind: 'unavailable', reason: 'no-repository' } };
    },
  };
}

/**
 * The execution definitions the product ships (`definitions install` writes the same into a
 * project): workflows, task types, agent archetypes and Specification archetypes with their
 * execution bindings. A host that has no Project Home (the demo) builds its catalogue from them.
 */
export async function loadShippedExecutionEntities(): Promise<ExecutionEntities> {
  const seeds = await openSeedSource();

  return executionEntitiesOf(
    await loadDefinitions(seeds.source, createDefaultDefinitionRegistry()),
  );
}
