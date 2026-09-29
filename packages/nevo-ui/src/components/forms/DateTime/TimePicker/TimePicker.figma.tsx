import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'TimePicker',
  description:
    'Wall-clock time control backed by Time. Supports segmented keyboard editing plus a clock-triggered picker; no implicit time zone.',
  order: 132,
  variants: { state: ['default', 'disabled', 'invalid'] },
  defaults: { state: 'default' },
  slots: {
    control: { kind: 'container' },
    trigger: { kind: 'container' },
  },
});



