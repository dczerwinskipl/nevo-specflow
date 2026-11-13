import { DefinitionKindRegistry } from '../specs/definitions/kind-registry';
import { documentTypeKind } from '../specs/definitions/kinds/document-type';
import { specificationArchetypeKind } from '../specs/definitions/kinds/specification-archetype';
import { agentArchetypeKind, taskTypeKind, workflowKind } from '../workflow/definitions/kinds';

/**
 * A registry holding the kinds the product ships. This module is the composition root of the
 * definition kinds: the generic definitions module (`specs/definitions`) knows no workflow kind, and
 * the workflow capability's kinds are registered here.
 */
export function createDefaultDefinitionRegistry(): DefinitionKindRegistry {
  return new DefinitionKindRegistry()
    .register(documentTypeKind)
    .register(specificationArchetypeKind)
    .register(agentArchetypeKind)
    .register(workflowKind)
    .register(taskTypeKind);
}
