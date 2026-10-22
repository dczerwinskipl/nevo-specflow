import { describe, expect, it } from 'vitest';

import { prefersRespondAsync } from './respond-async';

describe('prefersRespondAsync (RFC 7240)', () => {
  it.each([
    ['respond-async', true],
    ['Respond-Async', true],
    ['return=minimal, respond-async; wait=10', true],
    ['  respond-async ;wait=1', true],
    ['wait=10', false],
    ['respond-asynchronously', false],
    ['return=respond-async', false],
    ['', false],
  ])('%j -> %s', (header, expected) => {
    expect(prefersRespondAsync(header)).toBe(expected);
  });

  it('handles absent and repeated headers', () => {
    expect(prefersRespondAsync(undefined)).toBe(false);
    expect(prefersRespondAsync(['return=minimal', 'respond-async'])).toBe(true);
  });
});
