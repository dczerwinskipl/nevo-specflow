import { defineRecipeDesign } from '@nevo/ui/figma';
import { linkVariants } from './Link';

export const designSpec = defineRecipeDesign({
  component: 'Link',
  recipe: linkVariants,
  order: 22,
  description:
    'Native anchor presentation for inline navigation. Router adapters should reuse the exported recipe instead of duplicating styles.',
  slots: {
    label: { kind: 'text', propertyName: 'Label', defaultText: 'View customer', required: true },
  },
});



