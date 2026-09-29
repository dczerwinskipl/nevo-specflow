import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Checkbox',
  description:
    'Boolean or indeterminate selection control. Visible labeling remains a composition concern.',
  order: 122,
  variants: { state: ['default', 'checked', 'indeterminate', 'disabled'] },
  defaults: { state: 'default' },
  slots: {
    // The indicator is authored by each state capture. It must not inherit the
    // optional-container visibility default from the unchecked variant.
    indicator: { kind: 'container', exposeVisibility: false },
  },
});



