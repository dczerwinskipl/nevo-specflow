import { describe, expect, it } from 'vitest';

import { generateRandomQueries } from '../../src/domain/random-queries.js';

describe('generateRandomQueries', () => {
  it('generates the same seeded nonsense strings for a count, without language or answer', () => {
    const queries = generateRandomQueries(20);

    expect(queries).toHaveLength(20);
    expect(generateRandomQueries(20)).toEqual(queries);
    expect(generateRandomQueries(5)).toEqual(queries.slice(0, 5));
    expect(new Set(queries.map((query) => query.class))).toEqual(new Set(['random']));
    expect(queries.every((query) => query.question !== '' && query.expected.length === 0)).toBe(
      true,
    );
    expect(queries.some((query) => 'lang' in query)).toBe(false);
    expect(generateRandomQueries(5, 1)).not.toEqual(queries.slice(0, 5));
  });

  it('rejects a count that is not a non-negative integer', () => {
    expect(generateRandomQueries(0)).toEqual([]);
    expect(() => generateRandomQueries(Number.NaN)).toThrow(RangeError);
    expect(() => generateRandomQueries(-1)).toThrow(RangeError);
    expect(() => generateRandomQueries(1, Number.NaN)).toThrow(RangeError);
  });
});
