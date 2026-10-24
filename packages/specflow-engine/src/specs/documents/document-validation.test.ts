import { describe, expect, it } from 'vitest';

import type { ManifestDocument } from '../model';
import { validateDocuments } from './document-validation';

const overview: ManifestDocument = { id: 'overview', path: 'overview.md', type: 'overview' };
const behaviour: ManifestDocument = { id: 'behaviour', path: 'behaviour.md', type: 'behaviour' };
const behaviour2: ManifestDocument = {
  id: 'behaviour-abc234',
  path: 'b/two.md',
  type: 'behaviour',
};
const archetype = (...requirements: [string, number][]) => ({
  requirements: requirements.map(([documentType, minCount]) => ({ documentType, minCount })),
});

describe('validateDocuments', () => {
  it('reports met requirements as complete with no issues', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1], ['behaviour', 1]),
      documents: [overview, behaviour],
      observedPaths: ['overview.md', 'behaviour.md'],
    });
    expect(result).toEqual({
      requirements: [
        { documentType: 'overview', minCount: 1, count: 1, satisfied: true },
        { documentType: 'behaviour', minCount: 1, count: 1, satisfied: true },
      ],
      complete: true,
      dangling: [],
      unclassified: [],
      issues: [],
    });
  });

  it('reports an unmet requirement with the count and an issue', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1], ['behaviour', 2]),
      documents: [overview, behaviour],
      observedPaths: ['overview.md', 'behaviour.md'],
    });
    expect(result.requirements[1]).toEqual({
      documentType: 'behaviour',
      minCount: 2,
      count: 1,
      satisfied: false,
    });
    expect(result.complete).toBe(false);
    expect(result.issues).toEqual([{ code: 'requirement-unmet', documentType: 'behaviour' }]);
  });

  it('counts only registered documents whose file exists (dangling does not count)', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1], ['behaviour', 1]),
      documents: [overview, behaviour],
      observedPaths: ['overview.md'],
    });
    expect(result.dangling).toEqual([behaviour]);
    expect(result.requirements[1]).toMatchObject({ count: 0, satisfied: false });
    expect(result.issues).toEqual([
      { code: 'dangling', path: 'behaviour.md', documentType: 'behaviour' },
      { code: 'requirement-unmet', documentType: 'behaviour' },
    ]);
  });

  it('does not count an unclassified file towards a requirement', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1], ['research', 1]),
      documents: [overview],
      observedPaths: ['overview.md', 'research.md'],
    });
    expect(result.unclassified).toEqual([{ path: 'research.md' }]);
    expect(result.requirements[1]).toMatchObject({ count: 0, satisfied: false });
    expect(result.issues.map((issue) => issue.code)).toEqual(['unclassified', 'requirement-unmet']);
  });

  it('counts several documents of one type; zero-minimum requirements are always met', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1], ['behaviour', 2], ['ux', 0]),
      documents: [overview, behaviour, behaviour2],
      observedPaths: ['overview.md', 'behaviour.md', 'b/two.md'],
    });
    expect(result.requirements.map((r) => [r.documentType, r.count, r.satisfied])).toEqual([
      ['overview', 1, true],
      ['behaviour', 2, true],
      ['ux', 0, true],
    ]);
    expect(result.complete).toBe(true);
  });

  it('matches registered paths exactly: a case variant is dangling plus unclassified', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1]),
      documents: [overview],
      observedPaths: ['Overview.md'],
    });
    expect(result.dangling).toEqual([overview]);
    expect(result.unclassified).toEqual([{ path: 'Overview.md' }]);
    expect(result.complete).toBe(false);
  });

  it('uses the persisted requirements: nothing required beyond them, whatever the catalogue says', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1]),
      documents: [overview],
      observedPaths: ['overview.md'],
    });
    expect(result.requirements).toHaveLength(1);
    expect(result.complete).toBe(true);
  });

  it('orders issues dangling, unclassified (by path), requirement-unmet, deterministically', () => {
    const input = {
      archetype: archetype(['overview', 1], ['ux', 1]),
      documents: [overview, behaviour],
      observedPaths: ['z.md', 'overview.md', 'a.md'],
    };
    const result = validateDocuments(input);
    expect(result.issues).toEqual([
      { code: 'dangling', path: 'behaviour.md', documentType: 'behaviour' },
      { code: 'unclassified', path: 'a.md' },
      { code: 'unclassified', path: 'z.md' },
      { code: 'requirement-unmet', documentType: 'ux' },
    ]);
    expect(validateDocuments(input)).toEqual(result);
  });

  it('carries no readiness, acceptance or approval wording or state', () => {
    const result = validateDocuments({
      archetype: archetype(['overview', 1]),
      documents: [overview],
      observedPaths: ['overview.md'],
    });
    expect(JSON.stringify(result)).not.toMatch(/ready|readiness|accept|approv/iu);
    expect(Object.keys(result).sort()).toEqual(
      ['complete', 'dangling', 'issues', 'requirements', 'unclassified'].sort(),
    );
  });
});
