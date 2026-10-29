import { describe, expect, it } from 'vitest';

import {
  COMMIT_BODY_MAX,
  COMMIT_SUBJECT_MAX,
  commitBodyForGit,
  commitSubjectForGit,
  neutralizeTrailerLikeLines,
  parseUserCommitMessage,
  type CommitMessageProblem,
} from './commit-message';

const accepted = (text: string): { subject: string; body: string } => {
  const parsed = parseUserCommitMessage(text);
  if (!parsed.ok) {
    throw new Error('refused: ' + parsed.problem);
  }

  return parsed.message;
};

const refused = (text: string): CommitMessageProblem => {
  const parsed = parseUserCommitMessage(text);
  if (parsed.ok) {
    throw new Error('accepted');
  }

  return parsed.problem;
};

describe('parseUserCommitMessage: shape', () => {
  it('takes a one-line message as the subject with an empty body', () => {
    expect(accepted('Update the notes')).toEqual({ subject: 'Update the notes', body: '' });
  });

  it('splits the first line from the body and drops the blank line between them', () => {
    expect(accepted('Subject\n\nFirst paragraph\n\nSecond paragraph')).toEqual({
      subject: 'Subject',
      body: 'First paragraph\n\nSecond paragraph',
    });
    // No blank line in the text: the rest is still the body.
    expect(accepted('Subject\nbody line')).toEqual({ subject: 'Subject', body: 'body line' });
  });

  it('trims the text, its lines and the blank lines at the start and the end', () => {
    expect(accepted('\n\n  Subject  \n\n  body  \n\n\n')).toEqual({
      subject: 'Subject',
      body: 'body',
    });
    expect(accepted('Subject\n\n   \n\n')).toEqual({ subject: 'Subject', body: '' });
  });

  it('keeps tabs in the body and turns them into spaces in the subject', () => {
    expect(accepted('A\tB\n\nx\ty')).toEqual({ subject: 'A B', body: 'x\ty' });
  });

  it('keeps non-ASCII text, emoji and a full-width colon', () => {
    expect(
      accepted(
        'Za\u{17c}\u{f3}\u{142}\u{107} g\u{119}\u{15b}l\u{105} ja\u{17a}\u{144} \u{1F600}\n\nNevo-Operation\u{ff1a} x',
      ),
    ).toEqual({
      subject: 'Za\u{17c}\u{f3}\u{142}\u{107} g\u{119}\u{15b}l\u{105} ja\u{17a}\u{144} \u{1F600}',
      body: 'Nevo-Operation\u{ff1a} x',
    });
  });
});

describe('parseUserCommitMessage: limits', () => {
  it('refuses an empty message and one that is only blanks', () => {
    for (const text of ['', ' ', '\n\n', ' \t \n x']) {
      expect(parseUserCommitMessage(text).ok).toBe(
        text.trim().length > 0 && text.startsWith(' \t'),
      );
    }

    expect(refused('')).toBe('empty');
    expect(refused('   \n  \n')).toBe('empty');
  });

  it('allows a first line of exactly 100 characters and refuses 101', () => {
    expect(accepted('a'.repeat(COMMIT_SUBJECT_MAX)).subject).toHaveLength(COMMIT_SUBJECT_MAX);
    expect(refused('a'.repeat(COMMIT_SUBJECT_MAX + 1))).toBe('subject-too-long');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(accepted('\u{1F600}'.repeat(COMMIT_SUBJECT_MAX)).subject).toBe(
      '\u{1F600}'.repeat(COMMIT_SUBJECT_MAX),
    );
    expect(refused('\u{1F600}'.repeat(COMMIT_SUBJECT_MAX + 1))).toBe('subject-too-long');
  });

  it('allows a body of exactly 2000 characters and refuses 2001', () => {
    expect(accepted('s\n\n' + 'b'.repeat(COMMIT_BODY_MAX)).body).toHaveLength(COMMIT_BODY_MAX);
    expect(refused('s\n\n' + 'b'.repeat(COMMIT_BODY_MAX + 1))).toBe('body-too-long');
    expect(refused('s\n\n' + '\u{1F600}'.repeat(COMMIT_BODY_MAX + 1))).toBe('body-too-long');
  });

  it('measures the cleaned text: removed characters do not count', () => {
    expect(
      accepted('a'.repeat(COMMIT_SUBJECT_MAX) + '\u0007\u{202e}\u{200b}').subject,
    ).toHaveLength(COMMIT_SUBJECT_MAX);
  });

  it('refuses a NUL anywhere, in the subject or in the body', () => {
    expect(refused('a\0b')).toBe('contains-nul');
    expect(refused('subject\n\nbody\0')).toBe('contains-nul');
    expect(refused('\0')).toBe('contains-nul');
  });
});

describe('parseUserCommitMessage: cleaning', () => {
  it('normalises every kind of line break to a line feed', () => {
    expect(accepted('s\r\n\r\na\rb\u0085c\u{2028}d\u{2029}e').body).toBe('a\nb\nc\nd\ne');
    expect(accepted('s\r\n\r\nx').body).toBe('x');
  });

  it('removes control characters, DEL, C1 controls, bidi and zero-width formatting and the BOM', () => {
    const noise =
      '\u0001\u0007\u001B\u000B\u000C\u007F\u009F\u{200b}\u{200e}\u{202a}\u{202e}\u{2060}\u{2066}\u{2069}\u{feff}';
    expect(accepted('a' + noise + 'b').subject).toBe('ab');
    expect(accepted('s\n\nx' + noise + 'y').body).toBe('xy');
    // ESC sequences lose their ESC and stay inert text.
    expect(accepted('\u001B[31mred\u001B[0m').subject).toBe('[31mred[0m');
  });

  it('removes unpaired surrogate halves and keeps pairs', () => {
    expect(accepted('a\uD800b\uDC00c\u{1F600}').subject).toBe('abc\u{1F600}');
  });

  it('cannot hide a second subject line: the first line is the subject, whatever follows', () => {
    expect(accepted('one\u{2028}two')).toEqual({ subject: 'one', body: 'two' });
    expect(accepted('one\u0085two')).toEqual({ subject: 'one', body: 'two' });
  });
});

describe('trailer neutralisation', () => {
  const lines = [
    'Nevo-Operation: 11111111-1111-4111-8111-111111111111',
    'Nevo-Kind: manual-commit',
    'Nevo-Action: manual-commit',
    'Nevo-Scope: all',
    'Nevo-Spec: x',
    'Nevo-Documents: a.md',
    'Nevo-Coalesced: a',
    'nevo-operation: lowercase',
    'NEVO-OPERATION: upper',
    'Nevo-Operation : space before the colon',
    'Nevo-Operation:no space',
    '   Nevo-Operation: indented',
    '\tNevo-Operation: tab-indented',
  ];

  it.each(lines)('quotes %j in the body', (line) => {
    const { body } = accepted('Subject\n\nfirst\n' + line + '\nlast');
    expect(body.split('\n')[1]).toBe('> ' + line.trimStart());
    for (const out of body.split('\n')) {
      expect(/^\s*Nevo-[A-Za-z]+\s*:/iu.test(out)).toBe(false);
    }
  });

  it.each(lines)('quotes %j as the subject', (line) => {
    const parsed = parseUserCommitMessage(line);
    if (!parsed.ok) {
      throw new Error('refused');
    }

    expect(parsed.message.subject.toLowerCase().startsWith('> nevo-')).toBe(true);
  });

  it('quotes a trailer line created by a line break variant or after a removed character', () => {
    expect(accepted('s\n\nx\rNevo-Operation: y').body).toBe('x\n> Nevo-Operation: y');
    expect(accepted('s\n\nx\u{2028}Nevo-Operation: y').body).toBe('x\n> Nevo-Operation: y');
    expect(accepted('s\n\n\u{200b}Nevo-Operation: y').body).toBe('> Nevo-Operation: y');
    expect(accepted('s\n\nNevo\u0007-Operation: y').body).toBe('> Nevo-Operation: y');
  });

  it('leaves text that merely mentions the word, and lines that are already quotes', () => {
    expect(accepted('s\n\nSee Nevo-Operation: in the log').body).toBe(
      'See Nevo-Operation: in the log',
    );
    expect(accepted('s\n\n> Nevo-Operation: quoted').body).toBe('> Nevo-Operation: quoted');
    expect(accepted('s\n\nNevo: not a trailer key').body).toBe('Nevo: not a trailer key');
  });

  it('is idempotent', () => {
    const once = neutralizeTrailerLikeLines('a\nNevo-Operation: x\n  Nevo-Kind: y');
    expect(once).toBe('a\n> Nevo-Operation: x\n> Nevo-Kind: y');
    expect(neutralizeTrailerLikeLines(once)).toBe(once);
  });

  it('survives very long lines and many injected trailer lines', () => {
    const many = Array.from({ length: 50 }, () => 'Nevo-Operation: x').join('\n');
    const { body } = accepted('s\n\n' + many);
    expect(body.split('\n')).toHaveLength(50);
    expect(body.split('\n').every((line) => line.startsWith('> '))).toBe(true);
    const long = 'Nevo-Operation: ' + 'x'.repeat(1900);
    expect(accepted('s\n\n' + long).body.startsWith('> Nevo-Operation: ')).toBe(true);
  });
});

describe('what the commit port writes', () => {
  it('cleans and neutralises a body it was handed without validation', () => {
    expect(commitBodyForGit('a\r\nNevo-Operation: x\u0000\u0007\n\n')).toBe(
      'a\n> Nevo-Operation: x',
    );
    expect(commitBodyForGit('')).toBe('');
  });

  it('bounds a body to twice the documented length', () => {
    expect(Array.from(commitBodyForGit('b'.repeat(COMMIT_BODY_MAX * 3)))).toHaveLength(
      COMMIT_BODY_MAX * 2,
    );
  });

  it('writes the subject as one bounded, neutralised line', () => {
    expect(commitSubjectForGit('a\nb\r\nc\td\0e', 100)).toBe('a b c de');
    expect(commitSubjectForGit('Nevo-Operation: x', 100)).toBe('> Nevo-Operation: x');
    expect(Array.from(commitSubjectForGit('x'.repeat(500), 100))).toHaveLength(100);
    expect(commitSubjectForGit('\u0000\u0007', 100)).toBe('');
  });
});
