import {
  createResourceAuthoring,
  defineDesignResource,
  defineResourceRegistry,
} from '@nevo/figma-core/authoring';

import { iconNames, iconSizes, typographyVariantNames } from '../design-system/resources';

export const iconResource = defineDesignResource({
  id: 'Icon',
  kind: 'asset',
  variants: { name: iconNames, size: iconSizes },
});

export const typographyResource = defineDesignResource({
  id: 'Typography',
  kind: 'text-style',
  variants: { variant: typographyVariantNames },
});

export const nevoUiResourceRegistry = defineResourceRegistry(iconResource, typographyResource);

export const { assetRef, resourceSetRef, textStyleRef } =
  createResourceAuthoring(nevoUiResourceRegistry);
