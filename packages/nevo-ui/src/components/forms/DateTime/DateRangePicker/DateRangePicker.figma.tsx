import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'DateRangePicker',
  description:
    'Date-only range selection using two segmented date inputs and one range calendar. Range validity remains owned by React Aria.',
  order: 134,
  variants: { state: ['default', 'disabled', 'invalid'] },
  defaults: { state: 'default' },
  slots: {
    control: { kind: 'container' },
    trigger: { kind: 'container' },
  },
});
