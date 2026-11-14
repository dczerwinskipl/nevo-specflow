import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  DOCS_SEARCH_REASON_CODES,
  DocsSearchReasonCodeSchema,
  DocsSearchResultSchema,
} from './search-result';

const hit = {
  id: 'guide',
  title: 'Guide',
  type: 'guide',
  status: 'current',
  readWhen: ['installing'],
  file: 'docs/guide.md',
  score: 0.5,
  wordMatch: true,
  sections: [{ headingPath: ['Guide'], sectionId: 'guide', line: 7, score: 0.5 }],
};

describe('DocsSearchResultSchema', () => {
  it('has a stable $id and lists every reason code', () => {
    expect(DocsSearchResultSchema).toHaveProperty('$id', 'DocsSearchResult');
    expect(
      DOCS_SEARCH_REASON_CODES.every((code) => Value.Check(DocsSearchReasonCodeSchema, code)),
    ).toBe(true);
  });

  it('requires a reason exactly in lexical mode', () => {
    const reason = { code: 'no-endpoint', message: 'x' };
    expect(Value.Check(DocsSearchResultSchema, { mode: 'hybrid', results: [hit] })).toBe(true);
    expect(Value.Check(DocsSearchResultSchema, { mode: 'lexical', reason, results: [] })).toBe(
      true,
    );
    expect(Value.Check(DocsSearchResultSchema, { mode: 'lexical', results: [] })).toBe(false);
    expect(Value.Check(DocsSearchResultSchema, { mode: 'hybrid', reason, results: [] })).toBe(
      false,
    );
  });

  it('carries the excerpt with its match ranges and whether the words matched', () => {
    const section = {
      ...hit.sections[0]!,
      snippet: 'Install the widget.',
      snippetMatches: [{ start: 0, end: 7 }],
    };
    const result = (changes: object) => ({ mode: 'hybrid', results: [{ ...hit, ...changes }] });

    expect(Value.Check(DocsSearchResultSchema, result({ sections: [section] }))).toBe(true);
    expect(Value.Check(DocsSearchResultSchema, result({ wordMatch: undefined }))).toBe(false);
    const extra = { ...section, snippetMatches: [{ start: 0, end: 7, term: 'install' }] };
    expect(Value.Check(DocsSearchResultSchema, result({ sections: [extra] }))).toBe(false);
    const four = { ...section, snippetMatches: Array(4).fill({ start: 0, end: 1 }) as unknown[] };
    expect(Value.Check(DocsSearchResultSchema, result({ sections: [four] }))).toBe(false);
  });
});
