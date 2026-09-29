import type {
  ComponentCaptureRegistry,
  ComponentSlotRegistry,
} from '@nevo/figma-core/authoring';

import { designSpec } from './SpecFlowShell.figma';

export const specFlowDesignSystem = [designSpec] as const;

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends ComponentCaptureRegistry<typeof specFlowDesignSystem> {}
  interface DesignCaptureSlotRegistry extends ComponentSlotRegistry<typeof specFlowDesignSystem> {}
}
