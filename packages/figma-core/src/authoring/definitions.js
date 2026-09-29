/**
 * Resolves project-facing authoring metadata into the implementation-neutral
 * definition transported through IR. Remap permission is compile-time policy;
 * consumers only need the final asset reference for each axis value.
 */
export function compileDesignDefinition(definition) {
    return {
        ...definition,
        slots: Object.fromEntries(Object.entries(definition.slots).map(([name, slot]) => {
            if (slot.kind !== 'asset-swap')
                return [name, slot];
            const { allowAssetValueRemap: _authoringOnly, ...resolvedSlot } = slot;
            return [name, resolvedSlot];
        })),
    };
}
/**
 * Typed project-facing definition helper. It derives the broad canonical IR
 * fields while preserving literal component, variant and slot contracts.
 */
export function defineDesignComponent(input) {
    const { component, displayName, description, target, order, variants, defaults, slots, bindings, figma, } = input;
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
export function defineDesignSystem(definitions) {
    return definitions;
}
export function createComponentAuthoring(definitions) {
    const componentIds = new Set(definitions.map((definition) => definition.component));
    return {
        componentRef(component, properties) {
            if (!componentIds.has(component))
                throw new Error(`Unknown design component ${component}`);
            return { componentRef: component, properties };
        },
        slot(component, slot) {
            if (!componentIds.has(component))
                throw new Error(`Unknown design component ${component}`);
            return slot;
        },
        variantProperty(component, axis) {
            if (!componentIds.has(component))
                throw new Error(`Unknown design component ${component}`);
            return axis;
        },
    };
}
//# sourceMappingURL=definitions.js.map