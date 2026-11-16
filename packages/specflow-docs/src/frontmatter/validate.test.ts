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

describe('validateDoc type', () => {
  const byType =
    'required fields by type: hub: id, type, title, status; engineering, product, architecture, ' +
    'reference, instruction: id, type, title, status, read_when, summary; adr: id, type, title, ' +
    'status, date';

  it('reports every problem at once and, without a known type, the fields of every type', () => {
    expect(validateDoc(doc({ type: 'guide', status: 'done', title: undefined }))).toEqual([
      `docs/a.md: unknown type 'guide' (expected one of: hub, engineering, product, architecture, reference, instruction, adr; ${byType})`,
      "docs/a.md: unknown status 'done' (expected one of: current, draft, deprecated, superseded)",
      "docs/a.md: missing required field 'title' for type 'guide'",
    ]);
    expect(validateDoc(doc({ type: undefined }))[0]).toBe(
      `docs/a.md: missing 'type' (one of: hub, engineering, product, architecture, reference, instruction, adr; ${byType})`,
    );
  });

  it('names every missing field of a known type together', () => {
    expect(validateDoc(doc({ type: 'product' }))).toEqual([
      "docs/a.md: missing required field 'read_when' for type 'product'",
      "docs/a.md: missing required field 'summary' for type 'product'",
    ]);
  });
});
