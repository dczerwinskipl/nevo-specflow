import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'AlertDialog',
  description:
    'Confirmation surface for consequential actions; modal behavior remains runtime-only.',
  order: 134,
  variants: {},
  slots: {
    title: { kind: 'text', propertyName: 'Title', defaultText: 'Delete customer?', required: true },
    description: {
      kind: 'text',
      propertyName: 'Description',
      defaultText: 'This action cannot be undone.',
    },
    footer: { kind: 'container', required: true },
  },
});
