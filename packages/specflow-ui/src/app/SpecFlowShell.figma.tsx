import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'SpecFlowApplicationShell',
  displayName: 'SpecFlow — Application shell',
  description: 'Initial product shell proving routing, Nevo branding, and Nevo UI composition.',
  target: 'screen',
  order: 200,
  variants: { viewport: ['desktop'] },
  defaults: { viewport: 'desktop' },
  slots: { shell: { kind: 'container', required: true } },
  figma: {
    root: { width: 1440, height: 960, layoutMode: 'NONE' },
    slots: { shell: { x: 0, y: 0, width: 1440, height: 960 } },
  },
});
