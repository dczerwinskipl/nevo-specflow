import {
  defineDesignSystem,
  defineFigmaExportProfile,
  type ComponentCaptureRegistry,
  type ComponentSlotRegistry,
} from '@nevo/figma-core/authoring';

import { loginScreenDesignSpec } from '../auth/LoginScreen.figma';
import { designSpec } from './SpecFlowShell.figma';
import { nevoBrandDesignSystem } from '../brand/nevo/figmaDesignSystem';

export const specFlowDesignSystem = [designSpec, loginScreenDesignSpec] as const;

const specFlowOwnedDesign = defineDesignSystem([
  ...nevoBrandDesignSystem,
  ...specFlowDesignSystem,
] as const);

export const specFlowFigmaExportProfile = defineFigmaExportProfile(specFlowOwnedDesign, {
  id: 'specflow-ui',
  owner: '@nevo/specflow-ui',
  displayName: 'Nevo SpecFlow UI',
  roots: specFlowOwnedDesign.map((definition) => definition.component),
  resources: 'dependencies',
});

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends ComponentCaptureRegistry<typeof specFlowDesignSystem> {}
  interface DesignCaptureSlotRegistry extends ComponentSlotRegistry<typeof specFlowDesignSystem> {}
}
