import { parseCssColor } from '../../cssColor';
import {
  type AutoLayoutNode,
  type ComponentCaptureIR,
  type FigmaComponentDefinition,
  type ComputedStyle,
  DATA_KEY,
  type FigmaComponentGeometry,
  type FigmaGeometryOverride,
  MANAGED_KEY,
  type RenderRootNode,
} from './model';
import { shouldRemoveManagedNode } from '../../reconciliation';
export function px(value: string | undefined, fallback = 0) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function geometryFor(
  spec: FigmaComponentDefinition,
  capture: ComponentCaptureIR,
): FigmaComponentGeometry {
  const key = spec.variantProperties.map((name) => String(capture.properties[name])).join('/');
  const variant = spec.figma?.variants?.[key];
  return {
    root: { ...spec.figma?.root, ...variant?.root },
    slots: { ...spec.figma?.slots, ...variant?.slots },
  };
}

export function applyGeometryOverride(
  node: AutoLayoutNode,
  geometry: FigmaGeometryOverride | undefined,
  parent?: RenderRootNode,
) {
  if (!geometry) return;
  if (geometry.layoutMode) node.layoutMode = geometry.layoutMode;
  if (geometry.layoutMode && geometry.layoutMode !== 'NONE' && geometry.gap !== undefined) {
    node.itemSpacing = geometry.gap;
  }
  if (geometry.width !== undefined || geometry.height !== undefined) {
    node.resizeWithoutConstraints(
      Math.max(geometry.width ?? node.width, 1),
      Math.max(geometry.height ?? node.height, 1),
    );
    node.layoutSizingHorizontal = 'FIXED';
    node.layoutSizingVertical = 'FIXED';
  }
  if (parent && (geometry.x !== undefined || geometry.y !== undefined)) {
    if (parent.layoutMode !== 'NONE') node.layoutPositioning = 'ABSOLUTE';
    node.x = geometry.x ?? node.x;
    node.y = geometry.y ?? node.y;
  }
}

export function parseColor(value: string | undefined): SolidPaint | null {
  if (!value || value === 'transparent') return null;
  const parsed = parseCssColor(value);
  if (!parsed) return null;
  return {
    type: 'SOLID',
    color: { r: parsed.r, g: parsed.g, b: parsed.b },
    opacity: parsed.opacity,
  };
}

export function splitCssArguments(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

export function parseGradientStops(parts: string[]): ColorStop[] | null {
  const parsed = parts.map((part, index) => {
    const match = /^(rgba?\([^)]*\)|#[\da-f]+|transparent)(?:\s+(-?[\d.]+)%?)?$/i.exec(part);
    if (!match) return null;
    const paint =
      match[1]!.toLowerCase() === 'transparent'
        ? ({ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 } satisfies SolidPaint)
        : parseColor(match[1]);
    if (!paint) return null;
    const fallback = parts.length <= 1 ? 0 : index / (parts.length - 1);
    const position = match[2] === undefined ? fallback : Number.parseFloat(match[2]) / 100;
    return {
      position: Math.min(Math.max(position, 0), 1),
      color: { ...paint.color, a: paint.opacity ?? 1 },
    };
  });
  return parsed.length >= 2 && !parsed.some((stop) => stop === null)
    ? (parsed as ColorStop[])
    : null;
}

/** Controlled CSS linear-gradient subset used by the product tokens. */
export function parseLinearGradient(value: string): GradientPaint | null {
  if (!value.startsWith('linear-gradient(') || !value.endsWith(')')) return null;
  const parts = splitCssArguments(value.slice('linear-gradient('.length, -1));
  const angleMatch = parts[0]?.match(/^(-?[\d.]+)deg$/);
  const angle = angleMatch ? Number.parseFloat(angleMatch[1]!) : 180;
  const stopParts = angleMatch ? parts.slice(1) : parts;
  const stops = parseGradientStops(stopParts);
  if (!stops) return null;

  // Figma's identity gradient runs left-to-right, equivalent to CSS 90deg.
  const radians = ((angle - 90) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [
      [cosine, -sine, 0.5 - 0.5 * cosine + 0.5 * sine],
      [sine, cosine, 0.5 - 0.5 * sine - 0.5 * cosine],
    ],
    gradientStops: stops,
  };
}

/** Controlled CSS radial-gradient subset: elliptical percentage radii and position. */
export function parseRadialGradient(value: string): GradientPaint | null {
  if (!value.startsWith('radial-gradient(') || !value.endsWith(')')) return null;
  const parts = splitCssArguments(value.slice('radial-gradient('.length, -1));
  const geometry = parts[0]?.match(
    /^(?:ellipse\s+)?(-?[\d.]+)%\s+(-?[\d.]+)%\s+at\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/,
  );
  if (!geometry) return null;
  const stops = parseGradientStops(parts.slice(1));
  if (!stops) return null;
  const radiusX = Number.parseFloat(geometry[1]!) / 100;
  const radiusY = Number.parseFloat(geometry[2]!) / 100;
  const centerX = Number.parseFloat(geometry[3]!) / 100;
  const centerY = Number.parseFloat(geometry[4]!) / 100;
  // Figma stores the inverse mapping from normalized node coordinates into
  // the radial gradient's canonical space (center .5/.5, radii .5). The CSS
  // center and radii are therefore not direct matrix scale/translation terms.
  const scaleX = 0.5 / Math.max(Math.abs(radiusX), Number.EPSILON);
  const scaleY = 0.5 / Math.max(Math.abs(radiusY), Number.EPSILON);
  return {
    type: 'GRADIENT_RADIAL',
    gradientTransform: [
      [scaleX, 0, 0.5 - scaleX * centerX],
      [0, scaleY, 0.5 - scaleY * centerY],
    ],
    gradientStops: stops,
  };
}

export function parseBackgroundGradients(value: string | undefined): GradientPaint[] {
  if (!value || value === 'none') return [];
  return splitCssArguments(value)
    .map((layer) => parseLinearGradient(layer) ?? parseRadialGradient(layer))
    .filter((paint): paint is GradientPaint => paint !== null);
}

export function solidPaintForVariableBinding(paint: SolidPaint | undefined): SolidPaint {
  return paint ? { ...paint } : { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
}

export function canBindPaintVariable(paint: SolidPaint | undefined) {
  return paint?.opacity === undefined || paint.opacity >= 0.999;
}

export function bindPaintVariable(
  node: GeometryMixin,
  field: 'fills' | 'strokes',
  variable: Variable,
) {
  const current = node[field];
  const paints: Paint[] = current === figma.mixed ? [] : [...current];
  const solidIndex = paints.findIndex((paint) => paint.type === 'SOLID');
  const solid = solidIndex >= 0 ? (paints[solidIndex] as SolidPaint) : undefined;
  // Figma normalizes a bound semantic paint to the variable's opaque value when
  // it is projected through nested screen content. Keep translucent CSS paints
  // literal so modifiers such as /10 and /20 remain visually faithful. The IR
  // still retains the semantic token reference for the next reconciliation.
  if (!canBindPaintVariable(solid)) return;
  const base = solidPaintForVariableBinding(solid);
  const bound = figma.variables.setBoundVariableForPaint(base, 'color', variable);
  if (solidIndex >= 0) paints[solidIndex] = bound;
  else paints.push(bound);
  node[field] = paints;
}

export function applyOpacity(node: MinimalBlendMixin, style: ComputedStyle) {
  node.opacity = Math.min(Math.max(px(style.opacity, 1), 0), 1);
}

/** Remove an earlier projection whose stable layer changed its Figma node type. */
export async function removeWrongTypeSibling(
  parent: ChildrenMixin,
  stableId: string,
  expectedTypes: readonly SceneNode['type'][],
) {
  for (const candidate of [...parent.children]) {
    let child: BaseNode | null;
    try {
      child = await figma.getNodeByIdAsync(candidate.id);
    } catch {
      child = null;
    }
    if (!child || child.type === 'DOCUMENT' || child.type === 'PAGE') continue;
    if (
      child.getPluginData(MANAGED_KEY) === 'true' &&
      child.getPluginData(DATA_KEY) === stableId &&
      !expectedTypes.includes(child.type)
    )
      child.remove();
  }
}

export function findStable<T extends SceneNode>(
  stableId: string,
  types: readonly NodeType[],
): T | undefined {
  const candidates = figma.currentPage.findAllWithCriteria({
    types: [...types],
    pluginData: { keys: [DATA_KEY] },
  });
  return candidates.find((node) => {
    try {
      return node.getPluginData(DATA_KEY) === stableId;
    } catch {
      // Structural reconciliation can invalidate a cached proxy before Figma's
      // page traversal catches up. Ignore that proxy and keep looking for the
      // current node with the same stable identity.
      return false;
    }
  }) as T | undefined;
}

/** Reacquire a child proxy before mutation after structural reconciliation. */
export async function findLiveChild<T extends SceneNode>(
  parent: ChildrenMixin,
  stableId: string,
  types: readonly SceneNode['type'][],
): Promise<T | undefined> {
  for (const candidate of [...parent.children]) {
    if (!types.includes(candidate.type)) continue;
    let live: BaseNode | null;
    try {
      live = await figma.getNodeByIdAsync(candidate.id);
    } catch {
      live = null;
    }
    if (!live || live.type === 'DOCUMENT' || live.type === 'PAGE' || !types.includes(live.type))
      continue;
    try {
      if (live.getPluginData(DATA_KEY) === stableId) return live as T;
    } catch {
      // The replacement can itself be invalidated while Figma settles a set
      // mutation. Ignore it so the caller creates a fresh managed child.
    }
  }
  return undefined;
}

/** Dynamic-page-safe component identity lookup for Instance nodes. */
export async function instanceUsesMainComponent(
  instance: InstanceNode,
  mainComponent: ComponentNode,
) {
  return (await instance.getMainComponentAsync())?.id === mainComponent.id;
}

export function mark(node: SceneNode, stableId: string) {
  node.setPluginData(DATA_KEY, stableId);
  node.setPluginData(MANAGED_KEY, 'true');
}

export function removeStaleManagedChildren(
  section: ChildrenMixin,
  expectedStableIds: ReadonlySet<string>,
  removableTypes: ReadonlySet<SceneNode['type']>,
) {
  for (const child of [...section.children]) {
    const stableId = child.getPluginData(DATA_KEY);
    if (
      shouldRemoveManagedNode(
        {
          stableId,
          managed: child.getPluginData(MANAGED_KEY) === 'true',
          type: child.type,
        },
        expectedStableIds,
        removableTypes,
      )
    ) {
      child.remove();
    }
  }
}

export function applyPaint(
  node: GeometryMixin,
  style: ComputedStyle,
  field: 'color' | 'backgroundColor',
) {
  const paint = parseColor(style[field]);
  const gradients =
    field === 'backgroundColor' ? parseBackgroundGradients(style.backgroundImage) : [];
  node.fills = [...gradients, paint].filter(
    (item): item is GradientPaint | SolidPaint => item !== null,
  );
}

export function applyStroke(node: GeometryMixin & MinimalStrokesMixin, style: ComputedStyle) {
  const edges = [
    ['top', px(style.borderTopWidth), style.borderTopColor],
    ['right', px(style.borderRightWidth), style.borderRightColor],
    ['bottom', px(style.borderBottomWidth), style.borderBottomColor],
    ['left', px(style.borderLeftWidth), style.borderLeftColor],
  ] as const;
  const visible = edges.find(([, edgeWidth, edgeColor]) => {
    const edgePaint = parseColor(edgeColor);
    return edgeWidth > 0 && edgePaint && (edgePaint.opacity ?? 1) > 0;
  });
  const paint = visible ? parseColor(visible[2]) : null;
  const samePaint = (edgeColor: string | undefined) => {
    const candidate = parseColor(edgeColor);
    if (!paint || !candidate) return false;
    return (
      candidate.color.r === paint.color.r &&
      candidate.color.g === paint.color.g &&
      candidate.color.b === paint.color.b &&
      (candidate.opacity ?? 1) === (paint.opacity ?? 1)
    );
  };
  const widths = Object.fromEntries(
    edges.map(([edge, edgeWidth, edgeColor]) => [
      edge,
      paint && samePaint(edgeColor) ? edgeWidth : 0,
    ]),
  ) as Record<(typeof edges)[number][0], number>;
  const width = Math.max(widths.top, widths.right, widths.bottom, widths.left);
  node.strokes = width > 0 && paint ? [paint] : [];
  const individual = node as GeometryMixin & MinimalStrokesMixin & Partial<IndividualStrokesMixin>;
  if (typeof individual.strokeTopWeight === 'number') {
    individual.strokeTopWeight = widths.top;
    individual.strokeRightWeight = widths.right;
    individual.strokeBottomWeight = widths.bottom;
    individual.strokeLeftWeight = widths.left;
  } else {
    node.strokeWeight = width;
  }
  if ('strokeAlign' in node) node.strokeAlign = 'INSIDE';
}

export function applyCornerRadii(
  node: MinimalBlendMixin & CornerMixin & { readonly width: number; readonly height: number },
  style: ComputedStyle,
) {
  const individual = node as MinimalBlendMixin & CornerMixin & Partial<RectangleCornerMixin>;
  // Browsers serialize rounded-full as an implementation-sized value
  // (currently ~33 million px). Figma needs the visible radius instead.
  const maxVisibleRadius = Math.max(Math.min(node.width, node.height) / 2, 0);
  const radius = (value: string | undefined, fallback = 0) =>
    Math.min(px(value, fallback), maxVisibleRadius);
  if (typeof individual.topLeftRadius === 'number') {
    const fallback = radius(style.borderRadius);
    individual.topLeftRadius = radius(style.borderTopLeftRadius, fallback);
    individual.topRightRadius = radius(style.borderTopRightRadius, fallback);
    individual.bottomRightRadius = radius(style.borderBottomRightRadius, fallback);
    individual.bottomLeftRadius = radius(style.borderBottomLeftRadius, fallback);
  } else {
    node.cornerRadius = radius(style.borderRadius);
  }
}

export function ensureSection(stableId: string, name: string, x = 0) {
  let section = findStable<SectionNode>(stableId, ['SECTION']);
  if (!section) {
    section = figma.createSection();
    section.name = name;
    section.x = x;
    section.y = 0;
    mark(section, stableId);
  }
  section.name = name;
  return section;
}
