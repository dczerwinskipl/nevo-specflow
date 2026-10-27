import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { ArchetypeCatalogueSchema } from '@nevo/specflow-contracts/documents';

import { seedCatalogueForTesting } from '../definitions/testing-install';
import { toArchetypeCatalogue } from './projection';

const catalogue = await seedCatalogueForTesting();

describe('public catalogue projection', () => {
  const projected = toArchetypeCatalogue({ catalogue });

  it('conforms to the contract schema and carries the revision', () => {
    expect([...Value.Errors(ArchetypeCatalogueSchema, projected)]).toEqual([]);
    expect(projected.revision).toBe(catalogue.revision);
    expect(projected.defaultArchetypeId).toBeUndefined();
  });

  it('keys documents by template id and defaults the title to the document type title', () => {
    const feature = projected.archetypes.find((item) => item.id === 'feature')!;
    const ux = feature.documents.find((item) => item.id === 'ux')!;
    expect(ux).toMatchObject({ type: 'ux', title: 'UX', include: 'optional', preselected: true });
    const overview = feature.documents.find((item) => item.id === 'overview')!;
    expect(overview.include).toBe('always');
    expect('preselected' in overview).toBe(false);
  });
});
