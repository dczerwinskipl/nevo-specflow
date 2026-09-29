import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { statusIndicatorVariants } from './StatusIndicator';

export const designSpec = defineRecipeDesign({
  component: 'StatusIndicator',
  description: 'Compact semantic status marker for dense UI.',
  recipe: statusIndicatorVariants,
  order: 113,
  slots: {},
});
