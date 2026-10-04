import { defineRecipeDesign } from '@nevo/ui/figma/define';
import { assetRef } from '@nevo/ui/figma/resources';
import { iconButtonVariants } from './IconButton';

export const designSpec = defineRecipeDesign({
  component: 'IconButton',
  description: 'Accessible icon-only action for compact application interfaces.',
  recipe: iconButtonVariants,
  order: 12,
  additionalProperties: { state: ['default', 'disabled'] },
  additionalDefaults: { state: 'default' },
  slots: {
    icon: {
      kind: 'asset-swap',
      propertyName: 'Icon',
      required: true,
      variantProperty: 'size',
      allowAssetValueRemap: true,
      defaultAssetRefs: {
        xs: assetRef('Icon', { name: 'plus', size: 'sm' }),
        sm: assetRef('Icon', { name: 'plus', size: 'sm' }),
        md: assetRef('Icon', { name: 'plus', size: 'md' }),
      },
    },
  },
});
