import { describe, expect, it } from 'vitest';
import { listboxIndex } from './listboxKeys';

describe('listboxIndex', () => {
  it('moves down and up, wrapping at the ends', () => {
    expect(listboxIndex('ArrowDown', 0, 3)).toBe(1);
    expect(listboxIndex('ArrowDown', 2, 3)).toBe(0);
    expect(listboxIndex('ArrowUp', 0, 3)).toBe(2);
  });

  it('goes to the first and the last option', () => {
    expect(listboxIndex('Home', 2, 3)).toBe(0);
    expect(listboxIndex('End', 0, 3)).toBe(2);
  });

  it('leaves other keys (horizontal arrows included) and an empty list alone', () => {
    expect(listboxIndex('ArrowRight', 0, 3)).toBeNull();
    expect(listboxIndex('Enter', 0, 3)).toBeNull();
    expect(listboxIndex('ArrowDown', 0, 0)).toBeNull();
  });
});
