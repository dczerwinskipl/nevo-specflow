// Reads the eval question set (`tools/docs/eval/questions.yaml`), validated at the file boundary.

import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import type { EvalQuestion } from '../domain/retrieval-metrics.js';

/** Each question names 1..3 expected documents. */
const MAX_EXPECTED = 3;

export function readEvalQuestions(file: string): EvalQuestion[] {
  const parsed: unknown = parse(readFileSync(file, 'utf8'));
  const list =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { questions?: unknown }).questions
      : undefined;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${file}: expected a non-empty 'questions' list`);
  }

  return list.map((entry: unknown, index): EvalQuestion => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    const { question, expected } = item;
    if (
      typeof question !== 'string' ||
      question.trim() === '' ||
      !Array.isArray(expected) ||
      expected.length < 1 ||
      expected.length > MAX_EXPECTED ||
      !expected.every((id) => typeof id === 'string' && id !== '')
    ) {
      throw new Error(
        `${file}: questions[${index}] needs a 'question' and 1..${MAX_EXPECTED} 'expected' document ids`,
      );
    }

    return { question: question.trim(), expected: expected as string[] };
  });
}
