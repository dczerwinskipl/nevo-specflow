import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'EmptyState',
  description: 'Centered empty-content message with optional icon, description and actions.',
  order: 114,
  variants: {},
  slots: {
    icon: { kind: 'container' },
    title: { kind: 'text', propertyName: 'Title', defaultText: 'No customers', required: true },
    description: {
      kind: 'text',
      propertyName: 'Description',
      defaultText: 'There are no records to display.',
    },
    actions: { kind: 'container' },
  },
});
