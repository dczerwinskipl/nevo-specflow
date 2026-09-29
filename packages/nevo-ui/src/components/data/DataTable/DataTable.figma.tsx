import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'DataTable',
  description:
    'Stable visual table projections; TanStack state machinery and backend models remain runtime-only.',
  order: 138,
  variants: {
    density: ['compact', 'default'],
    state: ['default', 'selected', 'sorted', 'loading', 'empty'],
  },
  defaults: { density: 'default', state: 'default' },
  slots: {
    content: { kind: 'slot', propertyName: 'Content', required: true },
  },
});



