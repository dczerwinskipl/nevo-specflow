import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'EmptyState',
  description:
    'Centered empty-content message: a large muted glyph (or a custom illustration), title, description and actions (one primary at most). `pane` fills an empty area without a border.',
  order: 114,
  variants: {
    variant: ['default', 'pane'],
  },
  defaults: {
    variant: 'default',
  },
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
