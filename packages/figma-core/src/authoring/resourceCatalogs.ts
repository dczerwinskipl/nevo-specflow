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
  columnAxis: { name: string; values: readonly string[] };
  rowAxis: { name: string; values: readonly string[] };
  items: readonly ResourceCatalogItem[];
}

type ResourceCatalogInput<Kind extends ResourceKind> = Omit<
  ResourceCatalogDefinition,
  'kind' | 'setStableId' | 'items'
> & {
  kind: Kind;
  setStableId: ResourceSetRef;
  items: readonly (Omit<ResourceCatalogItem, 'resourceRef'> & {
    resourceRef: CatalogResourceRef<Kind>;
  })[];
};

export function defineResourceCatalog<const Kind extends ResourceKind>(
  catalog: ResourceCatalogInput<Kind>,
): ResourceCatalogDefinition {
  return catalog;
}

export function defineResourceCatalogs<const Catalogs extends readonly ResourceCatalogDefinition[]>(
  ...catalogs: Catalogs
): Catalogs {
  return catalogs;
}

export function resourceCatalogsOfKind(
  catalogs: readonly ResourceCatalogDefinition[],
  kind: ResourceKind,
) {
  return catalogs.filter((catalog) => catalog.kind === kind);
}

export function catalogItem(catalog: ResourceCatalogDefinition, resourceRef: string) {
  return catalog.items.find((item) => item.resourceRef === resourceRef);
}

export function catalogVariantName(catalog: ResourceCatalogDefinition, item: ResourceCatalogItem) {
  return `${catalog.columnAxis.name}=${item.column}, ${catalog.rowAxis.name}=${item.row}`;
}

