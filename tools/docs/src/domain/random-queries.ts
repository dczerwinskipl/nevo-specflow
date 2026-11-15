// Generated nonsense queries for the retrieval eval (`pnpm docs:eval --random <count>`): strings that
// mean nothing, of the shapes a mistyped or pasted search box receives (letter runs, keyboard
// mashes, digits, emoji, other scripts, punctuation, pronounceable pseudo-words, mixed Polish
// letters). Hand-written nonsense is too easy: the vector similarity of these strings reaches that
// of real questions far more often. Seeded, so a count always yields the same strings.

import type { EvalQuestion } from './retrieval-metrics.js';

/** The seed of `pnpm docs:eval --random`. */
export const RANDOM_QUERY_SEED = 156;

const LOWER = [...'abcdefghijklmnopqrstuvwxyz'];
const KEYS = [...'asdfghjklqwertyuiopzxcvbnm'];
const DIGITS = [...'0123456789'];
const CYRILLIC = [...'абвгдежзийклмнопрстуфхцчшщыэюя'];
const CJK = [...'漢字テスト日本語中文한국어的是不了人我在有他这'];
const EMOJI = ['🍕', '🚀', '🦄', '😀', '🎉', '🔥', '💡', '🐙', '🌈', '☃', '⚽', '🎸'];
const PUNCTUATION = [...'!?#@$%^&*()[]{};:,.<>/~'];
const CONSONANTS = [...'bcdfghjklmnprstvwz'];
const VOWELS = [...'aeiou'];
const MIXED = [...LOWER, ...'ĄĘŚĆŻąęśćżńó0123456789'];

/** `count` nonsense strings as `random` questions without a language or an answer. */
export function generateRandomQueries(count: number, seed = RANDOM_QUERY_SEED): EvalQuestion[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`The random query count must be a non-negative integer, got ${count}.`);
  }

  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state / 2147483648;
  };

  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const run = (alphabet: readonly string[], min: number, max: number) =>
    Array.from({ length: min + Math.floor(next() * (max - min + 1)) }, () => pick(alphabet)).join(
      '',
    );
  const pseudoWord = () =>
    Array.from({ length: 2 + Math.floor(next() * 3) }, () => pick(CONSONANTS) + pick(VOWELS)).join(
      '',
    );
  const shapes = [
    () => run(LOWER, 5, 22),
    () => `${run(KEYS, 4, 12)} ${run(KEYS, 3, 8)}`,
    () => run(DIGITS, 1, 12),
    () => run(EMOJI, 1, 4),
    () => run(CYRILLIC, 4, 10),
    () => run(CJK, 2, 6),
    () => run(PUNCTUATION, 2, 8),
    () => `${pseudoWord()} ${pseudoWord()} ${pseudoWord()}`,
    () => pick(LOWER),
    () => run(MIXED, 6, 16),
  ];

  return Array.from({ length: count }, (_, index) => ({
    question: shapes[index % shapes.length]!(),
    class: 'random' as const,
    expected: [],
  }));
}
