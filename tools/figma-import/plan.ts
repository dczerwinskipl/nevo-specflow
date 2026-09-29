import type {
  FigmaComponentDefinition,
  ComponentCaptureIR,
  NestedLayerIR,
  ScreensIR,
  SlotIR,
} from '@nevo/figma-core/ir';

export interface FigmaComponentImportPlan {
  component: string;
  setStableId: string;
  axes: Array<{ name: string; values: string[] }>;
  variants: Array<{ stableId: string; properties: Record<string, string> }>;
  slots: Array<{ name: string; kind: string; propertyName?: string }>;
  tokenTargets: string[];
}

export interface FigmaOverviewAxis {
  name: string;
  values: string[];
}

export interface FigmaOverviewLayout {
  column?: FigmaOverviewAxis;
  row?: FigmaOverviewAxis;
  groups: FigmaOverviewAxis[];
}

/**
 * One main component per stable variant. Duplicate visual stories must explicitly mark
 * exactly one canonical capture; story order and incidental slot content do
 * not influence the result.
 */
export function selectCanonicalCaptures(
  captures: readonly ComponentCaptureIR[],
  requireExplicitDuplicates = true,
) {
  const grouped = new Map<string, ComponentCaptureIR[]>();
  for (const capture of captures) {
    const group = grouped.get(capture.stableId) ?? [];
    group.push(capture);
    grouped.set(capture.stableId, group);
  }
  return new Map<string, ComponentCaptureIR>(
    [...grouped].map(([stableId, group]) => {
      if (group.length === 1) return [stableId, group[0]!];
      const canonical = group.filter((item) => item.canonical);
      if (canonical.length !== 1 && requireExplicitDuplicates) {
        throw new Error(`${stableId} has ${group.length} captures; mark exactly one as canonical`);
      }
      if (canonical.length === 1) return [stableId, canonical[0]!];
      // Screen fragments are Frames, not library main components. Their captured
      // content is overridden at use sites; this stable ordering only selects a
      // structural template.
      const selected = [...group].sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        )[0];
      if (!selected) throw new Error(`${stableId} has no captures`);
      return [stableId, selected];
    }),
  );
}

interface OrderedFigmaComponentDefinition {
  component: string;
  order: number;
}

function nestedReferences(children: readonly NestedLayerIR[], references: Set<string>) {
  for (const child of children) {
    if (!('componentRef' in child)) {
      if (child.kind === 'element') nestedReferences(child.children, references);
      continue;
    }
    references.add(child.componentRef);
    for (const slot of Object.values(child.slots)) {
      if (typeof slot !== 'string') nestedReferences(slot.children, references);
    }
  }
}

export function componentReferenceKind(
  componentRef: string,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) {
  const target = definitions.get(componentRef)?.target;
  return target === 'fragment' || target === 'screen'
    ? ('screen-content' as const)
    : ('reusable-component' as const);
}

/** Stable main-component identity shared by document preflight and the importer preview. */
export function mainComponentRequirement(
  layer: Extract<NestedLayerIR, { componentRef: string }>,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) {
  if (componentReferenceKind(layer.componentRef, definitions) === 'screen-content')
    return undefined;
  const spec = definitions.get(layer.componentRef);
  return `${layer.componentRef}/${spec?.variantProperties.map((name) => String(layer.properties[name])).join('/') ?? ''}`;
}

export type ReferenceRequirementKind = 'component' | 'color' | 'text-style' | 'asset';

export interface ReferenceRequirement {
  stableId: string;
  kind: ReferenceRequirementKind;
}

/** Managed component identity for an optional resource catalogue capture. */
export function resourceCatalogStableId(resourceStableId: string) {
  return `${resourceStableId}/presentation`;
}

function addRequirement(
  result: Map<string, ReferenceRequirement>,
  stableId: string | undefined,
  kind: ReferenceRequirementKind,
) {
  if (!stableId) return;
  const previous = result.get(stableId);
  if (previous && previous.kind !== kind) {
    throw new Error(
      `Stable identity ${stableId} is referenced as both ${previous.kind} and ${kind}`,
    );
  }
  result.set(stableId, { stableId, kind });
}

function collectLayerRequirements(
  layer: NestedLayerIR,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  result: Map<string, ReferenceRequirement>,
) {
  if ('componentRef' in layer) {
    addRequirement(result, mainComponentRequirement(layer, definitions), 'component');
    for (const slot of Object.values(layer.slots)) {
      if (typeof slot !== 'string') collectNestedSlotRequirements(slot, definitions, result);
    }
    return;
  }
  if (layer.kind === 'element') {
    layer.children.forEach((child) => collectLayerRequirements(child, definitions, result));
    return;
  }
  if (layer.kind === 'asset') {
    addRequirement(result, layer.assetRef, 'asset');
    addRequirement(result, layer.colorRef, 'color');
    return;
  }
  if (layer.kind === 'text') {
    addRequirement(result, layer.textStyleRef, 'text-style');
    addRequirement(result, layer.colorRef ?? layer.bindings?.content, 'color');
    for (const run of layer.runs ?? []) {
      addRequirement(result, run.textStyleRef, 'text-style');
      addRequirement(result, run.colorRef, 'color');
    }
  }
}

function collectNestedSlotRequirements(
  slot: { children: NestedLayerIR[] },
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  result: Map<string, ReferenceRequirement>,
) {
  slot.children.forEach((child) => collectLayerRequirements(child, definitions, result));
}

function collectSlotRequirements(
  slot: SlotIR,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  result: Map<string, ReferenceRequirement>,
) {
  if (slot.kind === 'text') {
    addRequirement(result, slot.textStyleRef, 'text-style');
    addRequirement(result, slot.colorRef ?? slot.bindings?.content, 'color');
  } else if (slot.kind === 'asset-swap') {
    collectLayerRequirements(slot.asset, definitions, result);
  } else {
    slot.children.forEach((child) => collectLayerRequirements(child, definitions, result));
  }
}

/** All existing managed identities required before a screen mutation starts. */
export function screenRequirements(ir: ScreensIR): ReferenceRequirement[] {
  const definitions = new Map(
    ir.definitions.map((definition) => [definition.component, definition]),
  );
  const result = new Map<string, ReferenceRequirement>();
  for (const captures of Object.values(ir.screens)) {
    for (const capture of captures) {
      for (const slot of Object.values(capture.slots)) {
        if (slot) collectSlotRequirements(slot, definitions, result);
      }
      capture.structure?.forEach((layer) => collectLayerRequirements(layer, definitions, result));
    }
  }
  return [...result.values()].sort((left, right) => left.stableId.localeCompare(right.stableId));
}

/** Existing Design System main components required before a screen mutation starts. */
export function screenMainComponentRequirements(ir: ScreensIR) {
  return screenRequirements(ir)
    .filter((requirement) => requirement.kind === 'component' || requirement.kind === 'asset')
    .map((requirement) => requirement.stableId);
}

function componentDependencies(captures: readonly ComponentCaptureIR[]) {
  const references = new Set<string>();
  for (const capture of captures) {
    for (const slot of Object.values(capture.slots)) {
      if (slot?.kind === 'container' || slot?.kind === 'slot') {
        nestedReferences(slot.children, references);
      }
    }
    if (capture.structure) nestedReferences(capture.structure, references);
  }
  return references;
}

/**
 * Parents may embed components whose visual order is later in the catalogue.
 * Figma must receive those nested main components first, so catalogue order is only a
 * tie-breaker after the dependency graph has been respected.
 */
export function orderFigmaComponentDefinitionsByDependencies<
  Spec extends OrderedFigmaComponentDefinition,
>(
  specs: readonly Spec[],
  capturesByComponent: Readonly<Record<string, readonly ComponentCaptureIR[]>>,
): Spec[] {
  const components = new Map(specs.map((spec) => [spec.component, spec]));
  const sortedSpecs = [...specs].sort((left, right) => left.order - right.order);
  const result: Spec[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(spec: Spec) {
    if (visited.has(spec.component)) return;
    if (visiting.has(spec.component)) {
      throw new Error(`Circular nested component dependency at ${spec.component}`);
    }
    visiting.add(spec.component);
    const dependencies = [...componentDependencies(capturesByComponent[spec.component] ?? [])]
      .map((component) => components.get(component))
      .filter((dependency): dependency is Spec => Boolean(dependency))
      .sort((left, right) => left.order - right.order);
    dependencies.forEach(visit);
    visiting.delete(spec.component);
    visited.add(spec.component);
    result.push(spec);
  }

  sortedSpecs.forEach(visit);
  return result;
}

/** Generic documentation-matrix policy; it contains no component-name cases. */
export function buildOverviewLayout(axes: FigmaOverviewAxis[]): FigmaOverviewLayout {
  const named = (name: string) => axes.find((axis) => axis.name.toLowerCase() === name);
  const state = named('state');
  const size = named('size');
  if (state) {
    const row =
      axes.find((axis) => axis !== state && axis !== size) ?? (size === state ? undefined : size);
    return { column: state, row, groups: axes.filter((axis) => axis !== state && axis !== row) };
  }
  if (axes.length === 1) return { column: axes[0], groups: [] };
  if (axes.length >= 2) {
    const row = axes.find((axis) => axis !== size) ?? axes[0];
    const column = size && size !== row ? size : axes.find((axis) => axis !== row);
    return { column, row, groups: axes.filter((axis) => axis !== column && axis !== row) };
  }
  return { groups: [] };
}

/** Pure and testable part of the Figma adapter; contains no Figma API calls. */
export function buildComponentImportPlan(
  spec: FigmaComponentDefinition,
  captures: readonly ComponentCaptureIR[],
): FigmaComponentImportPlan {
  const variants = selectCanonicalCaptures(captures);
  return {
    component: spec.component,
    setStableId: spec.variantProperties.length
      ? `${spec.component}/set`
      : ([...variants.values()][0]?.stableId ?? `${spec.component}/`),
    axes: spec.variantProperties.map((name) => ({
      name,
      values: (spec.propertyValues[name] ?? []).map(String),
    })),
    variants: [...variants.values()].map((capture) => ({
      stableId: capture.stableId,
      properties: Object.fromEntries(
        spec.variantProperties.map((name) => [name, String(capture.properties[name])]),
      ),
    })),
    slots: Object.entries(spec.slots).map(([name, slot]) => ({
      name,
      kind: slot.kind,
      propertyName: 'propertyName' in slot ? slot.propertyName : undefined,
    })),
    tokenTargets: Object.keys(spec.bindings ?? {}),
  };
}



