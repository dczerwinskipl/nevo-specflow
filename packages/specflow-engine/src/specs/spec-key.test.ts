import { describe, expect, it } from 'vitest';

import { isSpecKey, nextSpecKey, specKeyNumber } from './spec-key';

describe('Specification keys', () => {
  it('starts at nevo-1 and takes one more than the highest key of the project', () => {
    expect(nextSpecKey([])).toBe('nevo-1');
    expect(nextSpecKey([undefined, undefined])).toBe('nevo-1');
    expect(nextSpecKey(['nevo-3', undefined, 'nevo-12', 'nevo-7'])).toBe('nevo-13');
  });

  it('ignores keys of another prefix when counting, but accepts them in a manifest', () => {
    expect(nextSpecKey(['ui-900', 'nevo-2'])).toBe('nevo-3');
    expect(specKeyNumber('ui-900')).toBeUndefined();
    expect(isSpecKey('ui-900')).toBe(true);
  });

  it('accepts only <prefix>-<number> without a leading zero', () => {
    for (const key of ['nevo-1', 'nevo-1234', 'ab1-7']) expect(isSpecKey(key)).toBe(true);
    for (const key of ['nevo-0', 'nevo-01', 'Nevo-1', 'nevo', '-1', 'nevo-1a', 'nevo 1', 7]) {
      expect(isSpecKey(key)).toBe(false);
    }
  });
});
