import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpecs = [
  defineDesignComponent({
    component: 'SegmentedControlItem',
    description: 'Single-select segmented switch item with selected, focus and disabled states.',
    order: 26,
    variants: {
      selection: ['default', 'selected'],
      state: ['default', 'focus', 'disabled'],
    },
    defaults: { selection: 'default', state: 'default' },
    slots: {
      label: {
        kind: 'text',
        propertyName: 'Label',
        defaultText: 'Option',
        required: true,
      },
    },
  }),
  defineDesignComponent({
    component: 'SegmentedControl',
    description:
      'Compact single-select control for switching between closely related local views or modes.',
    order: 28,
    variants: {},
    slots: {},
  }),
] as const;
