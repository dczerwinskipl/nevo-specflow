import { DocumentError } from '../document-rules/errors';

import type { ProjectCatalogue } from './project-catalogue';

/**
 * The archetype of the project catalogue, or the refusal that tells the caller why there is none:
 * `DEFINITIONS_MISSING` when the project has no usable archetype at all (no definitions folder, an
 * empty one, or every file invalid), `ARCHETYPE_UNKNOWN` when this id is not defined
 * (`cause: archetype-not-defined`) or its file is rejected (`cause: archetype-invalid`).
 */
export function requireArchetype(project: ProjectCatalogue, archetypeId: string) {
  const { catalogue } = project;
  if (catalogue.archetypes.length === 0) {
    throw new DocumentError(
      'DEFINITIONS_MISSING',
      'The project has no usable archetype definitions.',
      { cause: 'definitions-missing' },
    );
  }

  const archetype = catalogue.findArchetype(archetypeId);
  if (!archetype) {
    const invalid = project.invalidArchetypeIds.has(archetypeId);

    throw new DocumentError(
      'ARCHETYPE_UNKNOWN',
      invalid
        ? `The definition of archetype "${archetypeId}" is invalid.`
        : `Unknown archetype "${archetypeId}".`,
      { cause: invalid ? 'archetype-invalid' : 'archetype-not-defined' },
    );
  }

  return archetype;
}
