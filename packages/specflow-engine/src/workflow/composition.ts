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
import { WorkflowError } from './errors';
import type { WorkflowDependencies } from './operations/loaded-execution';
import type { RememberModelDependencies } from './definitions/remember-model';
import type { TaskReferences } from './operations/task-references';
import { createFilesystemWorkflowStore } from './state/filesystem-store';
import { checkoutPathExists } from './checkout-paths';

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
 * Specification's manifest, paths in the checkout that owns it. No Task document change is pending
 * yet: Task-scoped Documents (T5) take over that seam.
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
    pendingDocumentChange: () => Promise.resolve(false),
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
    store: createFilesystemWorkflowStore({
      stateRoot: engine.context.project.stateRoot,
      specificationDirectory: (specId) => specificationDirectory(engine, specId),
    }),
    references: engineReferences(engine, options),
    now: () => new Date(),
    serialize: (operation) => withProjectControlLock(engine.context, operation),
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
