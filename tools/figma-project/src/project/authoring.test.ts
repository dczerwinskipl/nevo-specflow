import { describe, expect, it } from 'vitest';
import { resourceCatalogsOfKind } from '@nevo/figma-core/authoring';
import { designSlot } from '@nevo/figma-core/metadata';
import { componentRef, slot, variantProperty } from './designSystem';
import { projectResourceCatalogs } from './resourceCatalogs';
import { assetRef, resourceSetRef, textStyleRef } from './resources';

describe('project Figma authoring', () => {
  it('serializes structured resource refs to the existing stable IDs', () => {
    expect(assetRef('Icon', { name: 'search', size: 'sm' })).toBe('Icon/search/sm');
    expect(assetRef('NevoMarkAsset', { variant: 'brand' })).toBe('NevoMarkAsset/brand');
    expect(textStyleRef('Typography', { variant: 'body-md' })).toBe('Typography/body-md');
    expect(resourceSetRef('Icon')).toBe('Icon/set');
  });

  it('keeps component references as ordinary canonical values', () => {
    expect(
      componentRef('Button', {
        variant: 'primary',
        size: 'sm',
        state: 'default',
      }),
    ).toEqual({
      componentRef: 'Button',
      properties: { variant: 'primary', size: 'sm', state: 'default' },
    });
    expect(slot('Button', 'leadingIcon')).toBe('leadingIcon');
    expect(variantProperty('Button', 'size')).toBe('size');
    expect(designSlot('Button', 'leadingIcon')).toEqual({
      'data-design-slot': 'leadingIcon',
    });
  });

  it('builds project catalog refs through typed resource definitions', () => {
    const [icons, nevoMark] = resourceCatalogsOfKind(projectResourceCatalogs, 'asset');
    const [typography] = resourceCatalogsOfKind(projectResourceCatalogs, 'text-style');
    expect(icons.setStableId).toBe('Icon/set');
    expect(icons.items.map((item) => item.resourceRef)).toContain('Icon/branch/md');
    expect(nevoMark.setStableId).toBe('NevoMarkAsset/set');
    expect(nevoMark.items.map((item) => item.resourceRef)).toEqual([
      'NevoMarkAsset/brand',
      'NevoMarkAsset/monochrome',
    ]);
    expect(typography.setStableId).toBe('Typography/set');
    expect(typography.items.map((item) => item.resourceRef)).toContain('Typography/label-md');
    expect(projectResourceCatalogs.map((catalog) => catalog.kind)).toEqual([
      'asset',
      'asset',
      'text-style',
    ]);
  });
});

