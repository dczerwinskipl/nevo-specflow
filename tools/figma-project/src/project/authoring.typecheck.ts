import { defineDesignComponent, type AssetSwapSlotFor } from '@nevo/figma-core/authoring';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { specFlowDesignSystem } from '@nevo/specflow-ui/figma';
import { iconAssetRef, typographyTextStyleRef } from '@nevo/ui/design-system/resources';
import { nevoUiDesignSystem } from '@nevo/ui/figma';
import { crmDesignSystem } from 'nevo-example-crm/figma';

import { componentRef, slot, variantProperty } from './designSystem';
import { assetRef, resourceSetRef, textStyleRef } from './resources';

type ButtonAxes = Extract<
  (typeof nevoUiDesignSystem)[number],
  { component: 'Button' }
>['propertyValues'];

componentRef('Button', { variant: 'primary', size: 'sm', state: 'default' });
slot('Button', 'leadingIcon');
slot('Button', 'label');
variantProperty('Button', 'size');
assetRef('Icon', { name: 'search', size: 'sm' });
resourceSetRef('Icon');
textStyleRef('Typography', { variant: 'body-md' });
useDesignMetadata('Button', { variant: 'primary', size: 'sm', state: 'default' });
useDesignMetadata(
  'Icon',
  {},
  {
    assetRef: iconAssetRef('search', 'sm'),
    assetRepresentation: 'svg-mask',
  },
);
useDesignMetadata(
  'Typography',
  {},
  {
    textFlow: true,
    textStyleRef: typographyTextStyleRef('body-md'),
  },
);
designSlot('Button', 'leadingIcon');
designSlot('Button', 'label');
designSlot('AppWorkspaceSlots', 'primary');
componentRef('Drawer', {});
slot('Drawer', 'body');
useDesignMetadata('Drawer');
designSlot('Drawer', 'header');
designSlot('Drawer', 'body');
designSlot('Drawer', 'footer');
designSlot('Drawer', 'closeAction');
void nevoUiDesignSystem;
void specFlowDesignSystem;
void crmDesignSystem;

const completeDefaults: AssetSwapSlotFor<ButtonAxes> = {
  kind: 'asset-swap',
  propertyName: 'Leading icon',
  variantProperty: 'size',
  defaultAssetRefs: {
    sm: assetRef('Icon', { name: 'search', size: 'sm' }),
    md: assetRef('Icon', { name: 'search', size: 'md' }),
  },
};
void completeDefaults;

// @ts-expect-error unknown component ID
componentRef('Buton', { variant: 'primary', size: 'sm', state: 'default' });

// @ts-expect-error unknown capture component ID
useDesignMetadata('Buton', {});

// @ts-expect-error unknown Button capture property
useDesignMetadata('Button', { variant: 'primary', size: 'sm', state: 'default', foo: 'bar' });

// @ts-expect-error invalid Button capture property value
useDesignMetadata('Button', { variant: 'primary', size: 'xl', state: 'default' });

// @ts-expect-error unknown Button runtime slot
designSlot('Button', 'leadngIcon');

// @ts-expect-error slot belongs to AppWorkspaceSlots, not Button
designSlot('Button', 'primary');

// @ts-expect-error unknown runtime slot component
designSlot('UnknownComponent', 'label');

// @ts-expect-error unknown Button slot
slot('Button', 'leadngIcon');

// @ts-expect-error unknown Button variant property
variantProperty('Button', 'density');

// @ts-expect-error unknown Button variant axis
componentRef('Button', { variant: 'primary', size: 'sm', state: 'default', density: 'compact' });

// @ts-expect-error invalid Button size
componentRef('Button', { variant: 'primary', size: 'lg', state: 'default' });

// @ts-expect-error unknown resource
assetRef('Illustration', { name: 'search', size: 'sm' });

// @ts-expect-error invalid Icon axis
assetRef('Icon', { glyph: 'search', size: 'sm' });

// @ts-expect-error invalid Icon axis value
assetRef('Icon', { name: 'does-not-exist', size: 'sm' });

// @ts-expect-error invalid Icon size
assetRef('Icon', { name: 'search', size: 'xl' });

// @ts-expect-error missing required Icon axis
assetRef('Icon', { name: 'search' });

// @ts-expect-error extra Icon axis
assetRef('Icon', { name: 'search', size: 'sm', foo: 'bar' });

// @ts-expect-error unknown resource-set ID
resourceSetRef('Icons');

// @ts-expect-error invalid Typography axis
textStyleRef('Typography', { style: 'body-md' });

// @ts-expect-error invalid Typography variant
textStyleRef('Typography', { variant: 'body-xl' });

// @ts-expect-error Icon metadata has a finite key set
useDesignMetadata('Icon', {}, { randomThing: 'x' });

useDesignMetadata(
  'Icon',
  {},
  {
    assetRef: iconAssetRef('search', 'sm'),
    // @ts-expect-error unsupported asset representation
    assetRepresentation: 'png',
  },
);

const missingDefaults: AssetSwapSlotFor<ButtonAxes> = {
  kind: 'asset-swap',
  propertyName: 'Leading icon',
  variantProperty: 'size',
  // @ts-expect-error missing md mapping
  defaultAssetRefs: {
    sm: assetRef('Icon', { name: 'search', size: 'sm' }),
  },
};
void missingDefaults;

const extraDefaults: AssetSwapSlotFor<ButtonAxes> = {
  kind: 'asset-swap',
  propertyName: 'Leading icon',
  variantProperty: 'size',
  defaultAssetRefs: {
    sm: assetRef('Icon', { name: 'search', size: 'sm' }),
    md: assetRef('Icon', { name: 'search', size: 'md' }),
    // @ts-expect-error extra lg mapping
    lg: assetRef('Icon', { name: 'search', size: 'sm' }),
  },
};
void extraDefaults;

// @ts-expect-error remapping an asset size requires explicit allowAssetValueRemap
const mismatchedAxisDefaults: AssetSwapSlotFor<ButtonAxes> = {
  kind: 'asset-swap',
  propertyName: 'Leading icon',
  variantProperty: 'size',
  defaultAssetRefs: {
    sm: assetRef('Icon', { name: 'search', size: 'md' }),
    md: assetRef('Icon', { name: 'search', size: 'md' }),
  },
};
void mismatchedAxisDefaults;

const explicitlyRemappedAxisDefaults: AssetSwapSlotFor<ButtonAxes> = {
  kind: 'asset-swap',
  propertyName: 'Leading icon',
  variantProperty: 'size',
  allowAssetValueRemap: true,
  defaultAssetRefs: {
    sm: assetRef('Icon', { name: 'search', size: 'md' }),
    md: assetRef('Icon', { name: 'search', size: 'sm' }),
  },
};
void explicitlyRemappedAxisDefaults;

const wrongRefKind: AssetSwapSlotFor<ButtonAxes> = {
  kind: 'asset-swap',
  propertyName: 'Leading icon',
  variantProperty: 'size',
  defaultAssetRefs: {
    // @ts-expect-error text-style ref cannot be used as an asset ref
    sm: textStyleRef('Typography', { variant: 'body-sm' }),
    md: assetRef('Icon', { name: 'search', size: 'md' }),
  },
};
void wrongRefKind;

defineDesignComponent({
  component: 'CompileTimeFixture',
  order: 999,
  variants: { tone: ['neutral', 'positive'] },
  // @ts-expect-error defaults are constrained by the authored axes
  defaults: { tone: 'negative' },
  slots: {
    label: { kind: 'text', propertyName: 'Label', defaultText: 'Fixture' },
  },
});
