import { describe, expect, it } from 'vitest';

import type { DocRecord } from './contract';
import { rankByContent } from './frontmatter-search';

// Every summary has "the"; only one names tasks. `related` and `file` are not content fields.
const docs: DocRecord[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  id,
  title: id,
  file: `docs/the-${id}.md`,
  body: '',
  summary: id === 'c' ? 'The engine handles tasks.' : 'The rest.',
  related: ['tasks'],
}));

describe('rankByContent', () => {
  it('ignores terms common to many documents and the file and related fields', () => {
    expect(rankByContent(docs, 'the', 10)).toEqual([]);
    expect(rankByContent(docs, 'the task', 10).map((doc) => doc.id)).toEqual(['c']);
  });
});
