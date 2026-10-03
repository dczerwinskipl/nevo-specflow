import { describe, expect, it } from 'vitest';

import { defineResource } from './resource';

describe('defineResource', () => {
  it('qualifies feature-owned capability ids', () => {
    const resource = defineResource({
      name: 'order',
      capabilities: {
        View: 'view',
        Manage: 'manage',
      },
    });

    expect(resource).toMatchObject({
      name: 'order',
      capabilities: {
        View: 'order.view',
        Manage: 'order.manage',
      },
    });
    expect(resource.capabilityIds).toEqual(['order.view', 'order.manage']);
  });

  it('rejects invalid resource and capability segments', () => {
    expect(() =>
      defineResource({
        name: 'order.item',
        capabilities: { View: 'view' },
      }),
    ).toThrowError(/Resource name must contain only letters/);

    expect(() =>
      defineResource({
        name: 'order',
        capabilities: { View: 'item.view' },
      }),
    ).toThrowError(/Capability action 'View' must contain only letters/);
  });

  it('rejects duplicate qualified capabilities', () => {
    expect(() =>
      defineResource({
        name: 'order',
        capabilities: {
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
        capabilities: { View: 'view' },
      }),
    ).toThrowError(/must contain only letters/);

    expect(() =>
      defineResource({
        name: 'order',
        capabilities: { View: 'view details' },
      }),
    ).toThrowError(/must contain only letters/);
  });
});
