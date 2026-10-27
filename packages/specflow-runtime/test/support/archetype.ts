import { seedCatalogueForTesting } from '@nevo/specflow-engine/testing';

/**
 * The archetype fields every `POST /api/specs` body carries (there is no default archetype in the
 * contract). The revision is the one of the shipped definitions, which is what the HTTP suites
 * install into their projects; tests spread this and override single fields.
 */
export const ARCHETYPE_REQUEST = {
  archetypeId: 'minimal',
  archetypeVersion: 1,
  catalogueRevision: (await seedCatalogueForTesting()).revision,
} as const;
