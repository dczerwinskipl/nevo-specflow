import type {
  ComponentCaptureRegistry,
  ComponentSlotRegistry,
} from '@nevo/figma-core/authoring';

import { designSpec } from './CrmExample.figma';

export const crmDesignSystem = [designSpec] as const;

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends ComponentCaptureRegistry<typeof crmDesignSystem> {}
  interface DesignCaptureSlotRegistry extends ComponentSlotRegistry<typeof crmDesignSystem> {}
}
