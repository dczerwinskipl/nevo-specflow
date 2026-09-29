import { describe, expect, it, vi } from 'vitest';
import { DATA_KEY, MANAGED_KEY } from '../core/model';
import {
  applyPublicSlotSizing,
  findPublicSlotNode,
  recoverPublicSlotNodes,
} from './componentSlots';

function managedNode(type: SceneNode['type'], stableId: string) {
  const node = {
    type,
    parent: undefined as ChildrenMixin | undefined,
    getPluginData: (key: string) =>
      key === MANAGED_KEY ? 'true' : key === DATA_KEY ? stableId : '',
    remove: vi.fn(function (this: { parent?: { children: SceneNode[] } }) {
      const index = this.parent?.children.indexOf(this as unknown as SceneNode) ?? -1;
      if (index >= 0) this.parent?.children.splice(index, 1);
    }),
  } as unknown as SceneNode;
  return node;
}

describe('public slot recovery', () => {
  it('hoists one existing nested slot and removes stale duplicates before reconfiguration', () => {
    const stableId = 'Alert/info/slot/title';
    const nested = managedNode('TEXT', stableId);
    const duplicate = managedNode('TEXT', stableId);
    const structure = { children: [nested] } as unknown as FrameNode;
    (nested as unknown as { parent: FrameNode }).parent = structure;
    const children: SceneNode[] = [structure, duplicate];
    const component = {
      type: 'COMPONENT',
      children,
      findAll: () => [nested, duplicate],
      appendChild(node: SceneNode) {
        const oldParent = node.parent as unknown as { children?: SceneNode[] } | undefined;
        const oldIndex = oldParent?.children?.indexOf(node) ?? -1;
        if (oldIndex >= 0) oldParent?.children?.splice(oldIndex, 1);
        const current = children.indexOf(node);
        if (current >= 0) children.splice(current, 1);
        children.push(node);
        (node as unknown as { parent: ComponentNode }).parent = this as ComponentNode;
      },
    } as unknown as ComponentNode;
    (duplicate as unknown as { parent: ComponentNode }).parent = component;

    recoverPublicSlotNodes(
      component,
      {
        stableId: 'Alert/info',
        component: 'Alert',
        sourceId: 'info',
        properties: { tone: 'info' },
        root: {},
        bindings: {},
        slots: {},
      },
      {
        component: 'Alert',
        order: 1,
        variantProperties: ['tone'],
        propertyValues: { tone: ['info'] },
        slots: { title: { kind: 'text', propertyName: 'Title', defaultText: 'Title' } },
      },
    );

    expect(duplicate.remove).toHaveBeenCalledOnce();
    expect(structure.children).toEqual([]);
    expect(component.children).toContain(nested);
    expect(component.children).not.toContain(duplicate);
  });

  it('restores Fill sizing after a public slot moves into a horizontal control', () => {
    const slot = {
      layoutMode: 'HORIZONTAL',
      layoutGrow: 0,
      layoutAlign: 'INHERIT',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
    } as unknown as FrameNode;
    const control = { layoutMode: 'HORIZONTAL' } as FrameNode;

    applyPublicSlotSizing(
      slot,
      {
        position: 'static',
        widthSizing: 'fill',
        heightSizing: 'fixed',
      },
      control,
    );

    expect(slot.layoutGrow).toBe(1);
    expect(slot.layoutAlign).toBe('INHERIT');
    expect(slot.layoutSizingHorizontal).toBe('FILL');
    expect(slot.layoutSizingVertical).toBe('FIXED');
  });

  it('finds a public slot after captured anatomy moves it below the component root', () => {
    const nested = managedNode('FRAME', 'NumberInput/default/shown/slot/input');
    const component = {
      type: 'COMPONENT',
      children: [],
      findAll: () => [nested],
    } as unknown as ComponentNode;

    expect(
      findPublicSlotNode(
        component,
        {
          stableId: 'NumberInput/default/shown',
          component: 'NumberInput',
          sourceId: 'default-shown',
          properties: { state: 'default', steppers: 'shown' },
          root: {},
          bindings: {},
          slots: {},
        },
        'input',
        'FRAME',
      ),
    ).toBe(nested);
  });
});

