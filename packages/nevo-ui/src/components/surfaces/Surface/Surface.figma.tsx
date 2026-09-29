import { defineRecipeDesign } from '@nevo/ui/figma';
import { surfaceVariants } from './Surface';

export const designSpec = defineRecipeDesign({
  component: 'Surface',
  recipe: surfaceVariants,
  order: 70,
  description:
    'Semantic content layer. Tones represent default, raised and subtle application surfaces; form-control surfaces remain separate.',
  slots: {},
});



