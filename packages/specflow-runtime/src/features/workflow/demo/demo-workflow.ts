import type { ArchetypeDefinition } from '@nevo/specflow-contracts/documents';
import {
  WorkflowError,
  createExecutionCatalogue,
  type GateScopeRef,
  type TaskReferences,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';
import {
  createMemoryWorkflowStore,
  loadShippedExecutionEntities,
  openInMemoryWorkflow,
} from '@nevo/specflow-engine/demo';

/** One registered document of a type with its text, as a document gate reads it. */
export interface DemoGateDocument {
  readonly id: string;
  readonly present: boolean;
  readonly text?: string;
}

/** What the demo workflow looks up outside its execution store, from the demo data. */
export interface DemoWorkflowLookups {
  /** The archetype of the Specification's manifest; `undefined` for an unknown Specification. */
  archetype(specId: string): Promise<string | undefined>;
  /** The ids of the documents the Specification's manifest registers. */
  documentIds(specId: string): Promise<readonly string[]>;
  /** The registered documents of a type in the Specification or one of its Tasks. */
  documentsOfType(scope: GateScopeRef, type: string): Promise<readonly DemoGateDocument[]>;
}

export interface DemoWorkflowOptions {
  /**
   * The Specification archetypes of the demo catalogue with their execution bindings; they replace
   * the shipped ones (the demo has its own owner archetype).
   */
  readonly specificationArchetypes: readonly Pick<ArchetypeDefinition, 'id' | 'execution'>[];
  readonly lookups: DemoWorkflowLookups;
  /**
   * Brings the fresh state to the demo catalogue through the Engine's own commands; runs once,
   * before the first operation is served. `clock.at` sets the time the seeded steps are recorded at.
   */
  readonly seed?: (workflow: WorkflowDependencies, clock: DemoClock) => Promise<void>;
}

/** The time the demo workflow records: an explicit moment while seeding, else the wall clock. */
export interface DemoClock {
  at(moment: Date | undefined): void;
}

/** The lookups as the Engine asks them; no project documentation and no checkout in the demo. */
function demoReferences(lookups: DemoWorkflowLookups): TaskReferences {
  return {
    async archetype(specId) {
      const archetype = await lookups.archetype(specId);
      if (archetype === undefined) {
        throw new WorkflowError(
          'WORKFLOW_SUBJECT_NOT_FOUND',
          `The Specification "${specId}" does not exist.`,
        );
      }

      return archetype;
    },
    specificationDocument: async (specId, id) => (await lookups.documentIds(specId)).includes(id),
    // The demo serves no project documentation and has no checkout.
    projectDocument: () => Promise.resolve(false),
    path: () => Promise.resolve(false),
    // Task document saves are final at once: nothing is ever pending.
    pendingDocumentChange: () => Promise.resolve(false),
    pendingDocumentChanges: () => Promise.resolve(new Set<string>()),
    documentsOfType: (scope, type) => lookups.documentsOfType(scope, type),
  };
}

/** The shipped definitions do not change while the process runs: loaded once for every demo. */
let shipped: ReturnType<typeof loadShippedExecutionEntities> | undefined;

/**
 * The demo Runtime's workflow: the Engine's real operations over an in-memory store, with the
 * shipped workflows and task types and the demo catalogue's Specification archetypes. The state is
 * writable (Start, Finish, Task commands) and lives until the Runtime stops. It is built, and seeded,
 * on the first call of `open`.
 */
export function createDemoWorkflow(options: DemoWorkflowOptions) {
  const store = createMemoryWorkflowStore();
  let moment: Date | undefined;
  const clock: DemoClock = {
    at(next) {
      moment = next;
    },
  };
  let opened: Promise<WorkflowDependencies> | undefined;
  const open = () => {
    opened ??= (async () => {
      shipped ??= loadShippedExecutionEntities();
      const workflow = openInMemoryWorkflow({
        catalogue: createExecutionCatalogue({
          ...(await shipped),
          specificationArchetypes: options.specificationArchetypes,
        }),
        store,
        references: demoReferences(options.lookups),
        now: () => moment ?? new Date(),
      });
      await options.seed?.(workflow, clock);
      clock.at(undefined);

      return workflow;
    })();

    return opened;
  };

  return {
    /** The workflow operations (`WorkflowDependencies`), seeded on first use. */
    open,
    /** The in-memory execution store: the Task manifests and initial documents it holds. */
    store,
  };
}

export type DemoWorkflow = ReturnType<typeof createDemoWorkflow>;
