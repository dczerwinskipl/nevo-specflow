import { defineDesignComponent } from '@nevo/figma-core/authoring';

/** Static surface projection; portal positioning and collision handling stay runtime-only. */
export const designSpec = defineDesignComponent({
  component: 'Popover',
  description: 'Floating non-modal content surface anchored to a trigger or custom anchor.',
  order: 30,
  variants: {},
  slots: {
    content: { kind: 'slot', propertyName: 'Content', required: true },
  },
});



