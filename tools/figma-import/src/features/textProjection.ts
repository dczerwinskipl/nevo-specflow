import type { ComputedStyle } from '../core/model';
import { px } from '../core/figmaNodes';

export function textCaseFromCss(value: string | undefined): TextCase {
  if (value === 'uppercase') return 'UPPER';
  if (value === 'lowercase') return 'LOWER';
  if (value === 'capitalize') return 'TITLE';
  return 'ORIGINAL';
}

export function textDecorationFromCss(value: string | undefined): TextDecoration {
  const decorations = new Set((value ?? '').split(/\s+/));
  if (decorations.has('line-through')) return 'STRIKETHROUGH';
  if (decorations.has('underline')) return 'UNDERLINE';
  return 'NONE';
}

/** Apply whole-flow CSS properties without flattening rich-text range metrics. */
export function applyTextFlowPresentation(node: TextNode, style: ComputedStyle) {
  node.textCase = textCaseFromCss(style.textTransform);
  node.textDecoration = textDecorationFromCss(style.textDecorationLine);
  node.textAlignHorizontal =
    style.textAlign === 'center'
      ? 'CENTER'
      : style.textAlign === 'right' || style.textAlign === 'end'
        ? 'RIGHT'
        : 'LEFT';
}

/** Apply computed CSS text properties that may intentionally override a linked text style. */
export function applyTextPresentation(node: TextNode, style: ComputedStyle) {
  node.fontSize = px(style.fontSize, typeof node.fontSize === 'number' ? node.fontSize : 14);
  node.lineHeight =
    style.lineHeight === 'normal'
      ? { unit: 'AUTO' }
      : { unit: 'PIXELS', value: px(style.lineHeight, px(style.fontSize, 14)) };
  node.letterSpacing = { unit: 'PIXELS', value: px(style.letterSpacing) };
  applyTextFlowPresentation(node, style);
}

/**
 * Project CSS intrinsic/flex sizing onto a Figma Auto Layout child.
 * Explicitly reset stale sizing so repeated imports converge after a component
 * used to be Fill and later becomes Hug.
 */
export function applyTextSizing(
  node: TextNode,
  parent: FrameNode | SlotNode | ComponentNode,
  style: ComputedStyle,
) {
  const inAutoLayout = parent.layoutMode !== 'NONE';
  const widthSizing = style.widthSizing ?? 'hug';
  const heightSizing = style.heightSizing ?? 'hug';
  const fixedWidth = Math.max(px(style.width, node.width), 1);
  const fixedHeight = Math.max(px(style.height, node.height), 1);

  node.layoutGrow = 0;
  node.layoutAlign = 'INHERIT';

  if (widthSizing === 'hug') {
    node.textAutoResize = heightSizing === 'fixed' ? 'NONE' : 'WIDTH_AND_HEIGHT';
    if (heightSizing === 'fixed') node.resizeWithoutConstraints(fixedWidth, fixedHeight);
  } else {
    node.textAutoResize = 'NONE';
    node.resizeWithoutConstraints(fixedWidth, fixedHeight);
    if (heightSizing !== 'fixed') node.textAutoResize = 'HEIGHT';
  }

  if (!inAutoLayout) {
    node.layoutSizingHorizontal = 'FIXED';
    node.layoutSizingVertical = 'FIXED';
    return;
  }

  node.layoutSizingHorizontal =
    widthSizing === 'fill' ? 'FILL' : widthSizing === 'hug' ? 'HUG' : 'FIXED';
  node.layoutSizingVertical =
    heightSizing === 'fill' ? 'FILL' : heightSizing === 'hug' ? 'HUG' : 'FIXED';
}
