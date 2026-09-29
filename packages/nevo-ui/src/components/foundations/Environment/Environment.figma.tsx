import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpecs = [
  defineDesignComponent({
    component: 'AppBackground',
    description: 'Near-black application environment with brand-derived ambient light.',
    order: 5,
    variants: {},
    slots: {},
    figma: {
      root: { width: 960, height: 540, layoutMode: 'NONE' },
    },
  }),
  defineDesignComponent({
    component: 'WorkspaceSurface',
    description: 'Neutral translucent workspace material with local brand-derived reflected light.',
    order: 6,
    variants: {},
    slots: {},
    figma: {
      root: { width: 860, height: 420, layoutMode: 'NONE' },
    },
  }),
] as const;



