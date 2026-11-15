import { describe, expect, it } from 'vitest';

import { matchesTemplateShape, templateShape } from './template-match';

const values = {
  specificationTitle: 'Search cutoff',
  specificationTitleJson: '"Search cutoff"',
  slug: 'search-cutoff',
  created: '2026-11-15',
};
const overview = '# {{specificationTitle}}\n\n## Goal\n\n{{goalOrPrompt}}\n\n## Non-goals\n';

describe('template shape', () => {
  it('matches the rendered template whatever the goal holds', () => {
    const shape = templateShape(overview, values);

    expect(
      matchesTemplateShape(
        '# Search cutoff\r\n\r\n## Goal\n\nDrop weak hits.  \n\n## Non-goals\n',
        shape,
      ),
    ).toBe(true);
    expect(matchesTemplateShape('# Search cutoff\n\n## Goal\n\n## Non-goals', shape)).toBe(true);
  });

  it('does not match once a section holds text of its own', () => {
    const shape = templateShape(overview, values);

    expect(
      matchesTemplateShape('# Search cutoff\n\n## Goal\n\nx\n\n## Non-goals\n\nNo UI.\n', shape),
    ).toBe(false);
    expect(matchesTemplateShape('# Renamed\n\n## Goal\n\nx\n\n## Non-goals\n', shape)).toBe(false);
  });

  it('does not take a section added in the goal slot for the goal', () => {
    const shape = templateShape(overview, values);

    expect(
      matchesTemplateShape(
        '# Search cutoff\n\n## Goal\n\nDrop weak hits.\n\n## Design\n\nA cutoff per mode.\n\n## Non-goals\n',
        shape,
      ),
    ).toBe(false);
    expect(
      matchesTemplateShape('# Search cutoff\n\n## Goal\n\n### Detail\n\n## Non-goals\n', shape),
    ).toBe(false);
  });

  it('compares a template without a goal exactly', () => {
    const shape = templateShape('# Behaviour\n\n## Scenarios\n', values);

    expect(matchesTemplateShape('# Behaviour\n\n## Scenarios\n\n', shape)).toBe(true);
    expect(matchesTemplateShape('# Behaviour\n\n## Scenarios\n\nGiven a query.\n', shape)).toBe(
      false,
    );
  });
});
