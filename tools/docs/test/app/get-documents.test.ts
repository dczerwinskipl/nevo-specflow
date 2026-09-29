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
  'docs/replacement.md': `---
id: engineering.replacement
type: engineering
title: Replacement
status: current
read_when:
  - doing replacement work
summary: Current replacement.
---
`,
  'docs/old.md': `---
id: engineering.old
type: engineering
title: Old
status: superseded
read_when:
  - doing old work
summary: Superseded guidance.
superseded_by: engineering.replacement
---
`,
});

describe('getDocuments', () => {
  it('resolves exact stable ids in caller order and exposes status', () => {
    const entries = getDocuments(repo, ['engineering.b', 'engineering.a']);
    expect(entries.map((d) => d.id)).toEqual(['engineering.b', 'engineering.a']);
    expect(entries.map((d) => d.status)).toEqual(['current', 'current']);
  });

  it('fails closed for unknown ids', () => {
    expect(() => getDocuments(repo, ['engineering.missing'])).toThrow(/unknown document id/);
  });

  it('fails closed for inactive ids and points at a superseding document when available', () => {
    expect(() => getDocuments(repo, ['engineering.old'])).toThrow(
      /engineering\.old.*superseded.*engineering\.replacement/,
    );
  });
});
