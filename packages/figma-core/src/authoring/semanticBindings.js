const utilityPrefixes = {
    background: 'bg-',
    border: 'border-',
    content: 'text-',
};
function classTokens(value) {
    if (typeof value === 'string')
        return value.split(/\s+/).filter(Boolean);
    if (Array.isArray(value))
        return value.flatMap(classTokens);
    return [];
}
function inferredToken(classValue, target, tokens) {
    const prefix = utilityPrefixes[target];
    const candidates = classTokens(classValue)
        .filter((className) => !className.includes(':') && className.startsWith(prefix))
        .map((className) => className.slice(prefix.length).split('/')[0])
        .map((name) => tokens.find((token) => token.cssVariable === `--color-${name}`)?.stableId)
        .filter((stableId) => Boolean(stableId));
    return candidates.at(-1);
}
/** Infer the one variant axis that owns each semantic color target. */
export function inferRecipeSemanticColorBindings(recipe, tokens, overrides = {}) {
    const properties = (recipe.variantKeys ?? []).map(String);
    const result = {};
    for (const target of Object.keys(utilityPrefixes)) {
        for (const property of properties) {
            const variants = recipe.variants[property];
            if (!variants)
                continue;
            const values = Object.fromEntries(Object.entries(variants).flatMap(([variant, classValue]) => {
                const token = overrides[target]?.[variant] ?? inferredToken(classValue, target, tokens);
                return token ? [[variant, token]] : [];
            }));
            const baseToken = inferredToken(recipe.base, target, tokens);
            if (baseToken) {
                for (const variant of Object.keys(variants))
                    values[variant] ??= baseToken;
            }
            if (Object.keys(values).length) {
                result[target] = { property, values };
                break;
            }
        }
    }
    return result;
}
//# sourceMappingURL=semanticBindings.js.map