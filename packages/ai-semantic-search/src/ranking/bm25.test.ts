import { describe, expect, it } from 'vitest';
import { createBm25Index, PREFIX_MAX_EXPANSIONS } from './bm25';

describe('bounded lexical prefixes', () => {
  const index = createBm25Index([
    { id: 'providers', text: 'Provider catalogue and provider readiness' },
    { id: 'commits', text: 'Committing changes in a commit queue' },
    { id: 'unrelated', text: 'Typography and colours' },
  ]);

  it('finds incomplete words only when opted in, without adding unrelated hits', () => {
    expect(index.search('provid')).toEqual([]);
    expect(index.search('provid', { prefixes: true }).map((hit) => hit.id)).toEqual(['providers']);
    expect(index.search('commi', { prefixes: true }).map((hit) => hit.id)).toEqual(['commits']);
    expect(index.search('zzzqqq', { prefixes: true })).toEqual([]);
  });

  it('preserves exact scores and does not expand words already present', () => {
    const exact = createBm25Index([
      { id: 'a', text: 'plan' },
      { id: 'b', text: 'planning planner' },
    ]);
    expect(exact.search('plan', { prefixes: true })).toEqual(exact.search('plan'));
    expect(index.search('provider readiness', { prefixes: true })).toEqual(
      index.search('provider readiness'),
    );
    expect(index.search('unrelated proces', { prefixes: true })).toEqual(
      index.search('unrelated proces'),
    );
    expect(index.search('provid readiness', { prefixes: true })).toEqual(
      index.search('provid readiness'),
    );
  });

  it('rejects short and over-broad prefixes instead of selecting arbitrary completions', () => {
    expect(index.search('pro', { prefixes: true })).toEqual([]);
    const broad = createBm25Index(
      Array.from({ length: PREFIX_MAX_EXPANSIONS + 1 }, (_, n) => ({
        id: String(n),
        text: `provid${n}`,
      })),
    );
    expect(broad.search('provid', { prefixes: true })).toEqual([]);
  });

  it('does not let excluded exact words or completions suppress visible prefix matches', () => {
    const filtered = createBm25Index([
      { id: 'visible', text: 'provider' },
      { id: 'hidden-exact', text: 'provid' },
      ...Array.from({ length: PREFIX_MAX_EXPANSIONS + 1 }, (_, n) => ({
        id: `hidden-${n}`,
        text: `provid${n}`,
      })),
    ]);
    expect(
      filtered
        .search('provid', { prefixes: true, accept: (id) => id === 'visible' })
        .map((hit) => hit.id),
    ).toEqual(['visible']);
  });

  it('does not sum multiple completions of one incomplete word', () => {
    const variants = createBm25Index([
      { id: 'many', text: 'provider providing provides' },
      { id: 'one', text: 'provider' },
    ]);
    const prefix = variants.search('provid', { prefixes: true });
    const individual = ['provider', 'providing', 'provides'].map((word) => variants.search(word));
    for (const hit of prefix) {
      expect(hit.score).toBe(
        Math.max(
          ...individual.flatMap((ranking) =>
            ranking.filter((value) => value.id === hit.id).map((value) => value.score),
          ),
        ),
      );
    }
  });
});
