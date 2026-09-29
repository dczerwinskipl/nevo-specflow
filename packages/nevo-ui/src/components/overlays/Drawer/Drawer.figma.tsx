import { defineDesignComponent } from '@nevo/figma-core/authoring';

/**
 * Deliberate static representation of the runtime portal-based Drawer.
 * Runtime viewport positioning and modal behavior are not Figma concerns.
 */
export const drawerFigmaProjection = {
  width: 480,
  height: 720,
} as const;

export const designSpec = defineDesignComponent({
  component: 'Drawer',
  description: 'Static open-state side panel with editable content and reusable actions',
  order: 15,
  variants: {},
  slots: {
    header: { kind: 'container', required: true },
    body: { kind: 'slot', propertyName: 'Content', required: true },
    footer: { kind: 'container' },
    closeAction: { kind: 'container' },
  },
  figma: {
    root: {
      ...drawerFigmaProjection,
      layoutMode: 'VERTICAL',
      gap: 0,
    },
  },
});



