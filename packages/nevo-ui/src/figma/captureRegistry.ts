import type { DesignMetadataCapabilities } from '@nevo/figma-core/metadata';
import type {
  ComponentCaptureRegistry,
  ComponentSlotRegistry,
  ResourceCaptureRegistry,
} from '@nevo/figma-core/authoring';

import type { IconAssetRef, TypographyTextStyleRef } from '../design-system/resources';
import type { nevoUiDesignSystem } from './designSystem';
import type { nevoUiResourceRegistry } from './resources';

type NevoUiComponentRegistry = ComponentCaptureRegistry<typeof nevoUiDesignSystem>;
type NevoUiSlotRegistry = ComponentSlotRegistry<typeof nevoUiDesignSystem>;
type NevoUiResourceRegistry = ResourceCaptureRegistry<typeof nevoUiResourceRegistry>;
type NevoUiCaptureRegistry = NevoUiComponentRegistry & NevoUiResourceRegistry;
type IdentityMetadata = Pick<DesignMetadataCapabilities, 'key'>;

interface NevoUiCaptureMetadataRegistry {
  Icon: {
    assetRef: IconAssetRef;
    assetRepresentation: 'svg' | 'svg-mask';
  };
  Typography: {
    textFlow: true;
    textStyleRef: TypographyTextStyleRef;
  };
  TabsTrigger: IdentityMetadata;
  SegmentedControlItem: IdentityMetadata;
}

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends NevoUiCaptureRegistry {}
  interface DesignCaptureMetadataRegistry extends NevoUiCaptureMetadataRegistry {}
  interface DesignCaptureSlotRegistry extends NevoUiSlotRegistry {}
}
