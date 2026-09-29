import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Toast',
  description:
    'Transient notification surface; viewport placement and lifecycle remain runtime-only.',
  order: 120,
  variants: {},
  slots: {
    title: { kind: 'text', propertyName: 'Title', defaultText: 'Customer saved', required: true },
    description: {
      kind: 'text',
      propertyName: 'Description',
      defaultText: 'The customer record was updated.',
    },
    close: { kind: 'container' },
  },
});
