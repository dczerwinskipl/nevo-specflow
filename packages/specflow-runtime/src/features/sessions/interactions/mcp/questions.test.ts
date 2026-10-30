import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mcpQuestionAnswer, prepareMcpQuestion } from './questions';

describe('MCP question mapping', () => {
  it('keeps multi-choice answers structured and preserves literal user text', () => {
    const question = prepareMcpQuestion({
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
        mcpQuestionAnswer(question, {
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
      expect(() => prepareMcpQuestion(input)).toThrow();
    }

    const question = prepareMcpQuestion({
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
        mcpQuestionAnswer(question, { requestId: randomUUID(), kind: 'question', answer }),
      ).toThrow();
    }

    expect(() =>
      mcpQuestionAnswer(question, {
        requestId: randomUUID(),
        kind: 'permission',
        decision: 'allow',
      }),
    ).toThrow();
  });
});
