import { colorTokens } from '../design-system/theme';
import {
  inferRecipeSemanticColorBindings,
  type BindingOverrides,
} from '@nevo/figma-core/authoring';
import type { DesignSlotFor } from '@nevo/figma-core/authoring';
import type { VariantAxes, VariantSelection } from '@nevo/figma-core/authoring';
import { getVariantContract, type VariantRecipe } from '@nevo/figma-core/authoring';
import type { FigmaComponentDefinition } from '@nevo/figma-core/ir';

type StringToBoolean<Value> = Value extends 'true' | 'false' ? boolean : Value;
type RecipeAxes<Recipe extends VariantRecipe> = {
  [Axis in keyof Recipe['variants'] & string]: readonly StringToBoolean<
    keyof Recipe['variants'][Axis] & string
  >[];
};
type MergeAxes<Left extends VariantAxes, Right extends VariantAxes> = Omit<Left, keyof Right> &
  Right;
type PropertyValues<Axes extends VariantAxes> = { [Axis in keyof Axes]: Axes[Axis] };

export type RecipeDesignSpec<
  Id extends string,
  Axes extends VariantAxes,
  Slots extends Record<string, DesignSlotFor<Axes>>,
> = Omit<
  FigmaComponentDefinition<VariantSelection<Axes>>,
  'component' | 'variantProperties' | 'propertyValues' | 'defaultProperties' | 'slots'
> & {
  component: Id;
  variantProperties: (keyof Axes & string)[];
  propertyValues: PropertyValues<Axes>;
  defaultProperties?: Partial<VariantSelection<Axes>>;
  slots: Slots;
};

interface RecipeDesignInput<
  Id extends string,
  Recipe extends VariantRecipe,
  Additional extends VariantAxes,
  Slots extends Record<string, DesignSlotFor<MergeAxes<RecipeAxes<Recipe>, Additional>>>,
> {
  component: Id;
  description?: string;
  recipe: Recipe;
  order: number;
  target?: 'component' | 'fragment' | 'screen';
  slots: Slots;
  additionalProperties?: Additional;
  additionalDefaults?: Partial<VariantSelection<Additional>>;
  bindingOverrides?: BindingOverrides;
  bindings?: FigmaComponentDefinition['bindings'];
  figma?: FigmaComponentDefinition['figma'];
}

/**
 * Materializes the generic extractor/Figma contract from a public recipe.
 * Component files only supply semantic anatomy and genuinely extra properties.
 */
export function defineRecipeDesign<
  const Id extends string,
  Recipe extends VariantRecipe,
  const Additional extends VariantAxes,
  const Slots extends Record<string, DesignSlotFor<MergeAxes<RecipeAxes<Recipe>, Additional>>>,
>(
  input: RecipeDesignInput<Id, Recipe, Additional, Slots>,
): RecipeDesignSpec<Id, MergeAxes<RecipeAxes<Recipe>, Additional>, Slots> {
  const derived = getVariantContract(input.recipe);
  const additionalProperties = input.additionalProperties ?? {};
  return {
    component: input.component,
    ...(input.description === undefined ? {} : { description: input.description }),
    target: input.target,
    order: input.order,
    variantProperties: [...derived.properties, ...Object.keys(additionalProperties)],
    propertyValues: { ...derived.values, ...additionalProperties },
    defaultProperties: { ...derived.defaults, ...input.additionalDefaults },
    slots: input.slots,
    bindings: {
      ...inferRecipeSemanticColorBindings(input.recipe, colorTokens, input.bindingOverrides),
      ...input.bindings,
    },
    ...(input.figma === undefined ? {} : { figma: input.figma }),
  } as RecipeDesignSpec<Id, MergeAxes<RecipeAxes<Recipe>, Additional>, Slots>;
}
