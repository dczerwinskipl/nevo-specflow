export const nevoMarkVariants = ['brand', 'monochrome'] as const;

export type NevoMarkVariant = (typeof nevoMarkVariants)[number];
export type NevoMarkAssetRef = `NevoMarkAsset/${NevoMarkVariant}`;

export function nevoMarkAssetRef(variant: NevoMarkVariant): NevoMarkAssetRef {
  return `NevoMarkAsset/${variant}`;
}
