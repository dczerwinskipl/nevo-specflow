import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { antigravityQuestionAnswer, prepareAntigravityQuestion } from './questions';

describe('Antigravity question mapping', () => {
  it('keeps multi-choice answers structured and preserves literal user text', () => {
    const question = prepareAntigravityQuestion({
      question: 'Pick scopes',
      allowText: true,
      maxSelections: 2,
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(
      JSON.parse(
        antigravityQuestionAnswer(question, {
          requestId: randomUUID(),
          kind: 'question',
          answer: { optionIds: ['b', 'a'], text: '/literal user answer' },
        }),
      ),
    ).toEqual({
      selections: [
        { id: 'b', label: 'B' },
        { id: 'a', label: 'A' },
      ],
      text: '/literal user answer',
    });
  });

  it('rejects impossible questions and answers outside the canonical question contract', () => {
    for (const input of [
      { question: 'Pick', allowText: false },
      { question: 'Pick', maxSelections: 2 },
      { question: 'Pick', maxSelections: 2, options: [{ id: 'a', label: 'A' }] },
    ]) {
      expect(() => prepareAntigravityQuestion(input)).toThrow();
    }

    const question = prepareAntigravityQuestion({
      question: 'Pick',
      allowText: false,
      options: [{ id: 'a', label: 'A' }],
    });
    for (const answer of [
      { optionIds: [] },
      { optionIds: ['missing'] },
      { optionIds: ['a', 'a'] },
      { optionIds: ['a'], text: 'Unexpected text' },
    ]) {
      expect(() =>
        antigravityQuestionAnswer(question, { requestId: randomUUID(), kind: 'question', answer }),
      ).toThrow();
    }

    expect(() =>
      antigravityQuestionAnswer(question, {
        requestId: randomUUID(),
        kind: 'permission',
        decision: 'allow',
      }),
    ).toThrow();
  });
});
