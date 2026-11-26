import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../application';
import { getProjectCatalogue } from '../definitions/process-catalogue';
import { toArchetypeCatalogue } from '../specs/archetypes';
import { loadExecutionCatalogue } from './composition';
import { archetypeFirstStep, type ArchetypeFirstStepInfo } from './definitions/catalogue';

/**
 * The public archetype catalogue of the Project Home with each archetype's first workflow step, so
 * Create can name the step an agent would start and offer it only when an agent may do it.
 */
export async function readArchetypeCatalogue(engine: SpecFlowEngine): Promise<ArchetypeCatalogue> {
  const [project, execution] = await Promise.all([
    getProjectCatalogue(engine),
    loadExecutionCatalogue(engine),
  ]);

  return toArchetypeCatalogue(project, (archetypeId) => archetypeFirstStep(execution, archetypeId));
}

/** The first workflow step of one Specification archetype as the definitions are now. */
export async function readArchetypeFirstStep(
  engine: SpecFlowEngine,
  archetypeId: string,
): Promise<ArchetypeFirstStepInfo | undefined> {
  return archetypeFirstStep(await loadExecutionCatalogue(engine), archetypeId);
}
