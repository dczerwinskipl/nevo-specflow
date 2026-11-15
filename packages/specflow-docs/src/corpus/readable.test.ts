import { describe, expect, it } from 'vitest';

import type { DocRecord } from '../frontmatter/contract';
import { selectReadableDocs } from './readable';

const doc = (file: string, fields: Record<string, unknown>): DocRecord => ({
  file,
  body: '',
  id: file,
  type: 'hub',
  title: file,
  status: 'current',
  ...fields,
});

describe('selectReadableDocs', () => {
  it('skips missing, unparseable, invalid and duplicate-id documents, and keeps dangling references', () => {
    const { docs, skipped, skippedById } = selectReadableDocs(
      {
        docs: [
          doc('good.md', { related: ['nowhere'] }),
          doc('bad-scope.md', { scope: 'nope' }),
          doc('twin-a.md', { id: 'twin' }),
          doc('twin-b.md', { id: 'twin' }),
        ],
        missingFrontmatter: ['plain.md'],
        invalidFrontmatter: [{ file: 'yaml.md', error: 'Invalid YAML frontmatter in yaml.md: x' }],
      },
      { scopes: ['repo'] },
    );

    expect(docs.map((d) => d.file)).toEqual(['good.md']);
    expect(skipped.map((s) => s.path)).toEqual([
      'bad-scope.md',
      'plain.md',
      'twin-a.md',
      'twin-b.md',
      'yaml.md',
    ]);
    expect(skipped[0]!.error).toMatch(/unknown scope 'nope'/);
    expect(skipped[2]!.error).toBe("duplicate id 'twin' (also in twin-b.md)");
    expect(skippedById.get('twin')).toHaveLength(2);
  });
});
