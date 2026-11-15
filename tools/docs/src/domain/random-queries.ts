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

/**
 * mulberry32: a small 32-bit PRNG (period 2^32) in unsigned 32-bit arithmetic, so no bit is lost to
 * floating-point rounding. Each call returns the next unsigned 32-bit integer.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return (mixed ^ (mixed >>> 14)) >>> 0;
  };
}

/** `count` nonsense strings as `random` questions without a language or an answer. */
export function generateRandomQueries(count: number, seed = RANDOM_QUERY_SEED): EvalQuestion[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`The random query count must be a non-negative integer, got ${count}.`);
  }

  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`The random query seed must be an unsigned 32-bit integer, got ${seed}.`);
  }

  const random = mulberry32(seed);
  const next = () => random() / 4294967296;

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
