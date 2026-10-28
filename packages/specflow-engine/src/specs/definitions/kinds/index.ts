import { DefinitionKindRegistry } from '../kind-registry';
import { documentTypeKind } from './document-type';
import { specificationArchetypeKind } from './specification-archetype';

export { DOCUMENT_TYPE_KIND, documentTypeKind } from './document-type';
export {
  ARCHETYPE_TEMPLATES_DIRECTORY,
  SPECIFICATION_ARCHETYPE_KIND,
  specificationArchetypeKind,
} from './specification-archetype';

/** A registry holding the kinds the product ships. */
export function createDefaultDefinitionRegistry(): DefinitionKindRegistry {
  return new DefinitionKindRegistry()
    .register(documentTypeKind)
    .register(specificationArchetypeKind);
}
