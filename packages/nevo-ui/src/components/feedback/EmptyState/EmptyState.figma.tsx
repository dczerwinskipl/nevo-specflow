import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'EmptyState',
  description:
    'Empty-content message: a large muted glyph (or a custom illustration), title, description and actions (one primary at most). `pane` fills an empty area without a border; `inline` is a row-sized, start-aligned section body with a small glyph beside the text.',
  order: 114,
  variants: {
    variant: ['default', 'pane', 'inline'],
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
