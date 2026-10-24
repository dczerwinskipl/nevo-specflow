import { describe, expect, it } from 'vitest';

import {
  classifyCreateJournalText,
  isExpiredUnsupportedJournal,
  unsupportedJournalError,
} from './unsupported';

describe('unsupported Create journals', () => {
  it('classifies the current version as current and reads nothing else', () => {
    expect(classifyCreateJournalText('{"version":2,"anything":"else"}')).toEqual({
      kind: 'current',
      value: { version: 2, anything: 'else' },
    });
  });

  it.each([
    ['an older version', '{"version":1,"files":[1,2]}'],
    ['a newer version', '{"version":3}'],
    ['a string version', '{"version":"2"}'],
    ['no version', '{"operationId":"x"}'],
    ['invalid JSON', '{not json'],
    ['a truncated file', '{"version":2,"stage":'],
    ['an empty file', ''],
    ['an array', '[2]'],
    ['null', 'null'],
    ['a number', '2'],
  ])('classifies %s as unsupported', (_name, text) => {
    expect(classifyCreateJournalText(text)).toEqual({ kind: 'unsupported' });
  });

  it('answers by id with its own code, distinct from the corrupt code', () => {
    const error = unsupportedJournalError();
    expect(error.code).toBe('CREATE_JOURNAL_UNSUPPORTED');
    expect(error.code).not.toBe('CREATE_JOURNAL_CORRUPT');
    expect(error.message).not.toMatch(/[A-Za-z]:\\|\//u);
  });

  it('is swept only once it is as old as the retention (injected clock)', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 9, 24);
    expect(isExpiredUnsupportedJournal(now - 6 * day, now, 7 * day)).toBe(false);
    expect(isExpiredUnsupportedJournal(now - 7 * day, now, 7 * day)).toBe(true);
    expect(isExpiredUnsupportedJournal(now - 30 * day, now, 7 * day)).toBe(true);
  });
});
