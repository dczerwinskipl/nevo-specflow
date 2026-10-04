import { defineRecipeDesign } from '@nevo/ui/figma';
import { nevoBrandAssetRef as assetRef } from './figmaResources';
import { nevoMarkPixelSizes, nevoMarkVariants } from './NevoMark';

const markAssets = {
  brand: assetRef('NevoMarkAsset', { variant: 'brand' }),
  monochrome: assetRef('NevoMarkAsset', { variant: 'monochrome' }),
};

export const designSpec = defineRecipeDesign({
  component: 'NevoMark',
  description: 'Nevo ribbon mark with brand-derived and monochrome materials.',
  recipe: nevoMarkVariants,
  order: 1,
  figma: {
    root: { layoutMode: 'NONE' },
    variants: Object.fromEntries(
      Object.entries(nevoMarkPixelSizes).flatMap(([size, pixels]) =>
        ['brand', 'monochrome'].map((variant) => [
          `${size}/${variant}`,
          {
            root: { width: pixels, height: pixels, layoutMode: 'NONE' as const },
            slots: { artwork: { x: 0, y: 0, width: pixels, height: pixels } },
          },
        ]),
      ),
    ),
  },
  slots: {
    artwork: {
      kind: 'asset-swap',
      propertyName: 'Artwork',
      required: true,
      variantProperty: 'variant',
      defaultAssetRefs: markAssets,
    },
  },
});
