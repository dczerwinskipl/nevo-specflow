import {
  applyCornerRadii,
  applyGeometryOverride,
  applyPaint,
  applyStroke,
  bindPaintVariable,
  geometryFor,
  px,
} from '../core/figmaNodes';
import {
  type AutoLayoutNode,
  type ComponentCaptureIR,
  type FigmaComponentDefinition,
  type ComputedStyle,
  type DesignSystemIR,
  type DesignResources,
  type DesignValue,
  type RenderRootNode,
} from '../core/model';
import { colorVariableFor } from './documentResources';
import { selectCanonicalCaptures } from '../../plan';
export function componentDisplayName(
  spec: Pick<FigmaComponentDefinition, 'component' | 'displayName'>,
) {
  return spec.displayName ?? spec.component;
}

export function stableIdForProperties(
  spec: FigmaComponentDefinition,
  properties: Record<string, DesignValue>,
) {
  return `${spec.component}/${spec.variantProperties.map((name) => String(properties[name])).join('/')}`;
}

export function variantName(spec: FigmaComponentDefinition, capture: ComponentCaptureIR) {
  return spec.variantProperties
    .map(
      (property) =>
        `${property.charAt(0).toUpperCase()}${property.slice(1)}=${String(capture.properties[property])}`,
    )
    .join(', ');
}

export function canonicalCaptures(spec: FigmaComponentDefinition, captures: ComponentCaptureIR[]) {
  void spec;
  return selectCanonicalCaptures(captures, spec.target !== 'fragment' && spec.target !== 'screen');
}

export function align(value: string | undefined): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  if (value === 'center' || value === 'middle') return 'CENTER';
  if (value === 'flex-end' || value === 'end') return 'MAX';
  if (value === 'space-between') return 'SPACE_BETWEEN';
  return 'MIN';
}

export function applyAutoLayout(node: AutoLayoutNode, style: ComputedStyle) {
  if (style.layoutProjection === 'measured') {
    node.layoutMode = 'NONE';
    return;
  }
  const isFlex = style.display?.includes('flex');
  const isGrid = style.display?.includes('grid');
  const gridColumns = style.gridTemplateColumns?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const vertical = style.flowDirection
    ? style.flowDirection === 'vertical'
    : isFlex
      ? style.flexDirection === 'column'
      : isGrid
        ? gridColumns <= 1
        : !style.display?.startsWith('inline');
  node.layoutMode = vertical ? 'VERTICAL' : 'HORIZONTAL';
  node.layoutWrap = isFlex && style.flexWrap === 'wrap' ? 'WRAP' : 'NO_WRAP';
  // CSS table cells align their content on the block axis through
  // `vertical-align`. Once projected as a vertical Auto Layout frame, that
  // semantic belongs to the primary axis rather than `justify-content`.
  node.primaryAxisAlignItems =
    style.display === 'table-cell' ? align(style.verticalAlign) : align(style.justifyContent);
  node.counterAxisAlignItems = align(style.alignItems) as 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  node.itemSpacing = px(
    vertical ? style.rowGap : style.columnGap,
    px(style.gap, px(style.inferredGap)),
  );
  if (node.layoutWrap === 'WRAP') {
    node.counterAxisSpacing = px(style.rowGap, node.itemSpacing);
  }
  node.paddingTop = px(style.paddingTop);
  node.paddingRight = px(style.paddingRight);
  node.paddingBottom = px(style.paddingBottom);
  node.paddingLeft = px(style.paddingLeft);
}

export function applySizingModes(node: AutoLayoutNode, style: ComputedStyle, forceFixed = false) {
  const horizontal = forceFixed ? 'fixed' : style.widthSizing;
  const vertical = forceFixed ? 'fixed' : style.heightSizing;
  if (node.layoutMode === 'HORIZONTAL') {
    node.primaryAxisSizingMode = horizontal === 'hug' ? 'AUTO' : 'FIXED';
    node.counterAxisSizingMode = vertical === 'hug' ? 'AUTO' : 'FIXED';
  } else {
    node.primaryAxisSizingMode = vertical === 'hug' ? 'AUTO' : 'FIXED';
    node.counterAxisSizingMode = horizontal === 'hug' ? 'AUTO' : 'FIXED';
  }
  node.minWidth = px(style.minWidth) || null;
  node.minHeight = px(style.minHeight) || null;
  node.maxWidth = style.maxWidth && style.maxWidth !== 'none' ? px(style.maxWidth) || null : null;
  node.maxHeight =
    style.maxHeight && style.maxHeight !== 'none' ? px(style.maxHeight) || null : null;
}

export function layoutSizingForChild(
  requested: string | undefined,
  ownLayoutMode: AutoLayoutNode['layoutMode'],
  parentLayoutMode: AutoLayoutNode['layoutMode'],
  absolute = false,
): 'FIXED' | 'HUG' | 'FILL' {
  if (absolute) return 'FIXED';
  if (requested === 'fill') return parentLayoutMode === 'NONE' ? 'FIXED' : 'FILL';
  if (requested === 'hug') return ownLayoutMode === 'NONE' ? 'FIXED' : 'HUG';
  return 'FIXED';
}

export function finiteInset(value: string | undefined) {
  if (!value || value === 'auto') return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Generic CSS absolute/fixed positioning projection for direct Auto Layout children. */
export function applyChildPlacement(
  node: FrameNode | SlotNode | TextNode | InstanceNode,
  parent: AutoLayoutNode,
  style: ComputedStyle,
) {
  if (style.position !== 'absolute' && style.position !== 'fixed') {
    if (parent.layoutMode === 'NONE') {
      node.x = px(style.relativeX, node.x);
      node.y = px(style.relativeY, node.y);
    } else {
      node.layoutPositioning = 'AUTO';
    }
    return;
  }
  const left = finiteInset(style.left);
  const right = finiteInset(style.right);
  const top = finiteInset(style.top);
  const bottom = finiteInset(style.bottom);
  if (parent.layoutMode !== 'NONE') node.layoutPositioning = 'ABSOLUTE';
  node.x = left ?? (right === undefined ? node.x : parent.width - right - node.width);
  node.y = top ?? (bottom === undefined ? node.y : parent.height - bottom - node.height);
  node.constraints = {
    horizontal:
      left !== undefined && right !== undefined ? 'STRETCH' : right !== undefined ? 'MAX' : 'MIN',
    vertical:
      top !== undefined && bottom !== undefined ? 'STRETCH' : bottom !== undefined ? 'MAX' : 'MIN',
  };
}

export function configureRoot(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  const spec = ir.definitions.find((definition) => definition.component === capture.component)!;
  const displayName = componentDisplayName(spec);
  component.name =
    component.type === 'COMPONENT'
      ? spec.variantProperties.length
        ? variantName(spec, capture)
        : displayName
      : `${displayName} — ${spec.variantProperties.map((property) => capture.properties[property]).join(' / ')}`;
  applyAutoLayout(component, capture.root);
  component.primaryAxisSizingMode = 'FIXED';
  component.counterAxisSizingMode = 'FIXED';
  component.resizeWithoutConstraints(
    Math.max(px(capture.root.width, 1), 1),
    Math.max(px(capture.root.height, 1), 1),
  );
  applySizingModes(component, capture.root, component.type === 'FRAME');
  applyGeometryOverride(component, geometryFor(spec, capture).root);
  applyCornerRadii(component, capture.root);
  component.opacity = px(capture.root.opacity, 1);
  component.clipsContent = capture.root.overflow === 'hidden' || capture.root.overflow === 'clip';
  applyPaint(component, capture.root, 'backgroundColor');
  applyStroke(component, capture.root);
  const background = colorVariableFor(
    ir,
    resources,
    capture.root.backgroundColor,
    capture.bindings.background,
  );
  const border = colorVariableFor(
    ir,
    resources,
    capture.root.borderTopColor,
    capture.bindings.border,
  );
  if (background) bindPaintVariable(component, 'fills', background);
  if (border) bindPaintVariable(component, 'strokes', border);
}

