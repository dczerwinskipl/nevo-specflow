import { describe, expect, it } from 'vitest';
import { resolveSemanticTokenId } from './tokenResolution';

describe('semantic token resolution', () => {
  const tokens = [
    { stableId: 'Color/content-muted', name: 'Muted', value: 'rgb(120, 120, 120)' },
    { stableId: 'Color/border-subtle', name: 'Subtle border', value: 'rgb(120, 120, 120)' },
  ];

  it('binds the explicitly referenced Variable', () => {
    expect(resolveSemanticTokenId('Color/border-subtle', tokens[0]!.value, tokens)).toBe(
      'Color/border-subtle',
    );
  });

  it('keeps equal-valued semantic tokens distinguishable by identity', () => {
    expect(resolveSemanticTokenId('Color/content-muted', tokens[1]!.value, tokens)).toBe(
      'Color/content-muted',
    );
    expect(resolveSemanticTokenId('Color/border-subtle', tokens[0]!.value, tokens)).toBe(
      'Color/border-subtle',
    );
  });

  it('does not promote an equal raw CSS color to a semantic token', () => {
    expect(resolveSemanticTokenId(undefined, 'rgb(120, 120, 120)', tokens)).toBeUndefined();
  });
});
