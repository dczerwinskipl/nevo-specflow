import { catalogueRevision } from '@nevo/specflow-engine';

/**
 * The archetype fields every `POST /api/specs` body carries (there is no default archetype in the
 * contract). Tests spread this and override single fields.
 */
export const ARCHETYPE_REQUEST = {
  archetypeId: 'minimal',
  archetypeVersion: 1,
  catalogueRevision: catalogueRevision(),
} as const;
