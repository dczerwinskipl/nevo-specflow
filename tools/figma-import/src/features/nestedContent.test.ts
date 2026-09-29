import { describe, expect, it, vi } from 'vitest';
import type { NestedComponentIR, SlotIR } from '../core/model';
import {
  applyNestedLayerSizing,
  applyNestedPresentation,
  applyNestedSizing,
  configureNestedElementFrame,
  materializeStructure,
  syncNestedChildren,
} from './nestedContent';

describe('nested element box reconciliation', () => {
  it('restores measured geometry and fill sizing on an existing frame', () => {
    const frame = {
      width: 24,
      height: 24,
      layoutMode: 'NONE',
      layoutWrap: 'NO_WRAP',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'AUTO',
      minWidth: null,
      minHeight: null,
      maxWidth: null,
      maxHeight: null,
      fills: [],
      strokes: [],
      strokeWeight: 0,
      strokeTopWeight: 0,
      strokeRightWeight: 0,
      strokeBottomWeight: 0,
      strokeLeftWeight: 0,
      strokeAlign: 'CENTER',
      topLeftRadius: 0,
      topRightRadius: 0,
      bottomRightRadius: 0,
      bottomLeftRadius: 0,
      opacity: 1,
      clipsContent: false,
      layoutGrow: 0,
      layoutAlign: 'INHERIT',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      resizeWithoutConstraints(
        this: { width: number; height: number },
        width: number,
        height: number,
      ) {
        this.width = width;
        this.height = height;
      },
    } as unknown as FrameNode;
    const parent = { layoutMode: 'VERTICAL' } as FrameNode;

    configureNestedElementFrame(
      frame,
      {
        kind: 'element',
        name: 'generic-grid',
        style: {
          display: 'grid',
          width: '262px',
          height: '120px',
          widthSizing: 'fill',
          heightSizing: 'fixed',
          backgroundColor: 'rgba(0, 0, 0, 0)',
        },
        children: [],
      },
      parent,
      { resources: { colors: [] } } as never,
      { colors: new Map(), textStyles: new Map(), assets: new Map() },
    );

    expect(frame.width).toBe(262);
    expect(frame.height).toBe(120);
    expect(frame.layoutSizingHorizontal).toBe('FILL');
    expect(frame.layoutAlign).toBe('STRETCH');
  });
});

describe('slot-ref materialization', () => {
  it('preserves semantic text style and color references from a text slot', () => {
    const slot: Extract<SlotIR, { kind: 'text' }> = {
      kind: 'text',
      text: 'Semantic label',
      textStyleRef: 'text-style/opaque',
      colorRef: 'color/opaque',
      style: { color: 'rgb(10, 20, 30)' },
      bindings: { content: 'color/opaque' },
    };

    expect(materializeStructure([{ kind: 'slot-ref', name: 'label' }], { label: slot })).toEqual([
      {
        kind: 'text',
        text: 'Semantic label',
        textStyleRef: 'text-style/opaque',
        colorRef: 'color/opaque',
        style: { color: 'rgb(10, 20, 30)' },
        bindings: { content: 'color/opaque' },
      },
    ]);
  });

  it('moves the existing property-owning slot node into captured nested anatomy', async () => {
    const first = {
      type: 'FRAME',
      getPluginData: () => '',
    } as unknown as FrameNode;
    const second = {
      type: 'FRAME',
      getPluginData: () => '',
    } as unknown as FrameNode;
    const children: SceneNode[] = [second, first];
    const parent = {
      children,
      layoutMode: 'HORIZONTAL',
      insertChild(index: number, node: SceneNode) {
        const current = children.indexOf(node);
        if (current >= 0) children.splice(current, 1);
        children.splice(index, 0, node);
      },
    } as unknown as FrameNode;

    await syncNestedChildren(
      parent,
      [
        { kind: 'slot-ref', name: 'first' },
        { kind: 'slot-ref', name: 'second' },
      ],
      new Map(),
      'Component/default/structure',
      { components: {} } as never,
      { colors: new Map(), textStyles: new Map(), assets: new Map() },
      vi.fn(),
      new Map([
        ['first', first],
        ['second', second],
      ]),
    );

    expect(children).toEqual([first, second]);
  });
});

describe('nested instance sizing', () => {
  const parent = { layoutMode: 'HORIZONTAL' } as FrameNode;

  it.each([
    ['fixed', 'FIXED'],
    ['hug', 'HUG'],
    ['fill', 'FILL'],
  ] as const)('projects %s sizing for a nested asset', (sizing, expected) => {
    const asset = {
      layoutMode: 'HORIZONTAL',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
    } as InstanceNode;
    applyNestedLayerSizing(asset, { widthSizing: sizing, heightSizing: sizing }, parent);
    expect(asset.layoutSizingHorizontal).toBe(expected);
    expect(asset.layoutSizingVertical).toBe(expected);
  });

  it('resets stale Fill to fixed and then Hug on reimport', () => {
    const asset = {
      layoutMode: 'HORIZONTAL',
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'FILL',
    } as InstanceNode;
    applyNestedLayerSizing(asset, { widthSizing: 'fixed', heightSizing: 'fixed' }, parent);
    expect(asset.layoutSizingHorizontal).toBe('FIXED');
    expect(asset.layoutSizingVertical).toBe('FIXED');
    applyNestedLayerSizing(asset, { widthSizing: 'hug', heightSizing: 'hug' }, parent);
    expect(asset.layoutSizingHorizontal).toBe('HUG');
    expect(asset.layoutSizingVertical).toBe('HUG');
  });

  it('keeps Hug fixed when the nested instance uses free positioning', () => {
    const asset = {
      layoutMode: 'NONE',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
    } as InstanceNode;

    applyNestedLayerSizing(asset, { widthSizing: 'hug', heightSizing: 'hug' }, parent);

    expect(asset.layoutSizingHorizontal).toBe('FIXED');
    expect(asset.layoutSizingVertical).toBe('FIXED');
  });

  it('keeps an absolutely positioned fill asset fixed', () => {
    const asset = {} as InstanceNode;
    applyNestedLayerSizing(
      asset,
      {
        position: 'absolute',
        widthSizing: 'fill',
        heightSizing: 'fill',
      },
      parent,
    );
    expect(asset.layoutSizingHorizontal).toBe('FIXED');
    expect(asset.layoutSizingVertical).toBe('FIXED');
  });

  it('keeps an absolutely positioned Hug component fixed at its captured viewport height', () => {
    const resizeWithoutConstraints = vi.fn(function (
      this: { width: number; height: number },
      width: number,
      height: number,
    ) {
      this.width = width;
      this.height = height;
    });
    const instance = {
      width: 480,
      height: 720,
      layoutSizingHorizontal: 'HUG',
      layoutSizingVertical: 'HUG',
      resizeWithoutConstraints,
    } as unknown as InstanceNode;
    const drawer = {
      componentRef: 'opaque-overlay-component',
      properties: {},
      slots: {},
      style: {
        position: 'absolute',
        width: '480px',
        height: '900px',
        widthSizing: 'fixed',
        heightSizing: 'hug',
      },
    } satisfies NestedComponentIR;

    applyNestedSizing(instance, drawer, parent);

    expect(resizeWithoutConstraints).toHaveBeenCalledWith(480, 900);
    expect(instance.width).toBe(480);
    expect(instance.height).toBe(900);
    expect(instance.layoutSizingHorizontal).toBe('FIXED');
    expect(instance.layoutSizingVertical).toBe('FIXED');
  });
});

describe('nested instance presentation', () => {
  it('neutralizes the inherited component surface for a contextual composition', () => {
    const instance = {
      width: 248,
      height: 34,
      layoutMode: 'VERTICAL',
      layoutWrap: 'NO_WRAP',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      itemSpacing: 8,
      paddingTop: 10,
      paddingRight: 10,
      paddingBottom: 10,
      paddingLeft: 10,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      strokes: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      strokeTopWeight: 1,
      strokeRightWeight: 1,
      strokeBottomWeight: 1,
      strokeLeftWeight: 1,
      strokeAlign: 'INSIDE',
      topLeftRadius: 6,
      topRightRadius: 6,
      bottomRightRadius: 6,
      bottomLeftRadius: 6,
      opacity: 1,
      clipsContent: false,
    } as unknown as InstanceNode;

    applyNestedPresentation(instance, {
      display: 'block',
      flowDirection: 'vertical',
      width: '248px',
      height: '34px',
      paddingTop: '0px',
      paddingRight: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      gap: '0px',
      overflow: 'clip',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderTopWidth: '0px',
      borderRightWidth: '0px',
      borderBottomWidth: '0px',
      borderLeftWidth: '0px',
      borderTopColor: 'rgb(243, 244, 246)',
      borderRightColor: 'rgb(243, 244, 246)',
      borderBottomColor: 'rgb(243, 244, 246)',
      borderLeftColor: 'rgb(243, 244, 246)',
      borderRadius: '0px',
      opacity: '1',
    });

    expect(instance.paddingTop).toBe(0);
    expect(instance.paddingRight).toBe(0);
    expect(instance.paddingBottom).toBe(0);
    expect(instance.paddingLeft).toBe(0);
    expect(instance.fills).toEqual([expect.objectContaining({ type: 'SOLID', opacity: 0 })]);
    expect(instance.strokes).toEqual([]);
    expect(instance.strokeTopWeight).toBe(0);
    expect(instance.strokeRightWeight).toBe(0);
    expect(instance.strokeBottomWeight).toBe(0);
    expect(instance.strokeLeftWeight).toBe(0);
    expect(instance.topLeftRadius).toBe(0);
    expect(instance.topRightRadius).toBe(0);
    expect(instance.bottomRightRadius).toBe(0);
    expect(instance.bottomLeftRadius).toBe(0);
    expect(instance.clipsContent).toBe(true);
  });

  it('projects a contextual field surface instead of retaining stale instance values', () => {
    const instance = {
      width: 384,
      height: 36,
      layoutMode: 'VERTICAL',
      layoutWrap: 'NO_WRAP',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [],
      strokes: [],
      strokeTopWeight: 0,
      strokeRightWeight: 0,
      strokeBottomWeight: 0,
      strokeLeftWeight: 0,
      strokeAlign: 'INSIDE',
      topLeftRadius: 0,
      topRightRadius: 0,
      bottomRightRadius: 0,
      bottomLeftRadius: 0,
      opacity: 1,
      clipsContent: false,
    } as unknown as InstanceNode;

    applyNestedPresentation(instance, {
      display: 'block',
      flowDirection: 'vertical',
      paddingTop: '0px',
      paddingRight: '10px',
      paddingBottom: '0px',
      paddingLeft: '10px',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      borderTopWidth: '1px',
      borderRightWidth: '1px',
      borderBottomWidth: '1px',
      borderLeftWidth: '1px',
      borderTopColor: 'rgb(239, 68, 68)',
      borderRightColor: 'rgb(239, 68, 68)',
      borderBottomColor: 'rgb(239, 68, 68)',
      borderLeftColor: 'rgb(239, 68, 68)',
      borderRadius: '6px',
      opacity: '0.6',
    });

    expect(instance.paddingRight).toBe(10);
    expect(instance.paddingLeft).toBe(10);
    expect(instance.fills).toEqual([expect.objectContaining({ type: 'SOLID', opacity: 0.03 })]);
    expect(instance.strokes).toEqual([expect.objectContaining({ type: 'SOLID' })]);
    expect(instance.strokeTopWeight).toBe(1);
    expect(instance.topLeftRadius).toBe(6);
    expect(instance.opacity).toBe(0.6);
  });
});

