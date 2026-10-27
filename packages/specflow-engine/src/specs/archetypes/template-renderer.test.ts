import { describe, expect, it } from 'vitest';

import { seedCatalogueForTesting } from '../definitions/testing-install';
import {
  GOAL_PROMPT_FALLBACK,
  TEMPLATE_PLACEHOLDERS,
  renderTemplate,
  templateValues,
} from './template-renderer';

const catalogue = await seedCatalogueForTesting();

describe('template renderer', () => {
  const values = templateValues({
    title: '  A   "quoted"\ttitle ',
    slug: 'a-title',
    goal: '  the goal  ',
    created: '2026-10-24',
  });

  it('substitutes every placeholder', () => {
    expect(values).toEqual({
      specificationTitle: 'A "quoted" title',
      specificationTitleJson: '"A \\"quoted\\" title"',
      slug: 'a-title',
      goal: 'the goal',
      goalOrPrompt: 'the goal',
      created: '2026-10-24',
    });
    const text = TEMPLATE_PLACEHOLDERS.map((name) => `{{${name}}}`).join('|');
    expect(renderTemplate(text, values)).toBe(
      'A "quoted" title|"A \\"quoted\\" title"|a-title|the goal|the goal|2026-10-24',
    );
  });

  it('uses the fixed fallback for an empty goal', () => {
    const empty = templateValues({ title: 't', slug: 't', goal: ' \n', created: '2026-10-24' });
    expect(empty.goal).toBe('');
    expect(empty.goalOrPrompt).toBe(GOAL_PROMPT_FALLBACK);
    expect(templateValues({ title: 't', slug: 't', created: '2026-10-24' }).goalOrPrompt).toBe(
      'Describe the intended outcome of this specification.',
    );
  });

  it('leaves unknown placeholders as is and never rescans substituted values', () => {
    const tricky = templateValues({
      title: '{{slug}}',
      slug: 'real-slug',
      goal: '{{created}} $& $1',
      created: '2026-10-24',
    });
    expect(renderTemplate('{{unknown}} {{ slug }} {{specificationTitle}} {{goal}}', tricky)).toBe(
      '{{unknown}} {{ slug }} {{slug}} {{created}} $& $1',
    );
  });

  it('is deterministic', () => {
    const content = catalogue.findTemplate('minimal', 'overview')!.content;
    expect(renderTemplate(content, values)).toBe(renderTemplate(content, values));
  });
});
