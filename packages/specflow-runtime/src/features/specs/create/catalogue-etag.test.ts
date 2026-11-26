import type { ArchetypeCatalogue, DefinitionProblem } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { catalogueEtag } from './catalogue-etag';

const base: ArchetypeCatalogue = { revision: 'abc', documentTypes: [], archetypes: [] };
const problem = (message: string): DefinitionProblem => ({
  source: 'document-type/x.yaml',
  code: 'yaml-invalid',
  severity: 'error',
  message,
});

describe('catalogueEtag', () => {
  it('is the revision when there is nothing to report', () => {
    expect(catalogueEtag(base)).toBe('"abc"');
    expect(catalogueEtag({ ...base, problems: [] })).toBe('"abc"');
  });

  it('changes with the problems although the revision does not', () => {
    const one = catalogueEtag({ ...base, problems: [problem('one')] });
    const other = catalogueEtag({ ...base, problems: [problem('other')] });
    expect(one).not.toBe('"abc"');
    expect(one).not.toBe(other);
    expect(catalogueEtag({ ...base, problems: [problem('one')] })).toBe(one);
  });

  it('changes with truncation and with an unstable read', () => {
    const plain = catalogueEtag({ ...base, problems: [problem('one')] });
    expect(
      catalogueEtag({ ...base, problems: [problem('one')], problemsTruncated: true }),
    ).not.toBe(plain);
    expect(catalogueEtag({ ...base, unstableRead: true })).not.toBe('"abc"');
  });

  it('changes with the first step of an archetype although the revision does not', () => {
    const archetype = (agent: boolean): ArchetypeCatalogue['archetypes'][number] => ({
      id: 'feature',
      version: 1,
      title: 'Feature',
      description: 'A feature.',
      useWhen: 'Always.',
      requirements: [],
      documents: [],
      firstStep: { id: 'gather', title: 'Gather requirements', agent },
    });
    const agentStep = catalogueEtag({ ...base, archetypes: [archetype(true)] });
    expect(agentStep).not.toBe('"abc"');
    expect(catalogueEtag({ ...base, archetypes: [archetype(false)] })).not.toBe(agentStep);
  });
});
