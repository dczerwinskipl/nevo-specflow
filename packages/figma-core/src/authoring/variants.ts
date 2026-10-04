import type { DesignValue } from '../ir/types';

export type VariantRecipe = ((props?: Record<string, unknown>) => unknown) & {
  variants: Record<string, Record<string, unknown>>;
  variantKeys: PropertyKey[] | undefined;
  defaultVariants: Record<string, unknown>;
  base?: unknown;
};

function variantValue(value: string): DesignValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function objectKeys<const Value extends Record<string, unknown>>(value: Value) {
  return Object.keys(value) as (keyof Value & string)[];
}

type StringToBoolean<Value> = Value extends 'true' | 'false' ? boolean : Value;
export type RecipeVariantSelection<Recipe extends VariantRecipe> = {
  [Key in keyof Recipe['variants']]?: StringToBoolean<keyof Recipe['variants'][Key] & string>;
};

export function getVariantValues<
  Recipe extends VariantRecipe,
  Key extends keyof Recipe['variants'] & string,
>(recipe: Recipe, key: Key) {
  const variants = recipe.variants[key];
  if (!variants) return [];
  return objectKeys(variants).map(variantValue) as StringToBoolean<
    keyof Recipe['variants'][Key] & string
  >[];
}

export function getVariantContract(recipe: VariantRecipe) {
  const properties = (recipe.variantKeys ?? []).map(String);
  return {
    properties,
    values: Object.fromEntries(
      properties.map((property) => [property, getVariantValues(recipe, property) as DesignValue[]]),
    ) as Record<string, readonly DesignValue[]>,
    defaults: Object.fromEntries(
      properties.flatMap((property) => {
        const value = recipe.defaultVariants[property];
        return value === undefined ? [] : [[property, value as DesignValue]];
      }),
    ),
  };
}

export function variantCombinations<Recipe extends VariantRecipe>(recipe: Recipe) {
  const contract = getVariantContract(recipe);
  return contract.properties.reduce<Record<string, DesignValue>[]>(
    (combinations, property) =>
      combinations.flatMap((combination) =>
        (contract.values[property] ?? []).map((value) => ({ ...combination, [property]: value })),
      ),
    [{}],
  ) as unknown as RecipeVariantSelection<Recipe>[];
}
