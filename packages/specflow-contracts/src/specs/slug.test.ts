import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { CreateSpecRequestSchema } from './create';
import { deriveSpecSlug, isValidSpecSlug, specSlugProblem } from './slug';

describe('specification slug rule', () => {
  it('derives a kebab-case ASCII slug from a title', () => {
    expect(deriveSpecSlug('  Nowa obsługa płatności! ')).toBe('nowa-obsluga-platnosci');
    expect(deriveSpecSlug('???')).toBe('');
    expect(deriveSpecSlug('a'.repeat(100))).toHaveLength(80);
    expect(deriveSpecSlug('x'.repeat(79) + ' tail')).toBe('x'.repeat(79));
  });

  it('classifies invalid user input', () => {
    expect(isValidSpecSlug('my-slug-2')).toBe(true);
    expect(specSlugProblem('')).toBe('empty');
    expect(specSlugProblem('My-Slug')).toBe('format');
    expect(specSlugProblem('a--b')).toBe('format');
    expect(specSlugProblem('-a')).toBe('format');
    expect(specSlugProblem('a_b')).toBe('format');
    expect(specSlugProblem('ł')).toBe('format');
    expect(specSlugProblem('a'.repeat(81))).toBe('too-long');
    expect(specSlugProblem('con')).toBe('reserved');
    expect(specSlugProblem('lpt1')).toBe('reserved');
    expect(specSlugProblem('console')).toBeUndefined();
  });

  it('accepts an optional slug in the create request and rejects a malformed one', () => {
    const base = {
      title: 'T',
      archetypeId: 'minimal',
      archetypeVersion: 1,
      catalogueRevision: 'r',
    };
    expect(Value.Check(CreateSpecRequestSchema, { ...base, slug: 'my-slug' })).toBe(true);
    expect(Value.Check(CreateSpecRequestSchema, base)).toBe(true);
    for (const slug of ['', 'My Slug', 'a--b', '../x', 'a'.repeat(81)]) {
      expect(Value.Check(CreateSpecRequestSchema, { ...base, slug })).toBe(false);
    }
  });
});
