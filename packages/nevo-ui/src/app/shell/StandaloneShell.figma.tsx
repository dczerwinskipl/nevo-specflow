import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'StandaloneShell',
  description:
    'Standalone application frame without primary navigation. Uses a compact centered surface on desktop and a single header plus full-height workspace sheet on mobile.',
  order: 22,
  variants: {},
  slots: {
    mobileHeader: { kind: 'slot', propertyName: 'Mobile header' },
    desktopHeader: { kind: 'slot', propertyName: 'Desktop header' },
    content: { kind: 'slot', propertyName: 'Content', required: true },
  },
});
