import { describe, expect, it } from 'vitest';
import { applyTextSizing, textCaseFromCss, textDecorationFromCss } from './textProjection';

describe('CSS text catalog projection', () => {
  it.each([
    ['none', 'ORIGINAL'],
    ['uppercase', 'UPPER'],
    ['lowercase', 'LOWER'],
    ['capitalize', 'TITLE'],
  ] as const)('maps text-transform %s', (css, figma) => {
    expect(textCaseFromCss(css)).toBe(figma);
  });

  it('maps supported text decorations without depending on token order', () => {
    expect(textDecorationFromCss('line-through')).toBe('STRIKETHROUGH');
    expect(textDecorationFromCss('underline solid')).toBe('UNDERLINE');
    expect(textDecorationFromCss('none')).toBe('NONE');
  });

  it('resets stale Fill state when CSS text returns to intrinsic sizing', () => {
    const node = {
      width: 120,
      height: 20,
      layoutGrow: 1,
      layoutAlign: 'STRETCH',
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
      textAutoResize: 'HEIGHT',
      resizeWithoutConstraints() {},
    } as unknown as TextNode;
    const parent = { layoutMode: 'HORIZONTAL' } as FrameNode;

    applyTextSizing(node, parent, { widthSizing: 'hug', heightSizing: 'hug' });

    expect(node.layoutSizingHorizontal).toBe('HUG');
    expect(node.layoutGrow).toBe(0);
    expect(node.layoutAlign).toBe('INHERIT');
    expect(node.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  });

  it('keeps intentional flex text as Fill', () => {
    const node = {
      width: 120,
      height: 20,
      layoutGrow: 0,
      layoutAlign: 'INHERIT',
      layoutSizingHorizontal: 'HUG',
      layoutSizingVertical: 'HUG',
      textAutoResize: 'WIDTH_AND_HEIGHT',
      resizeWithoutConstraints() {},
    } as unknown as TextNode;
    const parent = { layoutMode: 'HORIZONTAL' } as FrameNode;

    applyTextSizing(node, parent, {
      width: '240px',
      height: '20px',
      widthSizing: 'fill',
      heightSizing: 'hug',
    });

    expect(node.layoutSizingHorizontal).toBe('FILL');
    expect(node.textAutoResize).toBe('HEIGHT');
  });
});
