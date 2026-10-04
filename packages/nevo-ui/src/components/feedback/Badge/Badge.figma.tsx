import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { badgeVariants } from './Badge';

export const designSpec = defineRecipeDesign({
  component: 'Badge',
  description: 'Compact semantic status label.',
  recipe: badgeVariants,
  order: 112,
  slots: {
    label: { kind: 'text', propertyName: 'Label', defaultText: 'Status', required: true },
  },
});
