import { tv } from 'tailwind-variants/lite';
import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { textInputControlClassName } from './TextInput';

const textInputDesignRecipe = tv({ base: textInputControlClassName });

export const designSpec = defineRecipeDesign({
  component: 'TextInput',
  description:
    'Single-line native input whose interaction states are composed through HTML and CSS.',
  recipe: textInputDesignRecipe,
  order: 14,
  additionalProperties: { state: ['default', 'focus', 'disabled', 'invalid'] },
  additionalDefaults: { state: 'default' },
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
  slots: {},
});
