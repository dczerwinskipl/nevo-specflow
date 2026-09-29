import type { ColorTokenDefinition, DesignTokenBindings } from '../ir/types';
import type { VariantRecipe } from './variants';
type BindingTarget = 'background' | 'border' | 'content';
export type BindingOverrides = Partial<Record<BindingTarget, Record<string, string>>>;
/** Infer the one variant axis that owns each semantic color target. */
export declare function inferRecipeSemanticColorBindings(recipe: VariantRecipe, tokens: readonly ColorTokenDefinition[], overrides?: BindingOverrides): DesignTokenBindings;
export {};
//# sourceMappingURL=semanticBindings.d.ts.map