import {
  createResourceAuthoring,
  defineDesignResource,
  defineResourceRegistry,
} from '@nevo/figma-core/authoring';

import { nevoMarkVariants } from './resources';

export const nevoMarkAssetResource = defineDesignResource({
  id: 'NevoMarkAsset',
  kind: 'asset',
  variants: { variant: nevoMarkVariants },
});

export const nevoBrandResourceRegistry = defineResourceRegistry(nevoMarkAssetResource);
export const { assetRef: nevoBrandAssetRef } =
  createResourceAuthoring(nevoBrandResourceRegistry);
