import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { AuthorizationScopeSchema } from './index';

describe('authorization contracts', () => {
  it('accepts scope values containing non-whitespace content', () => {
    expect(Value.Check(AuthorizationScopeSchema, { specId: 'S1' })).toBe(true);
    expect(Value.Check(AuthorizationScopeSchema, { specId: ' S1 ' })).toBe(true);
  });

  it.each(['', '   '])('rejects empty scope values: %j', (value) => {
    expect(Value.Check(AuthorizationScopeSchema, { specId: value })).toBe(false);
  });

  it('rejects unsafe scope dimension names', () => {
    const prototypeSensitiveKey = ['__', 'proto__'].join('');
    expect(
      Value.Check(AuthorizationScopeSchema, Object.fromEntries([[prototypeSensitiveKey, 'value']])),
    ).toBe(false);
    expect(Value.Check(AuthorizationScopeSchema, { 'bad key': 'value' })).toBe(false);
  });
});
