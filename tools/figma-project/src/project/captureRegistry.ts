import type {
  ComponentCaptureRegistry,
  ComponentSlotRegistry,
  ResourceCaptureRegistry,
} from '@nevo/figma-core/authoring';
import type { DesignMetadataCapabilities } from '@nevo/figma-core/metadata';
import type { NevoMarkAssetRef } from '@nevo/specflow-ui/brand';
import type { IconAssetRef, TypographyTextStyleRef } from '@nevo/ui/design-system/resources';

import type { projectDesignSystem } from './designSystem';
import type { projectResourceRegistry } from './resources';

type ProjectComponentRegistry = ComponentCaptureRegistry<typeof projectDesignSystem>;
type ProjectSlotRegistry = ComponentSlotRegistry<typeof projectDesignSystem>;
type ProjectResourceRegistry = ResourceCaptureRegistry<typeof projectResourceRegistry>;
type IdentityMetadata = Pick<DesignMetadataCapabilities, 'key'>;

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends ProjectComponentRegistry, ProjectResourceRegistry {}
  interface DesignCaptureMetadataRegistry {
    Icon: { assetRef: IconAssetRef; assetRepresentation: 'svg' | 'svg-mask' };
    NevoMarkAsset: { assetRef: NevoMarkAssetRef; assetRepresentation: 'svg' | 'svg-mask' };
    Typography: { textFlow: true; textStyleRef: TypographyTextStyleRef };
    TabsTrigger: IdentityMetadata;
    SegmentedControlItem: IdentityMetadata;
  }
  interface DesignCaptureSlotRegistry extends ProjectSlotRegistry {}
}
