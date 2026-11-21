import type { ArchetypeCatalogue, DefinitionProblem } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';
import { archetypeAvailabilityProblem } from './archetypeAvailability';

const catalogue: ArchetypeCatalogue = {
  revision: 'test',
  documentTypes: [],
  archetypes: [
    {
      id: 'minimal',
      version: 1,
      title: 'Minimal',
      description: 'A small change',
      useWhen: 'Small work',
      requirements: [],
      documents: [],
    },
  ],
};

const invalid: DefinitionProblem = {
  source: 'specification-archetype/feature.yaml',
  code: 'yaml-invalid',
  severity: 'error',
  message: 'Invalid YAML',
};

describe('archetype availability', () => {
  it('offers installation for missing options and repair for rejected definitions', () => {
    const empty: ArchetypeCatalogue = { ...catalogue, archetypes: [] };
    expect(archetypeAvailabilityProblem(empty)?.key).toBe('create.prerequisite.noArchetypes');
    expect(archetypeAvailabilityProblem({ ...empty, problems: [invalid] })?.key).toBe(
      'create.prerequisite.invalidArchetypes',
    );
    expect(
      archetypeAvailabilityProblem({ ...empty, problems: [{ ...invalid, severity: 'warning' }] })
        ?.key,
    ).toBe('create.prerequisite.noArchetypes');
  });

  it('never blocks usable archetypes because another definition has errors', () => {
    expect(archetypeAvailabilityProblem({ ...catalogue, problems: [invalid] })).toBeUndefined();
    expect(archetypeAvailabilityProblem(undefined)).toBeUndefined();
  });
});
