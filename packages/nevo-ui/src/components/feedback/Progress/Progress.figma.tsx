import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Progress',
  description:
    'Determinate progress track. Runtime value controls fill width; the design component captures canonical geometry and semantic color roles. `position` is the segmented position mode (a step among steps, one current segment), not progress.',
  order: 114,
  variants: { size: ['default', 'compact'], variant: ['continuous', 'segmented', 'position'] },
  defaults: { size: 'default', variant: 'continuous' },
  slots: {},
});
