import { describe, expect, it } from 'vitest';
import {
  docsReaderSearch,
  docsReaderSearchString,
  readerSearchFromString,
  readerSearchMaxLength,
  validateDocsReaderSearch,
} from './readerSearch';

describe('reader search address', () => {
  it('keeps a trimmed text and proposals=1, and drops everything else', () => {
    expect(validateDocsReaderSearch({ q: '  session  ', proposals: 1 })).toEqual({
      q: 'session',
      proposals: 1,
    });
    expect(validateDocsReaderSearch({ q: '2026', proposals: '1' })).toEqual({
      q: '2026',
      proposals: 1,
    });
    // The default parser reads `?q=2026` as a number.
    expect(validateDocsReaderSearch({ q: 2026 })).toEqual({ q: '2026' });
    expect(validateDocsReaderSearch({ q: '   ', proposals: 0, other: 'x' })).toEqual({});
    expect(validateDocsReaderSearch({ q: { a: 1 }, proposals: true })).toEqual({});
    expect(validateDocsReaderSearch({})).toEqual({});
  });

  it('cuts a text longer than the field takes', () => {
    const q = validateDocsReaderSearch({ q: 'x'.repeat(readerSearchMaxLength + 20) }).q;
    expect(q).toHaveLength(readerSearchMaxLength);
  });

  it('builds the search of the field and the checkbox', () => {
    expect(docsReaderSearch(' a b ', false)).toEqual({ q: 'a b' });
    expect(docsReaderSearch('', true)).toEqual({ proposals: 1 });
  });

  it('serialises the validated search of an address for a link, round-tripping the text', () => {
    expect(docsReaderSearchString('')).toBe('');
    expect(docsReaderSearchString('?other=x&proposals=2')).toBe('');
    expect(docsReaderSearchString('?q=session%20limit&proposals=1&other=x')).toBe(
      '?q=session+limit&proposals=1',
    );
    // A numeric text stays a text when it is read back.
    const numeric = docsReaderSearchString('?q=%222026%22');
    expect(numeric).toBe('?q=%222026%22');
  });

  it('reads the raw text of an address, never a number the default parser made of it', () => {
    expect(readerSearchFromString('?q=1.0')).toEqual({ q: '1.0' });
    expect(readerSearchFromString('?q=12345678901234567890')).toEqual({
      q: '12345678901234567890',
    });
    // What the router writes for such a text: JSON-quoted.
    expect(readerSearchFromString('?q=%221.0%22&proposals=1')).toEqual({ q: '1.0', proposals: 1 });
    expect(readerSearchFromString('?q=session+limit')).toEqual({ q: 'session limit' });
    expect(readerSearchFromString('?q=%20%20&proposals=2')).toEqual({});
  });
});
