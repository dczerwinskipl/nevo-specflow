import { describe, expect, it } from 'vitest';

import { defineResource } from '../src/index.js';

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
    ).toThrowError(/Resource name must not contain/);

    expect(() =>
      defineResource({
        name: 'order',
        capabilities: { View: 'item.view' },
      }),
    ).toThrowError(/Capability action 'View' must not contain/);
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
});
