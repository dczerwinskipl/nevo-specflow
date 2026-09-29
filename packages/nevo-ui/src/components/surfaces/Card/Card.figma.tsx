import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'Card',
  description:
    'Compact content container with one shared surface, one padding boundary and gap-based anatomy. Header, body and footer do not introduce dividers or independent padding.',
  order: 72,
  variants: {},
  slots: {
    header: { kind: 'container' },
    body: { kind: 'container' },
    footer: { kind: 'container' },
  },
});



