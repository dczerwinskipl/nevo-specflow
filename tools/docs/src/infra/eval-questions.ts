// Reads the eval question set (`tools/docs/eval/questions.yaml`), validated at the file boundary.

import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import {
  ANSWERABLE_CLASSES,
  EVAL_CLASSES,
  type EvalClass,
  type EvalLanguage,
  type EvalQuestion,
} from '../domain/retrieval-metrics.js';

/**
 * Each question names up to 3 expected documents; none marks a question with no answer. `class`
 * (`EvalClass`) defaults to `correct` with expected documents and `negative` without.
 */
const MAX_EXPECTED = 3;
const LANGUAGES: readonly EvalLanguage[] = ['en', 'pl'];

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
    const { question, lang, expected } = item;
    const answerable = Array.isArray(expected) && expected.length > 0;
    const kind = item.class ?? (answerable ? 'correct' : 'negative');
    if (
      !EVAL_CLASSES.includes(kind as EvalClass) ||
      ANSWERABLE_CLASSES.includes(kind as EvalClass) !== answerable
    ) {
      throw new Error(
        `${file}: questions[${index}] has class ${JSON.stringify(kind)}; with expected documents it is one of ${ANSWERABLE_CLASSES.join(', ')} (default correct), without them negative or random (default negative)`,
      );
    }

    if (
      typeof question !== 'string' ||
      question.trim() === '' ||
      // A `random` string may have no language.
      !(LANGUAGES.includes(lang as EvalLanguage) || (lang === undefined && kind === 'random')) ||
      !Array.isArray(expected) ||
      expected.length > MAX_EXPECTED ||
      !expected.every((id) => typeof id === 'string' && id !== '')
    ) {
      throw new Error(
        `${file}: questions[${index}] needs a 'question', 'lang' (${LANGUAGES.join(' or ')}; optional for class random) and 0..${MAX_EXPECTED} 'expected' document ids`,
      );
    }

    return {
      question: question.trim(),
      ...(lang === undefined ? {} : { lang: lang as EvalLanguage }),
      class: kind as EvalClass,
      expected: expected as string[],
    };
  });
}
