import { createResourceAuthoring, defineResourceRegistry } from '@nevo/figma-core/authoring';
import {
  nevoBrandResourceRegistry,
  nevoMarkAssetResource,
} from '@nevo/specflow-ui/brand/figma-resources';
import { iconResource, nevoUiResourceRegistry, typographyResource } from '@nevo/ui/figma/resources';

export { iconResource, nevoMarkAssetResource, typographyResource };

export const projectResourceRegistry = defineResourceRegistry(
  ...nevoUiResourceRegistry,
  ...nevoBrandResourceRegistry,
);

export const { assetRef, resourceSetRef, textStyleRef } =
  createResourceAuthoring(projectResourceRegistry);
