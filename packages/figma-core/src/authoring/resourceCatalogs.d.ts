import type { AssetRef, ResourceKind, ResourceSetRef, TextStyleRef } from './resources';
type CatalogResourceRef<Kind extends ResourceKind> = Kind extends 'asset' ? AssetRef : TextStyleRef;
export interface ResourceCatalogItem {
    resourceRef: string;
    column: string;
    row: string;
    sample?: string;
}
export interface ResourceCatalogDefinition {
    kind: ResourceKind;
    setStableId: string;
    name: string;
    columnAxis: {
        name: string;
        values: readonly string[];
    };
    rowAxis: {
        name: string;
        values: readonly string[];
    };
    items: readonly ResourceCatalogItem[];
}
type ResourceCatalogInput<Kind extends ResourceKind> = Omit<ResourceCatalogDefinition, 'kind' | 'setStableId' | 'items'> & {
    kind: Kind;
    setStableId: ResourceSetRef;
    items: readonly (Omit<ResourceCatalogItem, 'resourceRef'> & {
        resourceRef: CatalogResourceRef<Kind>;
    })[];
};
export declare function defineResourceCatalog<const Kind extends ResourceKind>(catalog: ResourceCatalogInput<Kind>): ResourceCatalogDefinition;
export declare function defineResourceCatalogs<const Catalogs extends readonly ResourceCatalogDefinition[]>(...catalogs: Catalogs): Catalogs;
export declare function resourceCatalogsOfKind(catalogs: readonly ResourceCatalogDefinition[], kind: ResourceKind): ResourceCatalogDefinition[];
export declare function catalogItem(catalog: ResourceCatalogDefinition, resourceRef: string): ResourceCatalogItem | undefined;
export declare function catalogVariantName(catalog: ResourceCatalogDefinition, item: ResourceCatalogItem): string;
export {};
//# sourceMappingURL=resourceCatalogs.d.ts.map