import type { DocRecord } from '@nevo/specflow-docs';
import { describe, expect, it } from 'vitest';

import { validateRoadmapTables } from '../../src/domain/markdown-tables.js';

const roadmap = (body: string, id = 'ideas.roadmap'): DocRecord => ({
  id,
  type: 'hub',
  file: 'docs/ideas/roadmap.md',
  status: 'draft',
  body,
});

describe('validateRoadmapTables', () => {
  it('accepts matching GitHub-flavoured Markdown table widths', () => {
    expect(
      validateRoadmapTables([
        roadmap(
          '| ID | Capability | State |\n| --- | --- | --- |\n| P100 | Task authoring | Done |',
        ),
      ]),
    ).toEqual([]);
  });

  it('rejects a body row wider than its table header', () => {
    const broken = roadmap(
      '| ID | Capability | Status |\n| --- | --- | --- |\n| P100 | Task authoring | Partial | #137 |',
    );

    expect(validateRoadmapTables([broken])).toEqual([
      'docs/ideas/roadmap.md:3: Markdown table has 4 cells, header has 3',
    ]);
  });

  it('rejects separator width mismatches and shorter rows', () => {
    const broken = roadmap('| First | Second |\n| --- | --- | --- |\n| one |');
    expect(validateRoadmapTables([broken])).toHaveLength(2);
  });

  it('does not split escaped pipes or pipes inside inline code', () => {
    expect(
      validateRoadmapTables([roadmap('| ID | State |\n| --- | --- |\n| a\\|b | `x|y` |')]),
    ).toEqual([]);
  });

  it('ignores code fences and unrelated documentation records', () => {
    const broken = '| A | B |\n| --- | --- |\n| x | y | z |';
    expect(
      validateRoadmapTables([
        roadmap('```md\n' + broken + '\n```'),
        roadmap(broken, 'ideas.specflow-runtime'),
      ]),
    ).toEqual([]);
  });
});
