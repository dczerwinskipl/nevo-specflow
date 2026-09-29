import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { alertVariants } from './Alert';

export const designSpec = defineRecipeDesign({
  component: 'Alert',
  description: 'Inline feedback surface for neutral, informational and status messages.',
  recipe: alertVariants,
  order: 110,
  slots: {
    icon: { kind: 'container', exposeVisibility: false },
    title: { kind: 'text', propertyName: 'Title', defaultText: 'Import completed' },
    body: {
      kind: 'text',
      propertyName: 'Body',
      defaultText: '42 records were processed successfully.',
    },
    actions: { kind: 'container' },
  },
});
