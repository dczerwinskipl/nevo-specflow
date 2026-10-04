import { describe, expect, it } from 'vitest';
import { resolveFloatingWindowLayout } from './floatingWindowLayout';

function entry(id: string, sequence: number, lastActivatedAt = 0) {
  return { id, sequence, lastActivatedAt };
}

describe('resolveFloatingWindowLayout', () => {
  it('shows up to maxVisible and overflows the rest', () => {
    const result = resolveFloatingWindowLayout({
      entries: [entry('1', 0), entry('2', 1), entry('3', 2), entry('4', 3), entry('5', 4)],
      expandedId: null,
      activeId: null,
      maxVisible: 3,
    });

    expect(result.visibleIds).toEqual(['1', '2', '3']);
    expect(result.overflowIds).toEqual(['4', '5']);
  });

  it('fills a freed visible slot from overflow', () => {
    const result = resolveFloatingWindowLayout({
      entries: [entry('1', 0), entry('3', 2), entry('4', 3), entry('5', 4)],
      expandedId: null,
      activeId: null,
      maxVisible: 3,
    });

    expect(result.visibleIds).toEqual(['1', '3', '4']);
    expect(result.overflowIds).toEqual(['5']);
  });

  it('promotes the active hidden window without evicting the expanded window', () => {
    const result = resolveFloatingWindowLayout({
      entries: [entry('1', 0, 10), entry('2', 1, 9), entry('3', 2, 8), entry('4', 3, 20)],
      expandedId: '1',
      activeId: '4',
      maxVisible: 3,
    });

    expect(result.visibleIds).toContain('1');
    expect(result.visibleIds).toContain('4');
    expect(result.visibleIds).toHaveLength(3);
  });

  it('supports a configurable visible limit', () => {
    const result = resolveFloatingWindowLayout({
      entries: [entry('1', 0), entry('2', 1), entry('3', 2)],
      expandedId: null,
      activeId: null,
      maxVisible: 2,
    });

    expect(result.visibleIds).toEqual(['1', '2']);
    expect(result.overflowIds).toEqual(['3']);
  });
});
