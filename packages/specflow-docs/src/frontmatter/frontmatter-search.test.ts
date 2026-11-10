import { describe, expect, it } from 'vitest';

import type { DocRecord } from './contract';
import { rankByContent, searchDocs, tokenize } from './frontmatter-search';

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

describe('tokenize', () => {
  it('normalizes like the search engine and folds English plurals of ASCII words only', () => {
    expect(tokenize('Obsługa płatności: Policies, tasks, status')).toEqual([
      'obsluga',
      'platnosci',
      'policy',
      'task',
      'status',
    ]);
    // A word that keeps a non-ASCII letter is never folded.
    expect(tokenize('ελπίδες')).toEqual(['ελπιδες']);
  });

  it('finds a document by a Polish word with or without its diacritics', () => {
    const polish: DocRecord[] = [
      { id: 'payments', title: 'Obsługa płatności', file: 'docs/p.md', body: '' },
      { id: 'other', title: 'Płyta główna', file: 'docs/o.md', body: '' },
    ];
    expect(searchDocs(polish, { query: 'płatności' }).map((doc) => doc.id)).toEqual(['payments']);
    expect(searchDocs(polish, { query: 'PŁATNOSCI' }).map((doc) => doc.id)).toEqual(['payments']);
    expect(searchDocs(polish, { query: 'platnosci' }).map((doc) => doc.id)).toEqual(['payments']);
  });
});
