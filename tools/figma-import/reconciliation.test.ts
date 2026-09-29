import { describe, expect, it } from 'vitest';
import { reconciliationPlan, shouldRemoveManagedNode } from './reconciliation';

describe('managed reconciliation', () => {
  it('removes stale variants while preserving expected and unmanaged content', () => {
    expect(reconciliationPlan(['Button/a', 'Button/b'], ['Button/a', 'Button/old'])).toEqual({
      create: ['Button/b'],
      retain: ['Button/a'],
      remove: ['Button/old'],
    });
  });

  it('applies equally to Icon and Typography stable IDs', () => {
    expect(
      reconciliationPlan(['Icon/search/md'], ['Icon/search/md', 'Icon/old/md']).remove,
    ).toEqual(['Icon/old/md']);
    expect(
      reconciliationPlan(['Typography/body-md'], ['Typography/body-md', 'Typography/old']).remove,
    ).toEqual(['Typography/old']);
  });

  it('is idempotent after the first plan is applied', () => {
    const expected = ['A', 'B'];
    const first = reconciliationPlan(expected, ['A', 'old']);
    const afterFirst = [...first.retain, ...first.create];
    expect(reconciliationPlan(expected, afterFirst)).toEqual({
      create: [],
      retain: ['A', 'B'],
      remove: [],
    });
  });

  it('removes only stale managed nodes and preserves manual Figma content', () => {
    const expected = new Set(['Button/current']);
    const removable = new Set(['FRAME']);
    expect(
      shouldRemoveManagedNode(
        { stableId: 'Button/old', managed: true, type: 'FRAME' },
        expected,
        removable,
      ),
    ).toBe(true);
    expect(
      shouldRemoveManagedNode(
        { stableId: 'Button/current', managed: true, type: 'FRAME' },
        expected,
        removable,
      ),
    ).toBe(false);
    expect(
      shouldRemoveManagedNode(
        { stableId: 'manual-layer', managed: false, type: 'FRAME' },
        expected,
        removable,
      ),
    ).toBe(false);
    expect(
      shouldRemoveManagedNode(
        { stableId: 'Button/old-component', managed: true, type: 'COMPONENT' },
        expected,
        removable,
      ),
    ).toBe(false);
  });
});

