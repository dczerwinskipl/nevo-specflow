import { describe, expect, it } from 'vitest';
import { tv } from 'tailwind-variants/lite';
import { buttonVariants } from '../components';
import {
  getVariantContract,
  getVariantValues,
  variantCombinations,
} from '@nevo/figma-core/authoring';

describe('Tailwind Variants metadata derivation', () => {
  it('derives Button axes, allowed values and defaults from the recipe', () => {
    expect(getVariantContract(buttonVariants)).toEqual({
      properties: ['variant', 'size', 'width'],
      values: {
        variant: ['primary', 'secondary', 'ghost', 'destructive'],
        size: ['sm', 'md'],
        width: ['content', 'full'],
      },
      defaults: { variant: 'primary', size: 'md', width: 'content' },
    });
    expect(variantCombinations(buttonVariants)).toHaveLength(16);
  });

  it('derives a unique Button capture identity from every recipe axis', () => {
    const ids = variantCombinations(buttonVariants).flatMap(({ variant, size, width }) => {
      const base = `${variant}-${size}-${width}`;
      return [base, `${base}-disabled`];
    });

    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('primary-md-content');
    expect(ids).toContain('primary-md-full');
  });

  it('sees a newly added variant without another options list', () => {
    const extended = tv({
      variants: { tone: { neutral: '', positive: '', warning: '' } },
      defaultVariants: { tone: 'neutral' },
    });
    expect(getVariantValues(extended, 'tone')).toEqual(['neutral', 'positive', 'warning']);
    expect(variantCombinations(extended)).toHaveLength(3);
  });
});
