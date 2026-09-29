import { defineRecipeDesign } from '@nevo/ui/figma';
import { assetRef } from '@nevo/ui/figma/resources';
import { buttonVariants } from './Button';

export const designSpec = defineRecipeDesign({
  component: 'Button',
  recipe: buttonVariants,
  order: 10,
  // Native disabled:boolean remains an explicit Button → Figma State adapter.
  // Keeping the existing axis avoids breaking stable IDs in current Figma files.
  additionalProperties: { state: ['default', 'disabled'] },
  additionalDefaults: { state: 'default' },
  slots: {
    leadingIcon: {
      kind: 'asset-swap',
      propertyName: 'Leading icon',
      variantProperty: 'size',
      defaultAssetRefs: {
        sm: assetRef('Icon', { name: 'search', size: 'sm' }),
        md: assetRef('Icon', { name: 'search', size: 'md' }),
      },
    },
    label: { kind: 'text', propertyName: 'Label', defaultText: 'Button', required: true },
    trailingIcon: {
      kind: 'asset-swap',
      propertyName: 'Trailing icon',
      variantProperty: 'size',
      defaultAssetRefs: {
        sm: assetRef('Icon', { name: 'arrow-right', size: 'sm' }),
        md: assetRef('Icon', { name: 'arrow-right', size: 'md' }),
      },
    },
  },
});



