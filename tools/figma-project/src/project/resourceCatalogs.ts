import {
  assetRef,
  iconResource,
  nevoMarkAssetResource,
  resourceSetRef,
  textStyleRef,
  typographyResource,
} from './resources';
import { defineResourceCatalog, defineResourceCatalogs } from '@nevo/figma-core/authoring';

/**
 * Project-owned catalogue metadata. None of these axes or samples are part of
 * the canonical text-style/asset resource contract.
 */
const typographySample = 'The quick brown fox jumps over the lazy dog.';

const iconCatalogItems = iconResource.variants.name.flatMap((name) =>
  iconResource.variants.size.map((size) => ({
    resourceRef: assetRef('Icon', { name, size }),
    column: name,
    row: size,
  })),
);

const nevoMarkCatalogItems = nevoMarkAssetResource.variants.variant.map((variant) => ({
  resourceRef: assetRef('NevoMarkAsset', { variant }),
  column: variant,
  row: 'mark',
}));

const typographyCatalogItems = typographyResource.variants.variant.map((variant) => {
  const separator = variant.lastIndexOf('-');
  return {
    resourceRef: textStyleRef('Typography', { variant }),
    column: variant.slice(0, separator),
    row: variant.slice(separator + 1),
    sample: typographySample,
  };
});

export const projectResourceCatalogs = defineResourceCatalogs(
  defineResourceCatalog({
    kind: 'asset',
    setStableId: resourceSetRef('Icon'),
    name: 'Icon',
    columnAxis: {
      name: 'Name',
      values: iconResource.variants.name,
    },
    rowAxis: { name: 'Size', values: iconResource.variants.size },
    items: iconCatalogItems,
  }),
  defineResourceCatalog({
    kind: 'asset',
    setStableId: resourceSetRef('NevoMarkAsset'),
    name: 'Nevo mark',
    columnAxis: {
      name: 'Variant',
      values: nevoMarkAssetResource.variants.variant,
    },
    rowAxis: { name: 'Asset', values: ['mark'] },
    items: nevoMarkCatalogItems,
  }),
  defineResourceCatalog({
    kind: 'text-style',
    setStableId: resourceSetRef('Typography'),
    name: 'Typography',
    columnAxis: {
      name: 'Role',
      values: [...new Set(typographyCatalogItems.map((item) => item.column))],
    },
    rowAxis: {
      name: 'Size',
      values: [...new Set(typographyCatalogItems.map((item) => item.row))],
    },
    items: typographyCatalogItems,
  }),
);
