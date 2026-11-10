import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  DOCS_SEARCH_REASON_CODES,
  DocsSearchReasonCodeSchema,
  DocsSearchResultSchema,
} from './index';

const hit = {
  id: 'guide',
  title: 'Guide',
  type: 'guide',
  status: 'current',
  readWhen: ['installing'],
  file: 'docs/guide.md',
  score: 0.5,
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
});
