import type { FigmaComponentDefinition, FigmaSlotDefinition } from '../ir/ir';
import type { DesignValue } from '../ir/types';
import type { AssetRef } from './resources';
import type { NoDesignValues, VariantAxes, VariantSelection } from './types';

type AxisProperty<Value> = Extract<Value, string | number>;

type AssetRefForAxisValue<Axis extends string, Value extends DesignValue> = AssetRef<
  string,
  Record<Axis, Value>
>;

type AssetRefForAxis<Axis extends string> = AssetRef<string, Record<Axis, DesignValue>>;

export type AssetSwapSlotFor<Axes extends VariantAxes> = {
  [Axis in keyof Axes & string]: {
    kind: 'asset-swap';
    propertyName: string;
    required?: boolean;
    variantProperty: Axis;
  } & (
    | {
        allowAssetValueRemap: true;
        defaultAssetRefs: Record<AxisProperty<Axes[Axis][number]>, AssetRefForAxis<Axis>>;
      }
    | {
        allowAssetValueRemap?: false;
        defaultAssetRefs: {
          [Value in AxisProperty<Axes[Axis][number]>]: AssetRefForAxisValue<Axis, Value>;
        };
      }
  );
}[keyof Axes & string];

export type DesignSlotFor<Axes extends VariantAxes> =
  Exclude<FigmaSlotDefinition, { kind: 'asset-swap' }> | AssetSwapSlotFor<Axes>;

export interface ComponentAuthoringDefinition<
  Id extends string = string,
  Axes extends VariantAxes = VariantAxes,
  Slots extends Record<string, DesignSlotFor<Axes>> = Record<string, DesignSlotFor<Axes>>,
> extends Omit<
  FigmaComponentDefinition<VariantSelection<Axes>>,
  'component' | 'variantProperties' | 'propertyValues' | 'defaultProperties' | 'slots'
> {
  component: Id;
  variantProperties: (keyof Axes & string)[];
  propertyValues: Axes;
  defaultProperties?: Partial<VariantSelection<Axes>>;
  slots: Slots;
}

export interface AnyComponentAuthoringDefinition {
  component: string;
  propertyValues: VariantAxes;
  slots: Record<string, FigmaSlotDefinition & { allowAssetValueRemap?: boolean }>;
}

/**
 * Resolves project-facing authoring metadata into the implementation-neutral
 * definition transported through IR. Remap permission is compile-time policy;
 * consumers only need the final asset reference for each axis value.
 */
export function compileDesignDefinition(
  definition: AnyComponentAuthoringDefinition,
): FigmaComponentDefinition {
  const slots: Record<string, FigmaSlotDefinition> = {};
  for (const [name, slot] of Object.entries(definition.slots)) {
    if (slot.kind !== 'asset-swap') {
      slots[name] = slot;
      continue;
    }
    const { allowAssetValueRemap: _authoringOnly, ...resolvedSlot } = slot;
    slots[name] = resolvedSlot;
  }

  return {
    ...definition,
    slots,
  } as FigmaComponentDefinition;
}

export type ComponentId<Definitions extends readonly AnyComponentAuthoringDefinition[]> =
  Definitions[number]['component'];

type ComponentDefinitionFor<
  Definitions extends readonly AnyComponentAuthoringDefinition[],
  Id extends ComponentId<Definitions>,
> = Extract<Definitions[number], { component: Id }>;

type ComponentAxes<Definition extends AnyComponentAuthoringDefinition> =
  Definition['propertyValues'];

export type ComponentCaptureRegistry<
  Definitions extends readonly AnyComponentAuthoringDefinition[],
> = {
  [Definition in Definitions[number] as Definition['component']]: VariantSelection<
    Definition['propertyValues']
  >;
};

export type ComponentSlotRegistry<Definitions extends readonly AnyComponentAuthoringDefinition[]> =
  {
    [Definition in Definitions[number] as Definition['component']]: keyof Definition['slots'] &
      string;
  };

type DefineDesignComponentInput<
  Id extends string,
  Axes extends VariantAxes,
  Slots extends Record<string, DesignSlotFor<Axes>>,
> = Omit<
  ComponentAuthoringDefinition<Id, Axes, Slots>,
  'variantProperties' | 'propertyValues' | 'defaultProperties'
> & {
  variants: Axes;
  defaults?: Partial<VariantSelection<Axes>>;
};

/**
 * Typed project-facing definition helper. It derives the broad canonical IR
 * fields while preserving literal component, variant and slot contracts.
 */
export function defineDesignComponent<
  const Id extends string,
  const Axes extends VariantAxes,
  const Slots extends Record<string, DesignSlotFor<Axes>>,
>(
  input: DefineDesignComponentInput<Id, Axes, Slots>,
): ComponentAuthoringDefinition<Id, Axes, Slots> &
  Omit<DefineDesignComponentInput<Id, Axes, Slots>, 'variants' | 'defaults'> {
  const {
    component,
    displayName,
    description,
    target,
    order,
    variants,
    defaults,
    slots,
    bindings,
    figma,
  } = input;
  return {
    component,
    ...(displayName === undefined ? {} : { displayName }),
    ...(description === undefined ? {} : { description }),
    ...(target === undefined ? {} : { target }),
    order,
    variantProperties: Object.keys(variants),
    propertyValues: variants,
    defaultProperties: defaults,
    slots,
    ...(bindings === undefined ? {} : { bindings }),
    ...(figma === undefined ? {} : { figma }),
  };
}

export function defineDesignSystem<
  const Definitions extends readonly AnyComponentAuthoringDefinition[],
>(definitions: Definitions) {
  return definitions;
}

export function createComponentAuthoring<
  const Definitions extends readonly AnyComponentAuthoringDefinition[],
>(definitions: Definitions) {
  const componentIds = new Set(definitions.map((definition) => definition.component));

  const componentRef = <
    Id extends ComponentId<Definitions>,
    const Properties extends VariantSelection<
      ComponentAxes<ComponentDefinitionFor<Definitions, Id>>
    >,
  >(
    component: Id,
    properties: Properties &
      Record<
        Exclude<
          keyof Properties,
          keyof VariantSelection<ComponentAxes<ComponentDefinitionFor<Definitions, Id>>>
        >,
        never
      >,
  ) => {
    if (!componentIds.has(component)) throw new Error(`Unknown design component ${component}`);
    return { componentRef: component, properties };
  };
  const slot = <
    Id extends ComponentId<Definitions>,
    Slot extends keyof ComponentDefinitionFor<Definitions, Id>['slots'] & string,
  >(
    component: Id,
    slotName: Slot,
  ) => {
    if (!componentIds.has(component)) throw new Error(`Unknown design component ${component}`);
    return slotName;
  };
  const variantProperty = <
    Id extends ComponentId<Definitions>,
    Axis extends keyof ComponentAxes<ComponentDefinitionFor<Definitions, Id>> & string,
  >(
    component: Id,
    axis: Axis,
  ) => {
    if (!componentIds.has(component)) throw new Error(`Unknown design component ${component}`);
    return axis;
  };

  return { componentRef, slot, variantProperty };
}

export type EmptyComponentProperties = NoDesignValues;
