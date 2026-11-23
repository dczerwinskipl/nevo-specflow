import { dirname, join } from 'node:path';

import type { SpecFlowEngine } from '../application';
import { withProjectControlLock } from '../project/control-lock';
import { runReadRequest, runVerifiedMutation } from '../project/request-verification-memo';
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
import { exitStateOf, readSpecificationExitState } from './operations/specification-exit';
import {
  closeBlockers,
  specificationLifecycleActions,
  type CloseBlocker,
  type SpecificationLifecycleActions,
} from './close/blockers';
import { inspectActions, type SpecificationExitPort } from './operations/actions';
import { assertSharedResourcesAvailable } from '../specs/coordination/resources';
import {
  SharedResourceError,
  ownedTurnOf,
  type OwnedExecution,
  type OwnedExecutionClaim,
} from '../specs/durable';
import { guardExecutionClaims } from './state/claim-guard';
import { executionClaimAdmission } from './write-admission';
import type { RememberModelDependencies } from './definitions/remember-model';
import type { TaskReferences } from './operations/task-references';
import { readTaskDocuments } from '../specs/documents/task-document-reader';
import {
  hasPendingTaskDocumentChange,
  pendingTaskDocumentChanges,
} from '../specs/documents/write/pending-task-change';
import { readRegisteredDocumentsOfType } from '../specs/documents/document-reader';
import { DocumentError } from '../specs/document-rules/errors';
import { SpecificationError } from '../specs/model';
import { admitExecutionStateChange } from '../specs/documents/api';
import { commitExecutionState } from '../specs/documents/execution-state-commit';
import { ofSubject } from './operations/loaded-execution';
import type { PostActionResult, WorkflowPostActions } from './operations/post-actions';
import { hasPendingExecutionChange } from './state/pending-task-change';
import { createFilesystemWorkflowStore } from './state/filesystem-store';
import type { WorkflowStore } from './state/store';
import {
  guardTaskDocumentChanges,
  type PendingTaskDocumentChange,
} from './state/task-document-guard';
import { checkoutPathExists } from './checkout-paths';
import { readExecution, readTaskProgress } from './operations/execution-read';
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

/** The registered checkout that owns a Specification (its workspace or worktree). */
export interface SpecificationCheckout {
  readonly workspaceId: string;
  readonly root: string;
}

/**
 * An active project document found by its stable id: `path` is its file, relative to the checkout
 * root with `/` separators. The agent context hashes that file, so the document's content is part of
 * the attempt's context digest; a bare `true` pins the document by its id only.
 */
export interface ProjectDocumentHit {
  readonly path: string;
}

export interface OpenWorkflowOptions {
  /**
   * Whether the documentation of the Specification's checkout has an active document of this
   * stable id, for `project-document` context references. The Engine resolves the checkout as for
   * `path` references; reading its documentation belongs to the caller (the Runtime, the CLI).
   * Without it no project document resolves, so such a reference is refused.
   */
  readonly projectDocument?: (
    checkout: SpecificationCheckout,
    id: string,
  ) => Promise<boolean | ProjectDocumentHit>;
  /**
   * The agent execution whose running Turn makes these workflow writes (the Runtime broker, D11):
   * its `dispatched` claim admits them; every other unsettled writer still refuses them. Named
   * in-process by the trusted host, never taken from a request. Without it, every unsettled agent
   * claim of the project refuses a write.
   */
  readonly ownedExecution?: OwnedExecution;
}

/**
 * The Task lookups of an opened Engine: the archetype and the registered documents from the
 * Specification's manifest, paths in the checkout that owns it, and whether a change of a Task's
 * documents is pending (Task-scoped Documents, D03).
 */
function engineReferences(engine: SpecFlowEngine, options: OpenWorkflowOptions): TaskReferences {
  const projectDocumentOf = async (specId: string, id: string) => {
    if (!options.projectDocument) {
      return false;
    }

    const found = await availableSpecification(engine, specId);

    return options.projectDocument(
      { workspaceId: found.workspaceId, root: found.workspaceRoot },
      id,
    );
  };

  return {
    archetype: async (specId) =>
      (await availableSpecification(engine, specId)).specification.archetype.id,
    specificationDocument: async (specId, id) =>
      (await availableSpecification(engine, specId)).specification.documents.some(
        (document) => document.id === id,
      ),
    projectDocument: async (specId, id) => (await projectDocumentOf(specId, id)) !== false,
    projectDocumentPath: async (specId, id) => {
      const hit = await projectDocumentOf(specId, id);

      return typeof hit === 'object' ? hit.path : undefined;
    },
    path: async (specId, path) =>
      checkoutPathExists((await availableSpecification(engine, specId)).workspaceRoot, path),
    pendingDocumentChange: pendingTaskDocuments(engine),
    pendingDocumentChanges: (specId) => pendingTaskDocumentChanges(engine.context, specId),
    taskDocumentRevisions: async (specId, taskId) =>
      (await readTaskDocuments(engine, specId, taskId)).documents.map((document) => ({
        path: document.path,
        revision: document.file?.revision ?? null,
      })),
    documentsOfType: async (scope, documentType) => {
      try {
        return await readRegisteredDocumentsOfType(engine, scope, documentType);
      } catch (error) {
        if (error instanceof DocumentError && error.code === 'DOCUMENT_NOT_FOUND') {
          throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'The gate scope does not exist.');
        }

        // The source cannot be used now: the same unavailable answer as a Specification lookup.
        if (error instanceof DocumentError && error.code === 'SPEC_SOURCE_UNAVAILABLE') {
          throw new SpecificationError(
            'SPEC_SOURCE_INVALID',
            'The documents a gate reads are unavailable.',
          );
        }

        throw error;
      }
    },
  };
}

/** D03: a change of the Task's documents (`specs/documents`) is not final yet. */
function pendingTaskDocuments(engine: SpecFlowEngine): PendingTaskDocumentChange {
  return (specId, taskId) => hasPendingTaskDocumentChange(engine.context, specId, taskId);
}

/** An unsettled Close journal names the Specification (its subject, or a Workspace Close occupant). */
export async function closeInProgress(engine: SpecFlowEngine, specId: string): Promise<boolean> {
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
    attemptCommit: (attemptId) =>
      engine.attemptCommitWait?.(attemptId) ?? Promise.resolve(undefined),
  };
}

/**
 * The execution store of an opened Engine, every change admitted against the writer claims with
 * `owned` as the caller's own claim (none: every unsettled agent claim refuses). The host forms come
 * from {@link OpenWorkflowOptions.ownedExecution} (`turn`); the agent attempt's finalize section uses
 * the `finalize` form, inside that section only (`workflow/agent`). `attributedExecution` names the
 * agent Turn a change without its own claim is made for (the start of an agent attempt): its ledger
 * entries name that Turn, so the attempt commit can take them (D15); it admits nothing.
 */
export function engineExecutionStore(
  engine: SpecFlowEngine,
  owned: OwnedExecutionClaim | undefined,
  attributedExecution?: string,
): WorkflowStore {
  // The claim admission first: an agent Turn's claim is the holder a refusal names.
  return guardExecutionClaims(
    guardCloseReservations(
      guardTaskDocumentChanges(
        createFilesystemWorkflowStore({
          stateRoot: engine.context.project.stateRoot,
          specificationDirectory: (specId) => specificationDirectory(engine, specId),
          commits: {
            admit: (specId, paths, operationId) =>
              admitExecutionStateChange(engine, specId, paths, operationId, {
                ...(owned !== undefined ? { ownedExecution: owned } : {}),
                ...(attributedExecution !== undefined ? { attributedExecution } : {}),
              }),
          },
        }),
        pendingTaskDocuments(engine),
      ),
      (specId) => closeInProgress(engine, specId),
    ),
    executionClaimAdmission(engine, owned),
  );
}

/**
 * Load the execution catalogue now. The returned dependencies hold that snapshot of the definitions:
 * after a definition edit (including `rememberArchetypeModel`) call `openWorkflow` again to see it.
 */
export async function openWorkflow(
  engine: SpecFlowEngine,
  options: OpenWorkflowOptions = {},
): Promise<WorkflowDependencies> {
  const reloadCatalogue = async () =>
    resolveExecutionCatalogue(
      await loadDefinitions(
        createFilesystemDefinitionSource(definitionsRoot(engine)),
        createDefaultDefinitionRegistry(),
      ),
    );

  const owned = ownedTurnOf(options.ownedExecution).ownedExecution;
  const dependencies: Omit<WorkflowDependencies, 'specificationExit'> = {
    catalogue: await reloadCatalogue(),
    reloadCatalogue,
    store: engineExecutionStore(engine, owned),
    references: engineReferences(engine, options),
    holds: engineHolds(engine),
    now: () => new Date(),
    // One Git-backed verification per operation (the lock admission proves the Project Home; the
    // Specification lookups and later lock sections of the same operation reuse it), not one per lookup.
    serialize: (operation) =>
      runVerifiedMutation(() => withProjectControlLock(engine.context, operation)),
    operation: runVerifiedMutation,
    postActions: enginePostActions(engine),
  };

  return { ...dependencies, specificationExit: specificationExitPort(dependencies) };
}

/**
 * A read-only workflow operation as an Engine read request: the Project Home and checkout
 * verification (the control lock's included) uses on-disk evidence only and spawns no Git process,
 * like every other read path (`resolveSpecificationForRead`). For presentation reads only; a mutation
 * keeps the full verification of its own operation.
 */
function asReadRequest<Args extends unknown[], Result>(
  operation: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args) => runReadRequest(() => operation(...args));
}

/** {@link readExecution} without Git (Workspace and Task reads). */
export const readExecutionForRead = asReadRequest(readExecution);

/** {@link readTaskProgress} without Git (the Specs list progress). */
export const readTaskProgressForRead = asReadRequest(readTaskProgress);

/** {@link inspectActions} without Git (the workflow `actions` read). */
export const inspectActionsForRead = asReadRequest(inspectActions);

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
        const outcome = await commitExecutionState(engine, event.subject.specId, {
          phrase: `finish "${event.stepTitle}"${ofSubject(event.subject)}`,
          details: [`Step ${event.step}, attempt ${event.attempt}.`],
        });
        const held = 'held' in outcome && outcome.held ? { held: outcome.held } : {};
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
                ...held,
              },
            ];
          case 'nothing-to-commit':
            return [{ action, status: 'completed', ...held }];
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

/**
 * Close and Abandon availability of the action projection (D07), from the snapshot it read. Records
 * that cannot be interpreted are one blocker for both, as in the Close guard.
 */
export function specificationExitPort(
  dependencies: Omit<WorkflowDependencies, 'specificationExit'>,
): SpecificationExitPort {
  return {
    async exitActions(snapshot): Promise<SpecificationLifecycleActions> {
      try {
        return specificationLifecycleActions(await exitStateOf(dependencies, snapshot));
      } catch (error) {
        if (error instanceof CoreWorkflowError) {
          const blockers: CloseBlocker[] = [
            {
              kind: 'execution-state-unreadable',
              subjectIds: [snapshot.specId],
              message: error.message,
            },
          ];

          return { close: { kind: 'blocked', blockers }, abandon: { kind: 'blocked', blockers } };
        }

        throw error;
      }
    },
  };
}

/**
 * Archetype edits ("remember this choice"), serialized by the same project control lock and refused
 * like every workflow write while an agent execution claim is unsettled.
 */
export function openArchetypeEditing(engine: SpecFlowEngine): RememberModelDependencies {
  return {
    source: createFilesystemDefinitionSource(definitionsRoot(engine)),
    writer: createFilesystemDefinitionWriter(engine.context.project.homeRoot),
    serialize: (operation) => withProjectControlLock(engine.context, operation),
    admission: executionClaimAdmission(engine, undefined),
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

/**
 * Whether a step of the Specification run or of a Task run is in progress (position `active`, or
 * `awaiting-confirmation` of an agent's result): its finish (or the confirmation) commits the
 * execution state when automatic commits are off. Lock-free read for a refusal's
 * facts; `undefined` when the records cannot be read.
 */
export async function specificationStepInProgress(
  engine: SpecFlowEngine,
  specId: string,
): Promise<boolean | undefined> {
  try {
    const snapshot = await (await openWorkflow(engine)).store.read(specId);

    return [snapshot.specification?.value.run, ...snapshot.runs.map((record) => record.value.run)]
      .filter((run) => run !== undefined)
      .some(
        (run) => run.position.state === 'active' || run.position.state === 'awaiting-confirmation',
      );
  } catch {
    return undefined;
  }
}
