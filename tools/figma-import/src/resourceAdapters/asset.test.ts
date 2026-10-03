import { describe, expect, it } from 'vitest';
import { assetMaterializationIntent, dispatchAssetRepresentation } from './asset';

describe('asset representation materialization', () => {
  it('keeps raw SVG appearance without mask or tint layers', () => {
    expect(assetMaterializationIntent('svg')).toEqual({
      kind: 'svg',
      preservesAppearance: true,
      usesMask: false,
      usesTintLayer: false,
    });
  });

  it('uses a mask and explicit tint layer only for svg-mask', () => {
    expect(assetMaterializationIntent('svg-mask')).toEqual({
      kind: 'svg-mask',
      preservesAppearance: false,
      usesMask: true,
      usesTintLayer: true,
    });
  });

  it('dispatches the serialized representation to distinct materializers', () => {
    const materializers = {
      svg: () => 'preserved-svg',
      'svg-mask': () => 'mask-with-tint',
    };
    expect(dispatchAssetRepresentation('svg', materializers)).toBe('preserved-svg');
    expect(dispatchAssetRepresentation('svg-mask', materializers)).toBe('mask-with-tint');
  });
});
