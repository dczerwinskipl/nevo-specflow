function variantValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return value;
}
export function objectKeys(value) {
    return Object.keys(value);
}
export function getVariantValues(recipe, key) {
    const variants = recipe.variants[key];
    if (!variants)
        return [];
    return objectKeys(variants).map(variantValue);
}
export function getVariantContract(recipe) {
    const properties = (recipe.variantKeys ?? []).map(String);
    return {
        properties,
        values: Object.fromEntries(properties.map((property) => [property, getVariantValues(recipe, property)])),
        defaults: Object.fromEntries(properties.flatMap((property) => {
            const value = recipe.defaultVariants[property];
            return value === undefined ? [] : [[property, value]];
        })),
    };
}
export function variantCombinations(recipe) {
    const contract = getVariantContract(recipe);
    return contract.properties.reduce((combinations, property) => combinations.flatMap((combination) => (contract.values[property] ?? []).map((value) => ({ ...combination, [property]: value }))), [{}]);
}
//# sourceMappingURL=variants.js.map