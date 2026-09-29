import { buildComponentImportPlan } from '../../plan';
import { findLiveChild, findStable, mark, removeStaleManagedChildren } from '../core/figmaNodes';
import {
  type ComponentCaptureIR,
  type FigmaComponentDefinition,
  DATA_KEY,
  type DesignSystemIR,
  type DesignResources,
  type FigmaSlotDefinition,
} from '../core/model';
import { configureComponent, reconcileNestedSlotOverrides } from './componentSlots';
import { canonicalCaptures, componentDisplayName } from './componentLayout';
import { layoutSetMatrix } from './overviews';
import {
  deleteSetProperties,
  ensureComponentProperty,
  repairSetIfNeeded,
} from './resourceComponents';

async function liveComponent(stableId: string) {
  const candidate = findStable<ComponentNode>(stableId, ['COMPONENT']);
  if (!candidate) return undefined;
  try {
    const live = await figma.getNodeByIdAsync(candidate.id);
    return live?.type === 'COMPONENT' ? live : undefined;
  } catch {
    return undefined;
  }
}

function isInvalidatedNode(error: unknown) {
  return error instanceof Error && error.message.includes('Node not found');
}

async function configureLiveComponent(
  component: ComponentNode,
  capture: ComponentCaptureIR,
  spec: FigmaComponentDefinition,
  ir: DesignSystemIR,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) {
  let candidate = component;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await configureComponent(candidate, capture, spec, ir, resources, definitions);
      return candidate;
    } catch (error) {
      if (!isInvalidatedNode(error) || attempt === 2) throw error;
      const reacquired = await liveComponent(capture.stableId);
      if (!reacquired) throw error;
      candidate = reacquired;
    }
  }
  throw new Error(`Could not configure live component ${capture.stableId}`);
}

export function bindComponentProperties(
  owner: ComponentSetNode | ComponentNode,
  spec: FigmaComponentDefinition,
  captures: ReadonlyMap<string, ComponentCaptureIR>,
) {
  const assetSwapNames = Object.values(spec.slots)
    .filter(
      (slot): slot is Extract<FigmaSlotDefinition, { kind: 'asset-swap' }> =>
        slot.kind === 'asset-swap',
    )
    .map((slot) => slot.propertyName);
  if (assetSwapNames.length && owner.type === 'COMPONENT_SET') {
    deleteSetProperties(owner, assetSwapNames, 'INSTANCE_SWAP');
  }
  const textProperties = new Map<string, string>();
  const visibleProperties = new Map<string, string>();
  for (const [slotName, slot] of Object.entries(spec.slots)) {
    if (slot.kind === 'text') {
      textProperties.set(
        slotName,
        ensureComponentProperty(owner, slot.propertyName, 'TEXT', slot.defaultText),
      );
    } else if (slot.kind === 'asset-swap' && !slot.required) {
      visibleProperties.set(
        slotName,
        ensureComponentProperty(owner, `Show ${slot.propertyName.toLowerCase()}`, 'BOOLEAN', false),
      );
    } else if (slot.kind === 'container' && !slot.required && slot.exposeVisibility !== false) {
      const firstCapture = captures.values().next().value as ComponentCaptureIR | undefined;
      visibleProperties.set(
        slotName,
        ensureComponentProperty(
          owner,
          `Show ${slotName}`,
          'BOOLEAN',
          Boolean(firstCapture?.slots[slotName]),
        ),
      );
    }
  }

  const components =
    owner.type === 'COMPONENT_SET'
      ? owner.children.filter((child): child is ComponentNode => child.type === 'COMPONENT')
      : [owner];
  for (const component of components) {
    const capture = captures.get(component.getPluginData(DATA_KEY));
    if (!capture) continue;
    for (const [slotName, slotSpec] of Object.entries(spec.slots)) {
      const child = component.children.find((candidate) => candidate.name === `slot:${slotName}`);
      if (slotSpec.kind === 'text' && child?.type === 'TEXT') {
        child.componentPropertyReferences = {};
        child.characters = slotSpec.defaultText;
        child.componentPropertyReferences = { characters: textProperties.get(slotName)! };
      } else if (slotSpec.kind === 'asset-swap' && child?.type === 'INSTANCE') {
        child.componentPropertyReferences = {};
        child.visible = Boolean(capture.slots[slotName]) || Boolean(slotSpec.required);
        child.isExposedInstance = true;
        const visibleProperty = visibleProperties.get(slotName);
        if (visibleProperty) child.componentPropertyReferences = { visible: visibleProperty };
      } else if (
        slotSpec.kind === 'container' &&
        child?.type === 'FRAME' &&
        !slotSpec.required &&
        slotSpec.exposeVisibility !== false
      ) {
        child.componentPropertyReferences = {};
        child.visible = Boolean(capture.slots[slotName]);
        const visibleProperty = visibleProperties.get(slotName);
        if (visibleProperty) child.componentPropertyReferences = { visible: visibleProperty };
      }
    }
  }
}

export function matrixKeys(spec: FigmaComponentDefinition, component: ComponentNode) {
  void spec;
  const captureValues = component.getPluginData(DATA_KEY).split('/').slice(1);
  if (!captureValues.length) return undefined;
  const column = captureValues[0];
  const row = captureValues.slice(1).join('/') || 'default';
  return column ? { column, row } : undefined;
}

export function expectedMatrix(spec: FigmaComponentDefinition, captures: ComponentCaptureIR[]) {
  const plan = buildComponentImportPlan(spec, captures);
  const columns = plan.axes[0]?.values ?? [];
  const rowAxes = plan.axes.slice(1);
  let rows = ['default'];
  for (const axis of rowAxes) {
    const values = axis.values;
    rows = rows.flatMap((prefix) =>
      values.map((value) => (prefix === 'default' ? value : `${prefix}/${value}`)),
    );
  }
  return { columns, rows, plan };
}

export async function upsertComponentSet(
  ir: DesignSystemIR,
  spec: FigmaComponentDefinition,
  section: SectionNode,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  y: number,
) {
  const source = canonicalCaptures(spec, ir.components[spec.component] ?? []);
  if (!source.size) throw new Error(`IR contains no ${spec.component} captures`);
  if (!spec.variantProperties.length) {
    const capture = source.values().next().value as ComponentCaptureIR | undefined;
    if (!capture) throw new Error(`IR contains no ${spec.component} capture`);
    let component = await liveComponent(capture.stableId);
    if (!component) {
      component = figma.createComponent();
      mark(component, capture.stableId);
      section.appendChild(component);
    }
    component = await configureLiveComponent(component, capture, spec, ir, resources, definitions);
    bindComponentProperties(component, spec, source);
    await reconcileNestedSlotOverrides(
      component,
      capture,
      spec,
      ir,
      resources,
      definitions,
      configureComponent,
    );
    component.x = 24;
    component.y = y;
    component.description =
      'Standalone component. Styling and slots are reconciled from canonical IR.';
    return component;
  }
  const setId = `${spec.component}/set`;
  let set = findStable<ComponentSetNode>(setId, ['COMPONENT_SET']);
  if (set) set = await repairSetIfNeeded(set, section, setId, [...source.keys()], spec);
  if (set) {
    const nativeSlotNames = Object.values(spec.slots)
      .filter(
        (slot): slot is Extract<FigmaSlotDefinition, { kind: 'slot' }> => slot.kind === 'slot',
      )
      .map((slot) => slot.propertyName);
    // Remove the old TEXT property before creating a SLOT with the same public
    // name. Doing this afterwards can temporarily put the ComponentSet into an
    // invalid duplicate-property state that blocks componentPropertyDefinitions.
    if (nativeSlotNames.length) deleteSetProperties(set, nativeSlotNames, 'TEXT');
  }
  const masters: ComponentNode[] = [];
  for (const [stableId, capture] of source) {
    let component = await liveComponent(stableId);
    if (!component) {
      component = figma.createComponent();
      mark(component, stableId);
    }
    component = await configureLiveComponent(component, capture, spec, ir, resources, definitions);
    if (set && component.parent !== set) set.appendChild(component);
    masters.push(component);
  }
  if (set) {
    removeStaleManagedChildren(set, new Set(source.keys()), new Set(['COMPONENT']));
  }
  if (!set) {
    if (!masters.length) throw new Error(`Could not materialize ${spec.component} variants`);
    set = figma.combineAsVariants(masters, section);
    mark(set, setId);
  }
  // combineAsVariants and parent moves can invalidate the ComponentNode
  // proxies configured above. Resolve every master through the resulting set
  // before further mutations; a delay would only leave this timing-dependent.
  masters.splice(0, masters.length, ...(await liveVariantMasters(set, source.keys())));
  // Parenting a component into a variant set can normalize its root and child
  // Auto Layout dimensions. Re-run the canonical configuration against the
  // live, parented nodes so the final state is derived from IR rather than from
  // Figma's transient combine/move result.
  for (const [index, component] of masters.entries()) {
    const capture = source.get(component.getPluginData(DATA_KEY));
    if (!capture) continue;
    masters[index] = await configureLiveComponent(
      component,
      capture,
      spec,
      ir,
      resources,
      definitions,
    );
  }
  bindComponentProperties(set, spec, source);
  for (const component of masters) {
    const capture = source.get(component.getPluginData(DATA_KEY));
    if (!capture) continue;
    await reconcileNestedSlotOverrides(
      component,
      capture,
      spec,
      ir,
      resources,
      definitions,
      configureComponent,
    );
  }
  const matrix = expectedMatrix(spec, [...source.values()]);
  set.description = `Columns: ${matrix.plan.axes[0]?.name}. Rows: ${
    matrix.plan.axes
      .slice(1)
      .map((axis) => axis.name)
      .join(' / ') || 'single row'
  }.`;
  layoutSetMatrix(
    set,
    componentDisplayName(spec),
    24,
    y,
    matrix.rows,
    matrix.columns,
    (component) => matrixKeys(spec, component),
    { width: 104, height: 48 },
  );
  return set;
}

async function liveVariantMasters(set: ComponentSetNode, stableIds: Iterable<string>) {
  const masters: ComponentNode[] = [];
  for (const stableId of stableIds) {
    const component = await findLiveChild<ComponentNode>(set, stableId, ['COMPONENT']);
    if (!component) {
      throw new Error(`Could not reacquire ${stableId} after component-set reconciliation`);
    }
    masters.push(component);
  }
  return masters;
}

/**
 * Re-apply nested overrides after documentation instances have been created.
 *
 * Creating an instance that contains a native Figma Slot can normalize the
 * slot's default content after the component's initial import pass. Running
 * this generic reconciliation at the end of the import keeps the canonical IR
 * as the source of truth for nested text, assets and presentation without any
 * component-name exceptions.
 */
export async function reconcileComponentNestedSlots(
  ir: DesignSystemIR,
  spec: FigmaComponentDefinition,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) {
  const source = canonicalCaptures(spec, ir.components[spec.component] ?? []);
  const masters: ComponentNode[] = [];
  for (const [stableId, capture] of source) {
    let component = await liveComponent(stableId);
    if (!component) continue;
    component = await configureLiveComponent(component, capture, spec, ir, resources, definitions);
    masters.push(component);
  }
  const owner = masters[0]?.parent?.type === 'COMPONENT_SET' ? masters[0].parent : masters[0];
  if (owner) bindComponentProperties(owner, spec, source);
  for (const component of masters) {
    const capture = source.get(component.getPluginData(DATA_KEY));
    if (!capture) continue;
    await reconcileNestedSlotOverrides(
      component,
      capture,
      spec,
      ir,
      resources,
      definitions,
      configureComponent,
    );
  }
}

