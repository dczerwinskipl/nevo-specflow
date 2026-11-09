import { describe, expect, it } from 'vitest';

import { validateDocumentation } from '../../src/app/validate-documentation.js';
import { createMemoryRepo } from '../support/memory-repo.js';

const hub = (id: string, body: string): string =>
  `---\nid: ${id}\ntype: hub\ntitle: ${id}\nstatus: current\n---\n${body}`;

describe('validateDocumentation links', () => {
  it('reports broken relative links but still regenerates the index on a valid corpus', () => {
    const repo = createMemoryRepo({
      'docs/README.md': hub('docs.readme', '# Docs\n\n[guide](guide.md#setup)\n[gone](gone.md)\n'),
      'docs/guide.md': hub('docs.guide', '# Guide\n\n## Install\n'),
    });

    const result = validateDocumentation(repo, { write: true });

    expect(result.wroteIndex).toBe(true);
    expect(result.indexStale).toBe(false);
    expect(result.problems).toEqual([
      "docs/README.md (body line 3): broken link 'guide.md#setup' (no heading '#setup')",
      "docs/README.md (body line 4): broken link 'gone.md' (no such file or directory)",
    ]);
  });

  it('resolves links to non-document files and directories through the repository', () => {
    const repo = createMemoryRepo({
      'docs/README.md': hub(
        'docs.readme',
        '[pkg](../packages/x/README.md) [dir](../packages/x/)\n',
      ),
      'packages/x/README.md': '# x\n',
    });

    expect(validateDocumentation(repo, { write: true }).problems).toEqual([]);
  });

  it('flags a stale index separately from link problems', () => {
    const repo = createMemoryRepo({ 'docs/README.md': hub('docs.readme', '[gone](gone.md)') });

    const result = validateDocumentation(repo);

    expect(result.indexStale).toBe(true);
    expect(result.problems).toHaveLength(3);
  });
});
