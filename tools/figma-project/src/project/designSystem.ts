import { createComponentAuthoring, defineDesignSystem } from '@nevo/figma-core/authoring';
import { specFlowDesignSystem } from '@nevo/specflow-ui/figma';
import { nevoBrandDesignSystem } from '@nevo/specflow-ui/brand/figma';
import { nevoUiDesignSystem } from '@nevo/ui/figma';
import { crmDesignSystem } from 'nevo-example-crm/figma';

export const projectDesignSystem = defineDesignSystem([
  ...nevoUiDesignSystem,
  ...nevoBrandDesignSystem,
  ...crmDesignSystem,
  ...specFlowDesignSystem,
] as const);

export const { componentRef, slot, variantProperty } =
  createComponentAuthoring(projectDesignSystem);
