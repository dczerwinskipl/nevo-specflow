import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Tooltip',
  description:
    'Static open/active contextual label; trigger, delay, collision handling and closed state remain runtime-only.',
  order: 136,
  variants: {},
  slots: {
    content: {
      kind: 'text',
      propertyName: 'Content',
      defaultText: 'Archive customer',
      required: true,
    },
  },
});
