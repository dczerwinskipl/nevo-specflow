import { describe, expect, it } from 'vitest';

import { answeredQuestion } from './answered-question';

const interaction = {
  interactionId: 'i',
  turnId: 't',
  workId: 'w',
  revision: 1,
  kind: 'question' as const,
  header: 'Scope',
  prompt:
    'Which batches should this Specification deliver?\n\nSelect one option or enter your answer.\n\nAll batches A–E: full convergence.',
  allowText: true,
  maxSelections: 1,
  options: [
    { id: '0', label: 'All batches A–E (Recommended)' },
    { id: '1', label: 'Batches A–C only' },
  ],
};

describe('answeredQuestion', () => {
  it('records the question, its options and the chosen option', () => {
    expect(answeredQuestion(interaction, { optionIds: ['0'] })).toEqual({
      header: 'Scope',
      text: 'Which batches should this Specification deliver?',
      options: interaction.options,
      answer: { optionIds: ['0'] },
    });
  });

  it('keeps a free-text answer, trimmed and bounded', () => {
    const recorded = answeredQuestion(interaction, {
      optionIds: [],
      text: `  ${'x'.repeat(3000)} `,
    });
    expect(recorded.answer.optionIds).toEqual([]);
    expect(recorded.answer.text!).toHaveLength(2048);
    expect(recorded.answer.text!.endsWith('…')).toBe(true);
  });

  it('bounds a long question and works without a header or options', () => {
    const { header: _header, options: _options, ...plain } = interaction;
    const recorded = answeredQuestion(
      { ...plain, prompt: 'q'.repeat(2000) },
      { optionIds: [], text: 'Do it' },
    );
    expect(recorded.header).toBeUndefined();
    expect(recorded.options).toBeUndefined();
    expect(recorded.text).toHaveLength(1024);
    expect(recorded.answer).toEqual({ optionIds: [], text: 'Do it' });
  });
});
