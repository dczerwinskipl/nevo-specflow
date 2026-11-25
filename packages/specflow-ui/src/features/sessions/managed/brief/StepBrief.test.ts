import { describe, expect, it } from 'vitest';
import { briefParts } from './StepBrief';
import { stepBriefText } from './stepBrief.stories-support';

describe('briefParts', () => {
  it('splits SpecFlow’s words from the blocks it gives the agent as data', () => {
    const parts = briefParts(stepBriefText);

    expect(parts.map((part) => (part.kind === 'data' ? part.source : 'text'))).toEqual([
      'text',
      'step.purpose',
      'text',
      'archetype.profile',
      'text',
      'handoff',
      'text',
    ]);
    expect(parts[1]).toEqual({
      kind: 'data',
      source: 'step.purpose',
      text: 'Draft Tasks that together cover the solution, each one verifiable.',
    });
  });

  it('keeps a brief without data blocks as one text part', () => {
    expect(briefParts('# Brief\nDo the step.')).toEqual([
      { kind: 'text', text: '# Brief\nDo the step.' },
    ]);
  });
});
