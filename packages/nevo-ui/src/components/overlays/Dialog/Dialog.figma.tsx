import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Dialog',
  description:
    'Modal content surface; portal, focus management and overlay behavior remain runtime-only.',
  order: 132,
  variants: {},
  slots: {
    title: { kind: 'text', propertyName: 'Title', defaultText: 'Edit customer', required: true },
    description: {
      kind: 'text',
      propertyName: 'Description',
      defaultText: 'Update the customer record.',
    },
    body: { kind: 'container' },
    footer: { kind: 'container' },
    close: { kind: 'container' },
  },
});
