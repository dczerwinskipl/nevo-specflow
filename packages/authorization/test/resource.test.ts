import { describe, expect, it } from 'vitest';

import { defineResource } from '../src/index.js';

describe('defineResource', () => {
  it('qualifies feature-owned capability ids', () => {
    const resource = defineResource({
      name: 'spec',
      capabilities: {
        View: 'view',
        Manage: 'manage',
      },
    });

    expect(resource).toMatchObject({
      name: 'spec',
      capabilities: {
        View: 'spec.view',
        Manage: 'spec.manage',
      },
    });
    expect(resource.capabilityIds).toEqual(['spec.view', 'spec.manage']);
  });

  it('rejects invalid resource and capability segments', () => {
    expect(() =>
      defineResource({
        name: 'spec.item',
        capabilities: { View: 'view' },
      }),
    ).toThrowError(/Resource name must not contain/);

    expect(() =>
      defineResource({
        name: 'spec',
        capabilities: { View: 'item.view' },
      }),
    ).toThrowError(/Capability action 'View' must not contain/);
  });

  it('rejects duplicate qualified capabilities', () => {
    expect(() =>
      defineResource({
        name: 'spec',
        capabilities: {
          View: 'view',
          Read: 'view',
        },
      }),
    ).toThrowError(/duplicate capability 'spec.view'/);
  });
});
