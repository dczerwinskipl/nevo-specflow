import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Switch',
  description: 'Binary setting control. Visible labeling remains a composition concern.',
  order: 126,
  variants: { state: ['default', 'checked', 'disabled'] },
  defaults: { state: 'default' },
  slots: {
    thumb: { kind: 'container', required: true },
  },
});



