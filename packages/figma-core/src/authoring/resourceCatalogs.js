export function defineResourceCatalog(catalog) {
    return catalog;
}
export function defineResourceCatalogs(...catalogs) {
    return catalogs;
}
export function resourceCatalogsOfKind(catalogs, kind) {
    return catalogs.filter((catalog) => catalog.kind === kind);
}
export function catalogItem(catalog, resourceRef) {
    return catalog.items.find((item) => item.resourceRef === resourceRef);
}
export function catalogVariantName(catalog, item) {
    return `${catalog.columnAxis.name}=${item.column}, ${catalog.rowAxis.name}=${item.row}`;
}
//# sourceMappingURL=resourceCatalogs.js.map