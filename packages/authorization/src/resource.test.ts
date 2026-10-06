import { describe, expect, it } from 'vitest';

import { defineResource } from './resource';

describe('defineResource', () => {
  it('qualifies feature-owned capability ids while preserving action ids', () => {
    const resource = defineResource({
      name: 'order',
      actions: {
        View: 'view',
        Manage: 'manage',
      },
    });

    expect(resource).toEqual({
      name: 'order',
      actions: {
        View: 'view',
        Manage: 'manage',
      },
      capabilities: {
        View: 'order.view',
        Manage: 'order.manage',
      },
    });
  });

  it('rejects invalid resource and capability segments', () => {
    expect(() =>
      defineResource({
        name: 'order.item',
        actions: { View: 'view' },
      }),
    ).toThrowError(/Resource name must contain only letters/);

    expect(() =>
      defineResource({
        name: 'order',
        actions: { View: 'item.view' },
      }),
    ).toThrowError(/Capability action 'View' must contain only letters/);
  });

  it('rejects duplicate qualified capabilities', () => {
    expect(() =>
      defineResource({
        name: 'order',
        actions: {
          View: 'view',
          Read: 'view',
        },
      }),
    ).toThrowError(/duplicate capability 'order.view'/);
  });

  it('rejects non-canonical resource and capability identifier segments', () => {
    expect(() =>
      defineResource({
        name: ' order',
        actions: { View: 'view' },
      }),
    ).toThrowError(/must contain only letters/);

    expect(() =>
      defineResource({
        name: 'order',
        actions: { View: 'view details' },
      }),
    ).toThrowError(/must contain only letters/);
  });
});
