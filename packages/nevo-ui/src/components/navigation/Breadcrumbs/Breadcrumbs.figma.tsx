import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Breadcrumbs',
  description: 'Canonical hierarchical location trail with the final item marked current.',
  order: 128,
  variants: {},
  slots: {
    items: { kind: 'slot', propertyName: 'Items', required: true },
  },
});



