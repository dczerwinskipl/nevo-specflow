import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Collapsible',
  description: 'Accessible disclosure with compact trigger chrome and an optional default chevron.',
  order: 135,
  variants: {
    state: ['collapsed', 'expanded'],
  },
  defaults: {
    state: 'collapsed',
  },
  slots: {
    trigger: { kind: 'slot', propertyName: 'Trigger', required: true },
    content: { kind: 'slot', propertyName: 'Content', required: true },
  },
});
