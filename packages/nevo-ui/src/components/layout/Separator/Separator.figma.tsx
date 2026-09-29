import { defineRecipeDesign } from '@nevo/ui/figma';
import { separatorVariants } from './Separator';

export const designSpec = defineRecipeDesign({
  component: 'Separator',
  recipe: separatorVariants,
  order: 36,
  description: 'Semantic divider using the shared divider token. Context owns surrounding spacing.',
  slots: {},
});



