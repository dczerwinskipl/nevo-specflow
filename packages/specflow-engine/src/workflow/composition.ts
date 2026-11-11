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
import { createFilesystemWorkflowStore } from './state/filesystem-store';

/**
 * Production wiring of the workflow operations for one opened Engine: definitions from the Project
 * Home's `.nevo/definitions`, execution state next to each Specification in the checkout that owns it
 * (resolved through discovery, never a stale primary copy) and mutations serialized by the project
 * control lock.
 */

function definitionsRoot(engine: SpecFlowEngine): string {
  return join(engine.context.project.homeRoot, ...DEFINITIONS_RELATIVE_PATH.split('/'));
}

async function specificationDirectory(engine: SpecFlowEngine, specId: string): Promise<string> {
  const found = await resolveSpecification(engine, specId);
  if (found.status !== 'available') {
    throw new WorkflowError(
      'WORKFLOW_SUBJECT_NOT_FOUND',
      `The Specification "${specId}" is not available in a registered checkout (${found.status}).`,
    );
  }

  return dirname(
    join(found.workspaceRoot, ...found.specification.relativeManifestPath.split(/[\\/]/u)),
  );
}

/**
 * Load the execution catalogue now. The returned dependencies hold that snapshot of the definitions:
 * after a definition edit (including `rememberArchetypeModel`) call `openWorkflow` again to see it.
 */
export async function openWorkflow(engine: SpecFlowEngine): Promise<WorkflowDependencies> {
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
