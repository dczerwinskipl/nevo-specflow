export function defineDesignResource(definition) {
    return definition;
}
export function defineResourceRegistry(...definitions) {
    return definitions;
}
export function createResourceAuthoring(definitions) {
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
    function serialize(kind, id, properties) {
        const definition = definitionsById.get(id);
        if (!definition || definition.kind !== kind)
            throw new Error(`Unknown ${kind} resource ${id}`);
        return [id, ...Object.keys(definition.variants).map((axis) => String(properties[axis]))].join('/');
    }
    return {
        assetRef(id, properties) {
            return serialize('asset', id, properties);
        },
        textStyleRef(id, properties) {
            return serialize('text-style', id, properties);
        },
        resourceSetRef(id) {
            if (!definitionsById.has(id))
                throw new Error(`Unknown design resource ${id}`);
            return `${id}/set`;
        },
    };
}
//# sourceMappingURL=resources.js.map