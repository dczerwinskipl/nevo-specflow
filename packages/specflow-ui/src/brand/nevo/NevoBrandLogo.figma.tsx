import { defineRecipeDesign } from '@nevo/ui/figma';
import { nevoBrandLogoVariants } from './NevoBrandLogo';

export const designSpec = defineRecipeDesign({
  component: 'NevoBrandLogo',
  description:
    'Configurable Nevo-family identity with predefined mark, horizontal, stacked and signature compositions.',
  recipe: nevoBrandLogoVariants,
  order: 2,
  slots: {
    mark: { kind: 'slot', propertyName: 'Mark', required: true },
    brand: { kind: 'text', propertyName: 'Brand', defaultText: 'nevo' },
    product: { kind: 'text', propertyName: 'Product', defaultText: 'ui' },
    slogan: {
      kind: 'text',
      propertyName: 'Slogan',
      defaultText: 'Interfaces built together',
    },
  },
});
