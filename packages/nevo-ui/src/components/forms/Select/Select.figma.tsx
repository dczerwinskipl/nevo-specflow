import { defineDesignComponent } from '@nevo/figma-core/authoring';
import { defineRecipeDesign } from '@nevo/ui/figma';
import { selectTriggerVariants } from './Select';

export const designSpecs = [
  defineRecipeDesign({
    component: 'Select',
    description: 'Single-value selection control with placeholder, validation and disabled states.',
    recipe: selectTriggerVariants,
    order: 36,
    bindings: {
      background: {
        property: 'state',
        values: {
          default: 'Color/surface-control',
          focus: 'Color/surface-control',
          disabled: 'Color/surface-subtle',
          invalid: 'Color/surface-control',
        },
      },
      border: {
        property: 'state',
        values: {
          default: 'Color/border-default',
          focus: 'Color/focus-ring',
          disabled: 'Color/border-subtle',
          invalid: 'Color/border-error',
        },
      },
      content: {
        property: 'state',
        values: {
          default: 'Color/content-primary',
          focus: 'Color/content-primary',
          disabled: 'Color/content-muted',
          invalid: 'Color/content-primary',
        },
      },
    },
    slots: {
      value: {
        kind: 'text',
        propertyName: 'Value',
        defaultText: 'Choose an option',
        required: true,
      },
      trailingIcon: { kind: 'container', required: true },
    },
  }),
  defineDesignComponent({
    component: 'SelectItem',
    description: 'Listbox option row with highlighted and disabled states.',
    order: 38,
    variants: {
      state: ['default', 'highlighted', 'disabled'],
    },
    defaults: { state: 'default' },
    slots: {
      label: { kind: 'text', propertyName: 'Label', defaultText: 'Option', required: true },
      indicator: { kind: 'container' },
    },
  }),
] as const;



