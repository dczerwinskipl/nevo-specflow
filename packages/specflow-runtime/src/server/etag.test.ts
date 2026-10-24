import { describe, expect, it } from 'vitest';

import { matchesEtag } from './etag';

describe('matchesEtag', () => {
  it('matches a listed tag weakly and the wildcard', () => {
    expect(matchesEtag('"a", W/"b"', '"b"')).toBe(true);
    expect(matchesEtag('*', '"a"')).toBe(true);
    expect(matchesEtag('"x"', '"a"')).toBe(false);
  });

  it('matches against a weak current tag', () => {
    expect(matchesEtag('"b"', 'W/"b"')).toBe(true);
    expect(matchesEtag('W/"b"', 'W/"b"')).toBe(true);
  });

  it('joins repeated header lines and treats a missing header as no match', () => {
    expect(matchesEtag(['"x"', 'W/"a"'], '"a"')).toBe(true);
    expect(matchesEtag(['"x"'], '"a"')).toBe(false);
    expect(matchesEtag(undefined, '"a"')).toBe(false);
    expect(matchesEtag('', '"a"')).toBe(false);
  });
});
