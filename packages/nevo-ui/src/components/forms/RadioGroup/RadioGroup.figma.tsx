import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'RadioGroup',
  description: 'Stable radio-group composition showing unselected, selected and disabled options.',
  order: 124,
  variants: {},
  slots: {
    options: { kind: 'slot', propertyName: 'Options', required: true },
  },
});



