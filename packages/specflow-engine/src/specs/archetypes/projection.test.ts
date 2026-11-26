import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { ArchetypeCatalogueSchema } from '@nevo/specflow-contracts/documents';

import { seedCatalogueForTesting } from '../../definitions/testing-install';
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

  it('carries the first step the resolver names, and none without one', () => {
    const withSteps = toArchetypeCatalogue({ catalogue }, (id) =>
      id === 'feature' ? { id: 'gather', title: 'Gather requirements', agent: true } : undefined,
    );
    expect([...Value.Errors(ArchetypeCatalogueSchema, withSteps)]).toEqual([]);
    expect(withSteps.archetypes.find((item) => item.id === 'feature')?.firstStep).toEqual({
      id: 'gather',
      title: 'Gather requirements',
      agent: true,
    });
    expect('firstStep' in withSteps.archetypes.find((item) => item.id === 'minimal')!).toBe(false);
  });
});
