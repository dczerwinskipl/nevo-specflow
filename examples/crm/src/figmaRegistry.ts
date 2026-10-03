import {
  defineFigmaExportProfile,
  type ComponentCaptureRegistry,
  type ComponentSlotRegistry,
} from '@nevo/figma-core/authoring';

import { designSpec } from './CrmExample.figma';

export const crmDesignSystem = [designSpec] as const;

export const crmFigmaExportProfile = defineFigmaExportProfile(crmDesignSystem, {
  id: 'crm-example',
  owner: 'nevo-example-crm',
  displayName: 'CRM example',
  roots: crmDesignSystem.map((definition) => definition.component),
  resources: 'dependencies',
});

declare module '@nevo/figma-core/metadata' {
  interface DesignCaptureRegistry extends ComponentCaptureRegistry<typeof crmDesignSystem> {}
  interface DesignCaptureSlotRegistry extends ComponentSlotRegistry<typeof crmDesignSystem> {}
}
