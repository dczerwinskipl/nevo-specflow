import { describe, expect, it } from 'vitest';

import type { DocRecord } from './contract';
import { validateDoc } from './validate';

const doc = (extra: Partial<DocRecord>): DocRecord => ({
  file: 'docs/a.md',
  body: '',
  id: 'a',
  type: 'hub',
  title: 'A',
  status: 'current',
  ...extra,
});

describe('validateDoc taxonomy', () => {
  it('accepts any scope and area when the taxonomy is not declared', () => {
    expect(validateDoc(doc({ scope: 'anything', areas: ['whatever'] }))).toEqual([]);
  });

  it('still requires well-formed values when the taxonomy is not declared', () => {
    expect(validateDoc(doc({ scope: 3, areas: [] }))).toEqual([
      "docs/a.md: 'scope' must be a non-empty string",
      "docs/a.md: 'areas' must be a non-empty array of strings",
    ]);
  });

  it('rejects values outside a declared taxonomy with the established message shape', () => {
    expect(
      validateDoc(doc({ scope: 'repo', areas: ['cli', 'ux'] }), {
        scopes: ['shared'],
        areas: ['cli', 'docs'],
      }),
    ).toEqual([
      "docs/a.md: unknown scope 'repo' (expected one of: shared)",
      "docs/a.md: unknown area 'ux' (expected one of: cli, docs)",
    ]);
  });

  it('enforces only the declared list', () => {
    expect(validateDoc(doc({ scope: 'free', areas: ['ux'] }), { areas: ['cli'] })).toEqual([
      "docs/a.md: unknown area 'ux' (expected one of: cli)",
    ]);
  });
});
