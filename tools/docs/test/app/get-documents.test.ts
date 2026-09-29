import { describe, expect, it } from 'vitest';

import { getDocuments } from '../../src/app/find-documents.js';
import { createMemoryRepo } from '../support/memory-repo.js';

const repo = createMemoryRepo({
  'docs/a.md': `---
id: engineering.a
type: engineering
title: A
status: current
read_when:
  - doing a
summary: A doc.
---
`,
  'docs/b.md': `---
id: engineering.b
type: engineering
title: B
status: current
read_when:
  - doing b
summary: B doc.
---
`,
});

describe('getDocuments', () => {
  it('resolves exact stable ids in caller order', () => {
    expect(getDocuments(repo, ['engineering.b', 'engineering.a']).map((d) => d.id)).toEqual([
      'engineering.b',
      'engineering.a',
    ]);
  });

  it('fails closed for unknown ids', () => {
    expect(() => getDocuments(repo, ['engineering.missing'])).toThrow(/unknown document id/);
  });
});
