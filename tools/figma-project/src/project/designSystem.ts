import { createComponentAuthoring, defineDesignSystem } from '@nevo/figma-core/authoring';
import { specFlowDesignSystem, specFlowFigmaExportProfile } from '@nevo/specflow-ui/figma';
import { nevoBrandDesignSystem } from '@nevo/specflow-ui/brand/figma';
import { nevoUiDesignSystem, nevoUiFigmaExportProfile } from '@nevo/ui/figma';
import { crmDesignSystem, crmFigmaExportProfile } from 'nevo-example-crm/figma';

export const projectDesignSystem = defineDesignSystem([
  ...nevoUiDesignSystem,
  ...nevoBrandDesignSystem,
  ...crmDesignSystem,
  ...specFlowDesignSystem,
] as const);

export const { componentRef, slot, variantProperty } =
  createComponentAuthoring(projectDesignSystem);

export const projectFigmaExportProfiles = [
  nevoUiFigmaExportProfile,
  specFlowFigmaExportProfile,
  crmFigmaExportProfile,
] as const;
