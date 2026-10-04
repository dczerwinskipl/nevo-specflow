import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { messageComposerVariants } from './MessageComposer';

export const designSpec = defineRecipeDesign({
  component: 'MessageComposer',
  description: 'Generic long-form submission surface with standalone and integrated presentations.',
  recipe: messageComposerVariants,
  order: 26,
  slots: {
    editor: { kind: 'slot', propertyName: 'Editor', required: true },
    toolbar: { kind: 'slot', propertyName: 'Toolbar', required: true },
  },
});
