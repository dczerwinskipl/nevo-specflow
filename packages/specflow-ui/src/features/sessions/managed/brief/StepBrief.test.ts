import { describe, expect, it } from 'vitest';
import { briefParts, briefPurpose, readableBrief } from './StepBrief';
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

describe('briefPurpose', () => {
  it('reads the step purpose as the short instruction, nothing else of the brief', () => {
    expect(briefPurpose(stepBriefText)).toBe(
      'Draft Tasks that together cover the solution, each one verifiable.',
    );
  });

  it('keeps the first paragraph, also from a preview cut inside the block, and none without one', () => {
    expect(
      briefPurpose('Purpose:\n<untrusted source="step.purpose">\nFirst part.\n\nSecond part'),
    ).toBe('First part.');
    expect(briefPurpose('# Brief\nDo the step.')).toBeUndefined();
  });
});

describe('readableBrief', () => {
  it('keeps the texts a person reads, from the blocks tagged by source, never ids or names', () => {
    expect(readableBrief(stepBriefText)).toEqual({
      purpose: 'Draft Tasks that together cover the solution, each one verifiable.',
    });
  });

  it('reads the Task summary from its own block', () => {
    expect(
      readableBrief(
        [
          'Task: Sign-in screen (type ui)',
          '<untrusted source="task.summary">',
          'The form.',
          '</untrusted>',
        ].join('\n'),
      ),
    ).toEqual({ taskSummary: 'The form.' });
  });
});
