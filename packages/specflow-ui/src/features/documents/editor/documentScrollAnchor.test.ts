import { describe, expect, it } from 'vitest';
import {
  anchorFromBlocks,
  blockAtTop,
  blockForLine,
  clampAnchor,
  ratioOf,
  type MappedBlock,
} from './documentScrollAnchor';

const block = (line: number, top: number, height: number, span: number): MappedBlock => ({
  line,
  top,
  height,
  span,
});

describe('document scroll anchor', () => {
  it('anchors on the last block that starts at or above the top edge', () => {
    const blocks = [block(1, -300, 100, 2), block(3, -120, 200, 40), block(43, 80, 50, 3)];
    expect(blockAtTop(blocks)?.line).toBe(3);
  });
  it('maps the offset inside a tall block proportionally to its source lines', () => {
    // Half of a 40 line code block (200px tall) is scrolled past: line 3 + 20.
    const anchor = anchorFromBlocks([block(3, -100, 200, 40)], 0.5)!;
    expect(anchor.line).toBe(23);
    expect(anchor.offset).toBeCloseTo(0, 5);
  });
  it('round-trips through blockForLine', () => {
    const blocks = [block(1, -500, 80, 2), block(3, -20, 200, 40), block(43, 180, 30, 2)];
    const anchor = anchorFromBlocks(blocks, 0.3)!;
    const found = blockForLine(blocks, anchor.line!, anchor.offset)!;
    expect(found.block.line).toBe(3);
    expect(found.through).toBeCloseTo(0.1, 2);
  });
  it('clamps a remembered line to the shortened document and keeps ratio fallbacks bounded', () => {
    expect(clampAnchor({ line: 300, offset: 0.4, ratio: 2 }, 60)).toEqual({
      line: 60,
      offset: 0,
      ratio: 1,
    });
    expect(clampAnchor({ offset: 0.4, ratio: 0.5 }, 60).line).toBeUndefined();
    expect(ratioOf(50, 300, 100)).toBe(0.25);
    expect(ratioOf(0, 90, 100)).toBe(0);
  });
});
