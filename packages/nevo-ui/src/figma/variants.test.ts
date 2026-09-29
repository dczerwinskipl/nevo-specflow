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
      properties: ['variant', 'size'],
      values: {
        variant: ['primary', 'secondary', 'ghost', 'destructive'],
        size: ['sm', 'md'],
      },
      defaults: { variant: 'primary', size: 'md' },
    });
    expect(variantCombinations(buttonVariants)).toHaveLength(8);
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
