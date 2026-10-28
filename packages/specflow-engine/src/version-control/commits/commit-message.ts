/**
 * Pure rules for the commit message a person writes (ADR 0018 decision 8, "Message"). The text is
 * user input that ends up in the repository history under the Engine's committer identity, so it
 * is validated, cleaned and neutralised here and again by the commit port (defence in depth): the
 * Engine's own trailers are the last paragraph of the message and only that paragraph is ever read
 * back, but a line in the person's text that looks like one must never be mistaken for one by a
 * human or a tool. No I/O.
 */

/** The first line (the subject) of a manual commit message, in characters. */
export const COMMIT_SUBJECT_MAX = 100;
/** The body of a manual commit message, in characters. */
export const COMMIT_BODY_MAX = 2000;

/** Why a message is refused. */
export type CommitMessageProblem =
  /** No first line after trimming. */
  | 'empty'
  /** The first line is longer than {@link COMMIT_SUBJECT_MAX} characters. */
  | 'subject-too-long'
  /** The body is longer than {@link COMMIT_BODY_MAX} characters. */
  | 'body-too-long'
  /** The text contains a NUL character (never cleaned away: it is refused). */
  | 'contains-nul';

export interface CommitMessageText {
  /** One line, 1 to {@link COMMIT_SUBJECT_MAX} characters. */
  readonly subject: string;
  /** Zero or more lines; empty when the message has only a first line. */
  readonly body: string;
}

export type ParsedCommitMessage =
  | { readonly ok: true; readonly message: CommitMessageText }
  | { readonly ok: false; readonly problem: CommitMessageProblem };

/** Builds a character class from code point ranges, so the source holds no invisible characters. */
function characterClass(ranges: readonly (readonly [number, number])[]): string {
  const point = (code: number): string => '\\u{' + code.toString(16) + '}';
  return (
    '[' +
    ranges.map(([from, to]) => point(from) + (to > from ? '-' + point(to) : '')).join('') +
    ']'
  );
}

/** Every kind of line break the text may use; all become `\n`: CRLF, CR, NEL, LINE and PARAGRAPH SEPARATOR. */
const LINE_BREAKS = new RegExp(
  '\\r\\n|' +
    characterClass([
      [0x0d, 0x0d],
      [0x85, 0x85],
      [0x2028, 0x2029],
    ]),
  'gu',
);
/**
 * Removed: the C0 controls except tab and line feed (so also VT, FF, ESC and BEL), DEL, the C1
 * controls, the zero-width and bidirectional formatting characters that can disguise text in a log,
 * and the byte order mark.
 */
const REMOVED = new RegExp(
  characterClass([
    [0x00, 0x08],
    [0x0b, 0x1f],
    [0x7f, 0x9f],
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2060, 0x2064],
    [0x2066, 0x2069],
    [0xfeff, 0xfeff],
  ]),
  'gu',
);
/** An unpaired surrogate half is not text; it would be written to the repository as a replacement character. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;
/** A line that reads like an Engine trailer (`Nevo-Operation: ...`), whatever its case or indentation. */
const TRAILER_LIKE = /^\s*Nevo-[A-Za-z]+\s*:/iu;

const characters = (text: string): number => Array.from(text).length;

/** Line breaks normalised, every removed character dropped, trailing blanks of each line trimmed. */
function cleaned(text: string): string {
  return text
    .replace(LINE_BREAKS, '\n')
    .replace(REMOVED, '')
    .replace(LONE_SURROGATE, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

/**
 * Prefixes every line that looks like an Engine trailer with `> ` (a quoted line is not a trailer).
 * A line that already starts with `>` is left alone. Idempotent.
 */
export function neutralizeTrailerLikeLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (TRAILER_LIKE.test(line) ? '> ' + line.trimStart() : line))
    .join('\n');
}

/**
 * Validates and cleans the text of a manual commit (the person's message):
 * the first line, trimmed, is 1 to 100 characters; the rest is an optional body of at most 2000
 * characters; a NUL is refused; other control characters are removed; carriage returns and the
 * other line breaks are normalised to line feeds; blank lines at the start and the end go; the
 * subject is one line. The characters are counted on the cleaned text, before neutralisation.
 * The result is already neutralised: no line of it reads like an Engine trailer.
 */
export function parseUserCommitMessage(text: string): ParsedCommitMessage {
  if (text.includes('\0')) return { ok: false, problem: 'contains-nul' };
  const lines = cleaned(text).trim().split('\n');
  const subject = (lines[0] ?? '').replace(/\t/gu, ' ').trim();
  if (subject.length === 0) return { ok: false, problem: 'empty' };
  if (characters(subject) > COMMIT_SUBJECT_MAX) return { ok: false, problem: 'subject-too-long' };
  const body = lines.slice(1).join('\n').trim();
  if (characters(body) > COMMIT_BODY_MAX) return { ok: false, problem: 'body-too-long' };
  return {
    ok: true,
    message: {
      subject: neutralizeTrailerLikeLines(subject),
      body: neutralizeTrailerLikeLines(body),
    },
  };
}

/**
 * What the commit port writes for a body it was handed: the same cleaning and neutralisation as
 * {@link parseUserCommitMessage} (a NUL is dropped here, it cannot be an argument), bounded to
 * twice the documented length so a caller that skipped the validation cannot fill the history.
 */
export function commitBodyForGit(body: string): string {
  const text = cleaned(body.replace(/\0/gu, '')).trim();
  return neutralizeTrailerLikeLines(
    Array.from(text)
      .slice(0, COMMIT_BODY_MAX * 2)
      .join(''),
  );
}

/** One-line variant for the subject the port writes: a single cleaned line, neutralised, bounded. */
export function commitSubjectForGit(subject: string, max: number): string {
  const line = cleaned(subject.replace(/\0/gu, ''))
    .replace(/\n+/gu, ' ')
    .replace(/\t/gu, ' ')
    .trim();
  return neutralizeTrailerLikeLines(Array.from(line).slice(0, max).join(''));
}
