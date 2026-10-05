import { defineDesignComponent } from '@nevo/figma-core/authoring';
import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { menuItemVariants } from './Menu';

export const designSpecs = [
  defineRecipeDesign({
    component: 'MenuItem',
    description: 'Compact action row for menus with neutral and destructive intent.',
    recipe: menuItemVariants,
    order: 32,
    // Background varies by the state+tone combination; capture metadata binds
    // that exact combination instead of flattening it to one recipe axis.
    bindings: { background: undefined },
    slots: {
      leadingIcon: { kind: 'container' },
      label: { kind: 'text', propertyName: 'Label', defaultText: 'Menu item', required: true },
      shortcut: { kind: 'text', propertyName: 'Shortcut', defaultText: '⌘K' },
    },
  }),
  defineDesignComponent({
    component: 'MenuRadioItem',
    description: 'Single-choice menu row with checked, unchecked, and disabled states.',
    order: 33,
    variants: { state: ['unchecked', 'checked', 'disabled'] },
    defaults: { state: 'unchecked' },
    slots: {
      indicator: { kind: 'container', exposeVisibility: false },
      label: { kind: 'text', propertyName: 'Label', defaultText: 'Radio item', required: true },
    },
  }),
  defineDesignComponent({
    component: 'Menu',
    description: 'Floating action menu assembled from labels, items and separators.',
    order: 34,
    variants: {},
    slots: {
      items: { kind: 'slot', propertyName: 'Items', required: true },
    },
  }),
] as const;
