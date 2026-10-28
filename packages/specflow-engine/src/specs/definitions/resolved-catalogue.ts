import type {
  ArchetypeDefinition,
  DocumentTypeDefinition,
  TemplateDefinition,
} from '@nevo/specflow-contracts/documents';

import { sha256Hex } from '../../hash';

/**
 * The resolved catalogue: the valid document types and archetypes of one Project Home. It is a pure
 * function of the loaded definition files and carries no compiled-in default.
 */
export interface ResolvedCatalogue {
  /** sha256 of the canonical JSON of the whole resolved catalogue; changes on any edit. */
  readonly revision: string;
  readonly documentTypes: readonly DocumentTypeDefinition[];
  readonly archetypes: readonly ArchetypeDefinition[];
  findDocumentType(id: string): DocumentTypeDefinition | undefined;
  findArchetype(id: string): ArchetypeDefinition | undefined;
  /** The template of an archetype by template id (what `optionalDocumentIds` names). */
  findTemplate(archetypeId: string, templateId: string): TemplateDefinition | undefined;
}

/** The entities a catalogue is made of, already validated by the definitions loader. */
export interface CatalogueEntities {
  readonly documentTypes: readonly DocumentTypeDefinition[];
  readonly archetypes: readonly ArchetypeDefinition[];
}

/**
 * Build the catalogue from loaded entities. Pure and total: validation (schema, limits, references,
 * the overview rules) is the loader's job, so a problem never reaches this function. The input is
 * cloned and frozen, so the catalogue cannot change after it was resolved.
 */
export function resolveCatalogue(entities: CatalogueEntities): ResolvedCatalogue {
  const documentTypes = deepFreeze(structuredClone([...entities.documentTypes]));
  const archetypes = deepFreeze(structuredClone([...entities.archetypes]));
  return {
    revision: catalogueRevisionOf({ documentTypes, archetypes }),
    documentTypes,
    archetypes,
    findDocumentType: (id) => documentTypes.find((type) => type.id === id),
    findArchetype: (id) => archetypes.find((archetype) => archetype.id === id),
    findTemplate: (archetypeId, templateId) =>
      archetypes
        .find((archetype) => archetype.id === archetypeId)
        ?.templates.find((template) => template.id === templateId),
  };
}

/** sha256 (hex) of the canonical JSON (sorted object keys, array order kept) of the catalogue content. */
export function catalogueRevisionOf(content: CatalogueEntities): string {
  return sha256Hex(canonicalJson(content));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}
