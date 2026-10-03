import { describe, expect, it } from 'vitest';

import { normalizeTerm, scoreDoc, searchDocs, tokenize } from '../../src/domain/search.js';
import type { DocRecord } from '../../src/domain/frontmatter.js';

const CORPUS: DocRecord[] = [
  {
    id: 'engineering.repository.git-workflow',
    type: 'engineering',
    title: 'Git workflow',
    status: 'current',
    file: 'docs/engineering/repository/git-workflow.md',
    body: '',
    read_when: ['creating a branch', 'preparing a pull request'],
    summary: 'Branch naming, PR strategy, squash merge, release lines.',
    scope: 'repo',
    areas: ['release'],
    tags: ['git', 'github'],
    related: ['engineering.repository.commit-conventions'],
  },
  {
    id: 'design-system.implementation.react.component-guidelines',
    type: 'engineering',
    title: 'React component guidelines',
    status: 'current',
    file: 'docs/design-system/implementation/react/component-guidelines.md',
    body: '',
    read_when: ['writing a React component'],
    summary: 'Composition, props, and Tailwind class conventions for React components.',
    areas: ['ui'],
    tags: ['react'],
  },
  {
    id: 'engineering.shared.testing',
    type: 'engineering',
    title: 'Testing',
    status: 'current',
    file: 'docs/engineering/shared/testing.md',
    body: '',
    read_when: ['writing tests'],
    summary: 'Shared testing strategy.',
    areas: ['testing'],
    tags: ['testing'],
  },
  {
    id: 'product.shared.localization',
    type: 'product',
    title: 'Localization',
    status: 'current',
    file: 'docs/product/shared/localization.md',
    body: '',
    read_when: ['adding user-facing copy'],
    summary: 'All user-facing strings must be localizable.',
  },
];

describe('normalizeTerm / tokenize', () => {
  it('singularizes and de-duplicates', () => {
    expect(normalizeTerm('conventions')).toBe('convention');
    expect(normalizeTerm('branches')).toBe('branch');
    expect(tokenize('React, react components!')).toEqual(['react', 'component']);
  });

  it('trims long non-alphanumeric prefixes and suffixes without changing normalization', () => {
    const punctuation = '/'.repeat(100_000);
    expect(normalizeTerm(`${punctuation}branches${punctuation}`)).toBe('branch');
  });

  it('returns empty for input containing only non-alphanumeric characters', () => {
    expect(normalizeTerm('/'.repeat(200_000))).toBe('');
  });

  it('trims only the edges', () => {
    expect(normalizeTerm('/foo/bar/')).toBe('foo/bar');
  });
});

describe('scoreDoc', () => {
  it('scores full coverage above partial and zero for no match', () => {
    expect(scoreDoc(CORPUS[0]!, 'git workflow').score).toBeGreaterThan(
      scoreDoc(CORPUS[0]!, 'git bicycle').score,
    );
    expect(scoreDoc(CORPUS[0]!, 'kubernetes').score).toBe(0);
  });
});

describe('searchDocs', () => {
  it('uses OR semantics for multi-term discovery and returns every matching document without a limit', () => {
    const results = searchDocs(CORPUS, { query: 'react git testing' });
    expect(results.map((d) => d.id).sort()).toEqual([
      'design-system.implementation.react.component-guidelines',
      'engineering.repository.git-workflow',
      'engineering.shared.testing',
    ]);
  });

  it('searches taxonomy fields and supports taxonomy filters', () => {
    expect(searchDocs(CORPUS, { query: 'github' }).map((d) => d.id)).toEqual([
      'engineering.repository.git-workflow',
    ]);
    expect(searchDocs(CORPUS, { area: 'ui' }).map((d) => d.id)).toEqual([
      'design-system.implementation.react.component-guidelines',
    ]);
    expect(searchDocs(CORPUS, { tag: 'testing' }).map((d) => d.id)).toEqual([
      'engineering.shared.testing',
    ]);
  });

  it('ranks deterministically and filters by type / limit', () => {
    const a = searchDocs(CORPUS, { query: 'pull request branch' });
    const b = searchDocs(CORPUS, { query: 'pull request branch' });
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
    expect(a[0]?.id).toBe('engineering.repository.git-workflow');
    expect(searchDocs(CORPUS, { type: 'product' }).map((d) => d.id)).toEqual([
      'product.shared.localization',
    ]);
    expect(searchDocs(CORPUS, { query: 'component react git', limit: 1 })).toHaveLength(1);
  });

  it('excludeStatuses drops deprecated/superseded so a replacement wins context', () => {
    const withHistory: DocRecord[] = [
      ...CORPUS,
      {
        id: 'engineering.repository.git-workflow-old',
        type: 'engineering',
        title: 'Old git workflow',
        status: 'superseded',
        superseded_by: 'engineering.repository.git-workflow',
        file: 'docs/development/git-workflow-old.md',
        body: '',
        read_when: ['creating a branch'],
        summary: 'Old branch naming and PR strategy. Superseded.',
      },
    ];
    const context = searchDocs(withHistory, {
      query: 'branch pull request strategy',
      excludeStatuses: ['deprecated', 'superseded'],
    });
    expect(context.map((d) => d.id)).not.toContain('engineering.repository.git-workflow-old');
    expect(context[0]?.id).toBe('engineering.repository.git-workflow');
    // list/find (no exclusion) still surface the historical doc.
    expect(
      searchDocs(withHistory, { query: 'branch pull request strategy' }).map((d) => d.id),
    ).toContain('engineering.repository.git-workflow-old');
  });
});
