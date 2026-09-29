import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Spinner',
  description: 'Indeterminate loading indicator in compact and default sizes.',
  order: 118,
  variants: { size: ['sm', 'md'] },
  defaults: { size: 'md' },
  slots: {
    icon: { kind: 'container', required: true },
  },
});



