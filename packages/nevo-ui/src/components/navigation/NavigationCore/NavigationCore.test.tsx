import { describe, expect, it, vi } from 'vitest';
import {
  createNavigationTreeState,
  normalizeExpandedKeys,
  resolveInitialExpandedKeys,
  type NavigationAdapter,
  type NavigationNode,
} from './index';

interface Target {
  href: string;
}

const deepNodes = [
  {
    key: 'workspace',
    label: 'Workspace',
    children: [
      { key: 'customers', label: 'Customers', target: { href: '#customers' } },
      {
        key: 'operations',
        label: 'Operations',
        children: [
          {
            key: 'regions',
            label: 'Regions',
            children: [{ key: 'poland', label: 'Poland', target: { href: '#poland' } }],
          },
        ],
      },
    ],
  },
  { key: 'archive', label: 'Archive', target: { href: '#archive' } },
] as const satisfies readonly NavigationNode<Target>[];

function adapter(activeKey: string): NavigationAdapter<Target> {
  return {
    match: (node) => (node.key === activeKey ? 'active' : 'none'),
    renderLink: ({ children, className, isActive, node }) => (
      <a
        aria-current={isActive ? 'page' : undefined}
        className={className}
        href={node.target?.href}
      >
        {children}
      </a>
    ),
  };
}

describe('Navigation Core', () => {
  it('indexes arbitrary depth and derives the complete active ancestor path', () => {
    const match = vi.fn((node: NavigationNode<Target>) =>
      node.key === 'poland' ? ('active' as const) : ('none' as const),
    );
    const tree = createNavigationTreeState<Target>(deepNodes, { match });

    expect([...tree.nodesByKey.keys()]).toEqual([
      'workspace',
      'customers',
      'operations',
      'regions',
      'poland',
      'archive',
    ]);
    expect([...tree.activeKeys]).toEqual(['poland']);
    expect([...tree.ancestorKeys]).toEqual(['regions', 'operations', 'workspace']);
    expect(tree.ancestorKeys.has('customers')).toBe(false);
    expect(tree.ancestorKeys.has('archive')).toBe(false);
    expect(match).toHaveBeenCalledTimes(6);
  });

  it('preserves explicit adapter ancestor matches without pathname assumptions', () => {
    const tree = createNavigationTreeState<Target>(deepNodes, {
      match: (node) => (node.key === 'workspace' ? 'ancestor' : 'none'),
    });

    expect([...tree.activeKeys]).toEqual([]);
    expect([...tree.ancestorKeys]).toEqual(['workspace']);
  });

  it('orders expansion by tree order and ignores leaf or unknown keys', () => {
    const tree = createNavigationTreeState<Target>(deepNodes, adapter('poland'));

    expect(normalizeExpandedKeys(tree, ['regions', 'missing', 'workspace', 'customers'])).toEqual([
      'workspace',
      'regions',
    ]);
    expect(resolveInitialExpandedKeys(tree, ['operations'])).toEqual([
      'workspace',
      'operations',
      'regions',
    ]);
  });

  it('rejects duplicate consumer keys with both full paths', () => {
    expect(() =>
      createNavigationTreeState<Target>(
        [
          { key: 'root-a', label: 'A', children: [{ key: 'duplicate', label: 'First' }] },
          { key: 'root-b', label: 'B', children: [{ key: 'duplicate', label: 'Second' }] },
        ],
        { match: () => 'none' },
      ),
    ).toThrow(
      'Duplicate navigation key "duplicate" at "root-b > duplicate"; first declared at "root-a > duplicate".',
    );
  });
});

