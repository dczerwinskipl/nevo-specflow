import type {
  ComponentCaptureRegistry,
  ComponentSlotRegistry,
  ResourceCaptureRegistry,
} from '@nevo/figma-core/authoring';

import type { projectDesignSystem } from './designSystem';
import type { projectResourceRegistry } from './resources';

type ProjectComponentRegistry = ComponentCaptureRegistry<typeof projectDesignSystem>;
type ProjectSlotRegistry = ComponentSlotRegistry<typeof projectDesignSystem>;
type ProjectResourceRegistry = ResourceCaptureRegistry<typeof projectResourceRegistry>;
declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends ProjectComponentRegistry, ProjectResourceRegistry {}
  interface DesignCaptureSlotRegistry extends ProjectSlotRegistry {}
}
