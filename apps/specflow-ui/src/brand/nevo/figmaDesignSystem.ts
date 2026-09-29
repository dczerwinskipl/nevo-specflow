import type {
  ComponentCaptureRegistry,
  ComponentSlotRegistry,
  ResourceCaptureRegistry,
} from '@nevo/figma-core/authoring';

import { designSpec as nevoBrandLogoDesignSpec } from './NevoBrandLogo.figma';
import { designSpec as nevoMarkDesignSpec } from './NevoMark.figma';
import { nevoBrandResourceRegistry } from './figmaResources';

export { nevoBrandAssetRef, nevoBrandResourceRegistry, nevoMarkAssetResource } from './figmaResources';

export const nevoBrandDesignSystem = [nevoMarkDesignSpec, nevoBrandLogoDesignSpec] as const;

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry
    extends ComponentCaptureRegistry<typeof nevoBrandDesignSystem>,
      ResourceCaptureRegistry<typeof nevoBrandResourceRegistry> {}
  interface DesignCaptureSlotRegistry
    extends ComponentSlotRegistry<typeof nevoBrandDesignSystem> {}
}
