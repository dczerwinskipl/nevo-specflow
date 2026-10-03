import { describe, expect, it } from 'vitest';
import type { NestedLayerIR } from '@nevo/figma-core/ir';
import { nestedStableIds } from './nestedIdentity';

const component = (componentRef: string): NestedLayerIR => ({
  componentRef,
  properties: {},
  slots: {},
});

describe('nested semantic identity', () => {
  it('survives insertion of an unrelated sibling', () => {
    const before = nestedStableIds('Card/default', [component('Icon'), component('Typography')]);
    const after = nestedStableIds('Card/default', [
      component('Button'),
      component('Icon'),
      component('Typography'),
    ]);
    expect(after[1]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);
  });

  it('uses occurrence only among repeated semantic siblings', () => {
    expect(
      nestedStableIds('List/default', [component('Typography'), component('Typography')]),
    ).toEqual([
      'List/default/child/component/Typography',
      'List/default/child/component/Typography~2',
    ]);
  });

  it('keeps keyed repeated siblings stable across insertion and reordering', () => {
    const keyed = (key: string): NestedLayerIR => ({
      componentRef: 'ExampleTaskRow',
      identity: { key },
      properties: {},
      slots: {},
    });
    const before = nestedStableIds('Tasks/default', [keyed('task-05'), keyed('task-06')]);
    const after = nestedStableIds('Tasks/default', [
      keyed('task-07'),
      keyed('task-06'),
      keyed('task-05'),
    ]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[0]);
  });

  it('keeps human layer names separate from machine identity', () => {
    const named: NestedLayerIR = {
      kind: 'element',
      name: 'Header',
      identity: { layer: 'Header' },
      style: {},
      children: [],
    };
    const keyed: NestedLayerIR = { ...named, identity: { key: 'header', layer: 'Renamed header' } };

    expect(nestedStableIds('Card/default', [named])).toEqual([
      'Card/default/child/anonymous-0/element',
    ]);
    expect(nestedStableIds('Card/default', [keyed])).toEqual(['Card/default/child/key/header']);
  });

  it('keeps the legacy typography-flow ID for the new canonical rich-text node', () => {
    const rich: NestedLayerIR = {
      kind: 'text',
      text: 'A B',
      style: {},
      runs: [
        { start: 0, end: 1, textStyleRef: 'Typography/body-md' },
        { start: 2, end: 3, textStyleRef: 'Typography/body-md' },
      ],
    };
    expect(nestedStableIds('History/summary', [rich])).toEqual([
      'History/summary/child/typography-flow',
    ]);
  });
});
