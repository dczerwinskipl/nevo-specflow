import { describe, expect, it } from 'vitest';

import { getContext } from '../../src/app/find-documents.js';
import { createMemoryRepo } from '../support/memory-repo.js';

function doc(id: number, status = 'current'): string {
  return `---
id: engineering.context-${id}
type: engineering
title: Context ${id}
status: ${status}
read_when:
  - testing context discovery
summary: Testing context document ${id}.
---
`;
}

const repo = createMemoryRepo({
  'docs/context-1.md': doc(1),
  'docs/context-2.md': doc(2),
  'docs/context-3.md': doc(3),
  'docs/context-4.md': doc(4),
  'docs/context-5.md': doc(5),
  'docs/context-6.md': doc(6),
  'docs/context-7.md': doc(7),
  'docs/context-old.md': doc(8, 'deprecated'),
  'docs/ideas/context-idea.md': doc(9, 'draft'),
});

describe('getContext', () => {
  it('returns every active match when no limit is supplied', () => {
    const entries = getContext(repo, { query: 'testing' });

    expect(entries).toHaveLength(7);
    expect(entries.every((entry) => entry.status === 'current')).toBe(true);
  });

  it('applies an explicit limit when requested', () => {
    expect(getContext(repo, { query: 'testing', limit: 3 })).toHaveLength(3);
  });

  it('does not recommend non-authoritative idea backlog documents', () => {
    expect(getContext(repo, { query: '9' })).toEqual([]);
  });
});
