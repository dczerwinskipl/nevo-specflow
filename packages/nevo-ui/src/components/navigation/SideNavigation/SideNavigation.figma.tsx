import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'TraditionalNavigationMenu',
  displayName: 'SideNavigation',
  description:
    'Simple two-level business application navigation backed by the generic Navigation Core.',
  order: 27,
  variants: {},
  slots: {
    label: { kind: 'text', propertyName: 'Label', defaultText: 'Workspace' },
    items: { kind: 'container', required: true },
  },
});
