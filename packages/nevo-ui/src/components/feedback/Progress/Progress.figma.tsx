import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Progress',
  description:
    'Determinate progress track. Runtime value controls fill width; the design component captures canonical geometry and semantic color roles. `segmented-position` is `variant="segmented"` with `position` (a step among steps, one current segment), not progress.',
  order: 114,
  variants: {
    size: ['default', 'compact'],
    variant: ['continuous', 'segmented', 'segmented-position'],
  },
  defaults: { size: 'default', variant: 'continuous' },
  slots: {},
});
