import { tv } from 'tailwind-variants/lite';
import { defineRecipeDesign } from '@nevo/ui/figma';
import { timelineRootClassName } from './Timeline';
import { timelineDefaults, timelineSizes, type TimelineSize } from './timelineContract';

const timelineSizeVariants = Object.fromEntries(timelineSizes.map((size) => [size, ''])) as Record<
  TimelineSize,
  string
>;

const timelineDesignRecipe = tv({
  base: timelineRootClassName,
  variants: {
    size: timelineSizeVariants,
  },
  defaultVariants: timelineDefaults,
});

export const designSpec = defineRecipeDesign({
  component: 'Timeline',
  description:
    'Vertical chronological sequence for compact activity and medium workflow history. Application code owns event projection, ordering and grouping.',
  order: 140,
  recipe: timelineDesignRecipe,
  slots: {},
});



