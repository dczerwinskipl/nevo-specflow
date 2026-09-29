import type { ColorTokenDefinition, DesignTokenBindings } from '../ir/types';
import type { VariantRecipe } from './variants';

type BindingTarget = 'background' | 'border' | 'content';
export type BindingOverrides = Partial<Record<BindingTarget, Record<string, string>>>;

const utilityPrefixes: Record<BindingTarget, string> = {
  background: 'bg-',
  border: 'border-',
  content: 'text-',
};

function classTokens(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(classTokens);
  return [];
}

function inferredToken(
  classValue: unknown,
  target: BindingTarget,
  tokens: readonly ColorTokenDefinition[],
) {
  const prefix = utilityPrefixes[target];
  const candidates = classTokens(classValue)
    .filter((className) => !className.includes(':') && className.startsWith(prefix))
    .map((className) => className.slice(prefix.length).split('/')[0])
    .map((name) => tokens.find((token) => token.cssVariable === `--color-${name}`)?.stableId)
    .filter((stableId): stableId is string => Boolean(stableId));
  return candidates.at(-1);
}

/** Infer the one variant axis that owns each semantic color target. */
export function inferRecipeSemanticColorBindings(
  recipe: VariantRecipe,
  tokens: readonly ColorTokenDefinition[],
  overrides: BindingOverrides = {},
): DesignTokenBindings {
  const properties = (recipe.variantKeys ?? []).map(String);
  const result: DesignTokenBindings = {};
  for (const target of Object.keys(utilityPrefixes) as BindingTarget[]) {
    for (const property of properties) {
      const variants = recipe.variants[property];
      if (!variants) continue;
      const values = Object.fromEntries(
        Object.entries(variants).flatMap(([variant, classValue]) => {
          const token = overrides[target]?.[variant] ?? inferredToken(classValue, target, tokens);
          return token ? [[variant, token]] : [];
        }),
      );
      const baseToken = inferredToken(recipe.base, target, tokens);
      if (baseToken) {
        for (const variant of Object.keys(variants)) values[variant] ??= baseToken;
      }
      if (Object.keys(values).length) {
        result[target] = { property, values };
        break;
      }
    }
  }
  return result;
}



