import type { DesignValue } from '../ir/types';
export type VariantRecipe = ((props?: Record<string, unknown>) => unknown) & {
    variants: Record<string, Record<string, unknown>>;
    variantKeys: Array<PropertyKey> | undefined;
    defaultVariants: Record<string, unknown>;
    base?: unknown;
};
export declare function objectKeys<const Value extends Record<string, unknown>>(value: Value): Array<keyof Value & string>;
type StringToBoolean<Value> = Value extends 'true' | 'false' ? boolean : Value;
export type RecipeVariantSelection<Recipe extends VariantRecipe> = {
    [Key in keyof Recipe['variants']]?: StringToBoolean<keyof Recipe['variants'][Key] & string>;
};
export declare function getVariantValues<Recipe extends VariantRecipe, Key extends keyof Recipe['variants'] & string>(recipe: Recipe, key: Key): StringToBoolean<keyof Recipe["variants"][Key] & string>[];
export declare function getVariantContract(recipe: VariantRecipe): {
    properties: string[];
    values: Record<string, readonly DesignValue[]>;
    defaults: {
        [k: string]: DesignValue;
    };
};
export declare function variantCombinations<Recipe extends VariantRecipe>(recipe: Recipe): Array<RecipeVariantSelection<Recipe>>;
export {};
//# sourceMappingURL=variants.d.ts.map