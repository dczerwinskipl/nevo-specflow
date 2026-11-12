import { dirname, join } from 'node:path';

import type { SpecFlowEngine } from '../application';
import { withProjectControlLock } from '../project/control-lock';
import { resolveSpecification } from '../specs/discovery';
import { createDefaultDefinitionRegistry } from '../definitions/shipped-registry';
import { loadDefinitions } from '../specs/definitions/loader';
import {
  DEFINITIONS_RELATIVE_PATH,
  createFilesystemDefinitionSource,
} from '../specs/definitions/source';
import { createFilesystemDefinitionWriter } from '../specs/definitions/filesystem-writer';
import { resolveExecutionCatalogue } from './definitions/catalogue';
import { WorkflowError as CoreWorkflowError } from '@nevo/workflow';
import { WorkflowError } from './errors';
import type { ExecutionHolds, WorkflowDependencies } from './operations/loaded-execution';
import { readSpecificationExitState } from './operations/specification-exit';
import { closeBlockers, type CloseBlocker } from './close/blockers';
import { assertSharedResourcesAvailable } from '../specs/coordination/resources';
import { SharedResourceError } from '../specs/durable';
import type { RememberModelDependencies } from './definitions/remember-model';
import type { TaskReferences } from './operations/task-references';
import { hasPendingTaskDocumentChange } from '../specs/documents/write/pending-task-change';
import { admitExecutionStateChange } from '../specs/documents/api';
import { commitExecutionState } from '../specs/documents/execution-state-commit';
import { ofSubject } from './operations/loaded-execution';
import type { PostActionResult, WorkflowPostActions } from './operations/post-actions';
import { hasPendingExecutionChange } from './state/pending-task-change';
import { createFilesystemWorkflowStore } from './state/filesystem-store';
import {
  guardTaskDocumentChanges,
  type PendingTaskDocumentChange,
} from './state/task-document-guard';
import { checkoutPathExists } from './checkout-paths';
import { guardCloseReservations } from './state/close-guard';
import { listCloseJournals } from '../specs/lifecycle';

/**
 * Production wiring of the workflow operations for one opened Engine: definitions from the Project
 * Home's `.nevo/definitions`, execution state next to each Specification in the checkout that owns it
 * (resolved through discovery, never a stale primary copy) and mutations serialized by the project
 * control lock.
 */

function definitionsRoot(engine: SpecFlowEngine): string {
  return join(engine.context.project.homeRoot, ...DEFINITIONS_RELATIVE_PATH.split('/'));
}

async function availableSpecification(engine: SpecFlowEngine, specId: string) {
  const found = await resolveSpecification(engine, specId);
  if (found.status !== 'available') {
    throw new WorkflowError(
      'WORKFLOW_SUBJECT_NOT_FOUND',
      `The Specification "${specId}" is not available in a registered checkout (${found.status}).`,
    );
  }

  return found;
}

async function specificationDirectory(engine: SpecFlowEngine, specId: string): Promise<string> {
  const found = await availableSpecification(engine, specId);

  return dirname(
    join(found.workspaceRoot, ...found.specification.relativeManifestPath.split(/[\\/]/u)),
  );
}

export interface OpenWorkflowOptions {
  /**
   * Whether the project documentation index has a document of this stable id, for `project-document`
   * context references. The index belongs to the caller (the Runtime); without it no project
   * document resolves, so such a reference is refused.
   */
  readonly projectDocument?: (id: string) => Promise<boolean>;
}

/**
 * The Task lookups of an opened Engine: the archetype and the registered documents from the
 * Specification's manifest, paths in the checkout that owns it, and whether a change of a Task's
 * documents is pending (Task-scoped Documents, D03).
 */
function engineReferences(engine: SpecFlowEngine, options: OpenWorkflowOptions): TaskReferences {
  return {
    archetype: async (specId) =>
      (await availableSpecification(engine, specId)).specification.archetype.id,
    specificationDocument: async (specId, id) =>
      (await availableSpecification(engine, specId)).specification.documents.some(
        (document) => document.id === id,
      ),
    projectDocument: options.projectDocument ?? (() => Promise.resolve(false)),
    path: async (specId, path) =>
      checkoutPathExists((await availableSpecification(engine, specId)).workspaceRoot, path),
    pendingDocumentChange: pendingTaskDocuments(engine),
  };
}

/** D03: a change of the Task's documents (`specs/documents`) is not final yet. */
function pendingTaskDocuments(engine: SpecFlowEngine): PendingTaskDocumentChange {
  return (specId, taskId) => hasPendingTaskDocumentChange(engine.context, specId, taskId);
}

/** An unsettled Close journal names the Specification (its subject, or a Workspace Close occupant). */
async function closeInProgress(engine: SpecFlowEngine, specId: string): Promise<boolean> {
  return (await listCloseJournals(engine.context)).some(
    (journal) =>
      journal.stage !== 'completed' &&
      journal.stage !== 'archived-linked-awaiting-integration' &&
      (journal.plan.specId === specId ||
        (journal.plan.occupants ?? []).some((occupant) => occupant.specId === specId)),
  );
}

/** What holds a Specification besides its execution records: the store's journal and the claims. */
function engineHolds(engine: SpecFlowEngine): ExecutionHolds {
  return {
    pendingExecutionChange: (specId) =>
      hasPendingExecutionChange(engine.context.project.stateRoot, specId),
    async operationInProgress(specId) {
      try {
        await assertSharedResourcesAvailable(engine.context, ['spec:' + specId]);

        return false;
      } catch (error) {
        if (error instanceof SharedResourceError && error.code === 'RESOURCE_CONFLICT') {
          return true;
        }

        throw error;
      }
    },
  };
}

/**
 * Load the execution catalogue now. The returned dependencies hold that snapshot of the definitions:
 * after a definition edit (including `rememberArchetypeModel`) call `openWorkflow` again to see it.
 */
export async function openWorkflow(
  engine: SpecFlowEngine,
  options: OpenWorkflowOptions = {},
): Promise<WorkflowDependencies> {
  const loaded = await loadDefinitions(
    createFilesystemDefinitionSource(definitionsRoot(engine)),
    createDefaultDefinitionRegistry(),
  );

  return {
    catalogue: resolveExecutionCatalogue(loaded),
    store: guardCloseReservations(
      guardTaskDocumentChanges(
        createFilesystemWorkflowStore({
          stateRoot: engine.context.project.stateRoot,
          specificationDirectory: (specId) => specificationDirectory(engine, specId),
          commits: {
            admit: (specId, paths, operationId) =>
              admitExecutionStateChange(engine, specId, paths, operationId),
          },
        }),
        pendingTaskDocuments(engine),
      ),
      (specId) => closeInProgress(engine, specId),
    ),
    references: engineReferences(engine, options),
    holds: engineHolds(engine),
    now: () => new Date(),
    serialize: (operation) => withProjectControlLock(engine.context, operation),
    postActions: enginePostActions(engine),
  };
}

/**
 * The post actions of an opened Engine (`operations/post-actions.ts`): after a step's finish, commit
 * the Specification's execution state when auto-commit is off (with it on, the document queue commits
 * each change by itself). Seam for E6: the push of an agent step joins here.
 */
function enginePostActions(engine: SpecFlowEngine): WorkflowPostActions {
  return {
    async afterStepFinished(event): Promise<readonly PostActionResult[]> {
      const action = 'commit-execution-state';
      try {
        const outcome = await commitExecutionState(
          engine,
          event.subject.specId,
          `finish step ${event.step}${ofSubject(event.subject)} (attempt ${event.attempt})`,
        );
        switch (outcome.kind) {
          case 'committed':
            return [
              {
                action,
                status: 'completed',
                commit: {
                  ...(outcome.sha !== undefined ? { sha: outcome.sha } : {}),
                  paths: outcome.paths,
                },
              },
            ];
          case 'nothing-to-commit':
            return [{ action, status: 'completed' }];
          case 'not-applicable':
            return [{ action, status: 'skipped', reason: outcome.reason }];
        }
      } catch (error) {
        // The finish is recorded; the state stays uncommitted (a Close takes it with its archive commit).
        const code =
          error instanceof Error && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'POST_ACTION_FAILED';

        return [
          {
            action,
            status: 'failed',
            code,
            message:
              error instanceof Error ? error.message : 'The commit of the workflow state failed.',
          },
        ];
      }
    },
  };
}

/** Archetype edits ("remember this choice"), serialized by the same project control lock. */
export function openArchetypeEditing(engine: SpecFlowEngine): RememberModelDependencies {
  return {
    source: createFilesystemDefinitionSource(definitionsRoot(engine)),
    writer: createFilesystemDefinitionWriter(engine.context.project.homeRoot),
    serialize: (operation) => withProjectControlLock(engine.context, operation),
  };
}

/**
 * The Close guard of the opened Engine (D07): what keeps the workflow from letting the Specification
 * be archived (`closeBlockers`), read without a lock, since Close calls it in its preview and again
 * inside its reservation under the project control lock. Execution records that cannot be read are
 * one blocker, so Close refuses with structured blockers rather than an unexpected error.
 */
export async function specificationCloseBlockers(
  engine: SpecFlowEngine,
  specId: string,
): Promise<readonly CloseBlocker[]> {
  try {
    return closeBlockers(await readSpecificationExitState(await openWorkflow(engine), specId));
  } catch (error) {
    if (error instanceof CoreWorkflowError) {
      return [{ kind: 'execution-state-unreadable', subjectIds: [specId], message: error.message }];
    }

    throw error;
  }
}
