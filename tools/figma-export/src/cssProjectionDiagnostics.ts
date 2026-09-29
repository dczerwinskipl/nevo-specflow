import type {
  ComponentCaptureIR,
  ComputedStyleRecord,
  DesignSystemIR,
  NestedLayerIR,
  NestedSlotIR,
  ProjectionDiagnosticIR,
  SlotIR,
} from '@nevo/figma-core/ir';

type StyledLayer = {
  component: string;
  layer: string;
  style: ComputedStyleRecord;
};

function splitCssLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

const colorStopPattern = /^(rgba?\([^)]*\)|#[\da-f]+|transparent)(?:\s+(-?[\d.]+)%?)?$/i;

function hasSupportedStops(parts: string[]): boolean {
  return parts.length >= 2 && parts.every((part) => colorStopPattern.test(part));
}

function isSupportedGradient(layer: string): boolean {
  if (layer.startsWith('linear-gradient(') && layer.endsWith(')')) {
    const parts = splitCssLayers(layer.slice('linear-gradient('.length, -1));
    const hasAngle = /^-?[\d.]+deg$/.test(parts[0] ?? '');
    return hasSupportedStops(hasAngle ? parts.slice(1) : parts);
  }
  if (layer.startsWith('radial-gradient(') && layer.endsWith(')')) {
    const parts = splitCssLayers(layer.slice('radial-gradient('.length, -1));
    const hasSupportedGeometry =
      /^(?:ellipse\s+)?-?[\d.]+%\s+-?[\d.]+%\s+at\s+-?[\d.]+%\s+-?[\d.]+%$/.test(parts[0] ?? '');
    return hasSupportedGeometry && hasSupportedStops(parts.slice(1));
  }
  return false;
}

export function isSupportedBackgroundImage(value: string | undefined): boolean {
  if (!value || value === 'none') return true;
  const layers = splitCssLayers(value);
  return layers.length > 0 && layers.every(isSupportedGradient);
}

function numeric(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTransparent(value: string | undefined): boolean {
  if (!value || value === 'transparent') return true;
  const rgba = value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
  if (rgba) return Number.parseFloat(rgba[1] ?? '0') <= 0;
  const modernAlpha = value.match(/\/\s*([\d.]+)%?\s*\)$/);
  if (!modernAlpha) return false;
  return Number.parseFloat(modernAlpha[1] ?? '0') <= 0;
}

function isMaterial(style: ComputedStyleRecord): boolean {
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (style.opacity !== '' && numeric(style.opacity) === 0) return false;
  return !(
    numeric(style.width) === 0 &&
    numeric(style.height) === 0 &&
    (style.width ?? '').endsWith('px') &&
    (style.height ?? '').endsWith('px')
  );
}

function layerName(layer: NestedLayerIR, fallback: string): string {
  if ('identity' in layer && layer.identity?.layer) return layer.identity.layer;
  if ('componentRef' in layer) return layer.componentRef;
  if (layer.kind === 'slot-ref') return `slot:${layer.name}`;
  if (layer.kind === 'element') return layer.name;
  return fallback;
}

function collectNestedSlot(
  slot: NestedSlotIR,
  component: string,
  layer: string,
  result: StyledLayer[],
) {
  for (const child of slot.children) collectNested(child, component, layer, result);
}

function collectNested(
  node: NestedLayerIR,
  component: string,
  fallbackLayer: string,
  result: StyledLayer[],
) {
  if ('kind' in node && node.kind === 'slot-ref') return;
  const layer = layerName(node, fallbackLayer);
  if ('style' in node && node.style) result.push({ component, layer, style: node.style });
  if ('componentRef' in node) {
    for (const [slotName, slot] of Object.entries(node.slots)) {
      if (typeof slot !== 'string')
        collectNestedSlot(slot, component, `${layer}.${slotName}`, result);
    }
    return;
  }
  if (node.kind === 'element') {
    for (const child of node.children) collectNested(child, component, layer, result);
  }
}

function collectSlot(
  slot: SlotIR | undefined,
  component: string,
  layer: string,
  result: StyledLayer[],
) {
  if (!slot) return;
  result.push({ component, layer, style: slot.style });
  if (slot.kind === 'container' || slot.kind === 'slot') {
    for (const child of slot.children) collectNested(child, component, layer, result);
  }
}

function styledLayers(
  components: Record<string, ComponentCaptureIR[]>,
  resources?: DesignSystemIR['resources'],
): StyledLayer[] {
  const result: StyledLayer[] = [];
  for (const [component, captures] of Object.entries(components)) {
    for (const capture of captures) {
      result.push({ component, layer: 'root', style: capture.root });
      for (const [slotName, slot] of Object.entries(capture.slots)) {
        collectSlot(slot, component, `slot:${slotName}`, result);
      }
      for (const layer of capture.structure ?? [])
        collectNested(layer, component, 'structure', result);
    }
  }
  void resources;
  return result;
}

const diagnosticOnlyStyleProperties = [
  'visibility',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
] as const;

/** Removes capture-only evidence after diagnostics have been derived. */
export function stripDiagnosticOnlyStyleProperties(
  components: Record<string, ComponentCaptureIR[]>,
  resources?: DesignSystemIR['resources'],
): void {
  for (const { style } of styledLayers(components, resources)) {
    for (const property of diagnosticOnlyStyleProperties) delete style[property];
  }
}

/** Reports CSS that the current static Figma projection cannot represent faithfully. */
export function collectCssProjectionDiagnostics(
  components: Record<string, ComponentCaptureIR[]>,
  resources?: DesignSystemIR['resources'],
): ProjectionDiagnosticIR[] {
  const diagnostics: ProjectionDiagnosticIR[] = [];
  const keys = new Set<string>();
  const report = (layer: StyledLayer, code: ProjectionDiagnosticIR['code'], message: string) => {
    const key = `${code}/${layer.component}/${layer.layer}/${message}`;
    if (keys.has(key)) return;
    keys.add(key);
    diagnostics.push({
      code,
      severity: 'warning',
      message,
      component: layer.component,
      layer: layer.layer,
    });
  };

  for (const layer of styledLayers(components, resources)) {
    const { style } = layer;
    if (!isMaterial(style)) continue;

    if (style.position === 'sticky') {
      report(
        layer,
        'unsupported-sticky-position',
        'Sticky positioning is not projected; the static flow position is retained.',
      );
    }
    if (!isSupportedBackgroundImage(style.backgroundImage)) {
      report(
        layer,
        'unsupported-background-image',
        'CSS background-image contains a layer outside the supported linear/radial gradient subset.',
      );
    }

    const borderSides = ['Top', 'Right', 'Bottom', 'Left'] as const;
    const hasUnsupportedVisibleBorder = borderSides.some((side) => {
      const borderStyle = style[`border${side}Style`];
      return (
        numeric(style[`border${side}Width`]) > 0 &&
        !isTransparent(style[`border${side}Color`]) &&
        borderStyle !== 'none' &&
        borderStyle !== 'solid'
      );
    });
    if (hasUnsupportedVisibleBorder) {
      report(
        layer,
        'unsupported-border-style',
        'A visible non-solid CSS border is not projected; it is not replaced with a solid stroke.',
      );
    }

    if (
      numeric(style.outlineWidth) > 0 &&
      style.outlineStyle !== 'none' &&
      !isTransparent(style.outlineColor)
    ) {
      report(layer, 'unsupported-outline', 'A visible CSS outline is not projected into Figma.');
    }
  }

  return diagnostics;
}

