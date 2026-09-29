import { describe, expect, it } from 'vitest';
import { colorTokens } from '../design-system/theme';
import { designSpec as buttonDesignSpec } from '../components/actions/Button/Button.figma';
import { inferRecipeSemanticColorBindings } from '@nevo/figma-core/authoring';

describe('semantic Tailwind color bindings', () => {
  it('keeps the generated Button bindings equivalent to the explicit PoC mapping', () => {
    expect(buttonDesignSpec.bindings).toEqual({
      background: {
        property: 'variant',
        values: {
          primary: 'Color/action-primary',
          secondary: 'Color/action-secondary',
        },
      },
      border: {
        property: 'variant',
        values: {
          secondary: 'Color/border-default',
          destructive: 'Color/action-danger',
        },
      },
      content: {
        property: 'variant',
        values: {
          primary: 'Color/on-primary',
          secondary: 'Color/content-secondary',
          ghost: 'Color/content-muted',
          destructive: 'Color/action-danger',
        },
      },
    });
  });

  it('derives base semantic bindings for every value of a recipe axis', () => {
    const recipe = Object.assign(() => '', {
      base: 'border-border-default bg-action-secondary text-content-primary',
      variants: { size: { sm: 'p-2', md: 'p-4' } },
      variantKeys: ['size'],
      defaultVariants: { size: 'md' },
    });
    expect(inferRecipeSemanticColorBindings(recipe, colorTokens)).toEqual({
      background: {
        property: 'size',
        values: { sm: 'Color/action-secondary', md: 'Color/action-secondary' },
      },
      border: {
        property: 'size',
        values: { sm: 'Color/border-default', md: 'Color/border-default' },
      },
      content: {
        property: 'size',
        values: { sm: 'Color/content-primary', md: 'Color/content-primary' },
      },
    });
  });

  it('keeps an explicit escape hatch for a genuinely ambiguous utility', () => {
    const recipe = Object.assign(() => '', {
      variants: { tone: { normal: '', danger: 'border-content-error/40' } },
      variantKeys: ['tone'],
      defaultVariants: { tone: 'normal' },
    });
    expect(
      inferRecipeSemanticColorBindings(recipe, colorTokens, {
        border: { danger: 'Color/border-error' },
      }).border,
    ).toEqual({ property: 'tone', values: { danger: 'Color/border-error' } });
  });
});



