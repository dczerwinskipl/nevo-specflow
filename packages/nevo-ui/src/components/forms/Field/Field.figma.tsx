import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Field',
  description:
    'Accessible label, control, description and error composition for native form fields.',
  order: 20,
  variants: { state: ['default', 'disabled', 'invalid'] },
  defaults: { state: 'default' },
  slots: {
    label: { kind: 'text', propertyName: 'Label', defaultText: 'Field label', required: true },
    control: { kind: 'slot', propertyName: 'Control', required: true },
    description: { kind: 'text', propertyName: 'Description', defaultText: 'Helpful description' },
    error: { kind: 'text', propertyName: 'Error', defaultText: 'Validation message' },
  },
});
