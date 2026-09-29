import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Pagination',
  description:
    'Stable pagination presentations derived from the valid runtime discriminated union.',
  order: 130,
  variants: {
    presentation: ['known-pages', 'known-simple', 'unknown-simple', 'cursor-simple'],
  },
  defaults: { presentation: 'known-pages' },
  slots: {
    content: { kind: 'slot', propertyName: 'Content', required: true },
  },
});
