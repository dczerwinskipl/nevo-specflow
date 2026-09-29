import { defineDesignComponent } from '@nevo/figma-core/authoring';

const desktopAppViewport = { width: 1440, height: 960 } as const;

export const designSpec = defineDesignComponent({
  component: 'CrmExampleScreen',
  displayName: 'CRM example — Customers',
  description: 'Reference CRM consumer with an active customer detail panel.',
  target: 'screen',
  order: 110,
  variants: { viewport: ['desktop'] },
  defaults: { viewport: 'desktop' },
  slots: {
    shell: { kind: 'container', required: true },
  },
  figma: {
    root: { ...desktopAppViewport, layoutMode: 'NONE' },
    slots: {
      shell: { x: 0, y: 0, ...desktopAppViewport },
    },
  },
});
