import {
  applyCornerRadii,
  applyGeometryOverride,
  applyOpacity,
  applyPaint,
  applyStroke,
  bindPaintVariable,
  geometryFor,
  mark,
  px,
  removeWrongTypeSibling,
} from '../core/figmaNodes';
import {
  type ComponentCaptureIR,
  type ComputedStyle,
  type FigmaComponentDefinition,
  DATA_KEY,
  type DesignSystemIR,
  type DesignResources,
  MANAGED_KEY,
  type RenderRootNode,
  type SlotIR,
  type FigmaSlotDefinition,
} from '../core/model';
import {
  applyAutoLayout,
  applyChildPlacement,
  applySizingModes,
  layoutSizingForChild,
  configureRoot,
} from './componentLayout';
import { upsertAssetSwapSlot, upsertTextSlot } from './componentPrimitives';
import { colorVariableFor } from './documentResources';
import {
  materializeStructure,
  syncNestedChildren,
  syncNestedOverridesInPlace,
  type ConfigureNestedComponent,
} from './nestedContent';

function expectedSlotNodeType(slot: FigmaSlotDefinition): SceneNode['type'] {
  if (slot.kind === 'text') return 'TEXT';
  if (slot.kind === 'asset-swap') return 'INSTANCE';
  if (slot.kind === 'slot') return 'SLOT';
  return 'FRAME';
}

type PublicContainerSlot = Extract<SlotIR, { kind: 'container' | 'slot' }>;
type PublicContainerNode = FrameNode | SlotNode;

export function findPublicSlotNode(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  slotName: string,
  expectedType: SceneNode['type'],
) {
  const stableId = `${capture.stableId}/slot/${slotName}`;
  return component.findAll(
    (node) => node.type === expectedType && node.getPluginData(DATA_KEY) === stableId,
  )[0];
}

/** Restore Fill/Hug intent after Figma reparents a public slot into captured anatomy. */
export function applyPublicSlotSizing(
  node: PublicContainerNode,
  style: ComputedStyle,
  parent: ComponentNode | FrameNode | SlotNode,
) {
  const absolute = style.position === 'absolute' || style.position === 'fixed';
  node.layoutGrow = 0;
  node.layoutAlign = 'INHERIT';
  if (parent.layoutMode === 'VERTICAL') {
    if (style.widthSizing === 'fill') node.layoutAlign = 'STRETCH';
    if (style.heightSizing === 'fill') node.layoutGrow = 1;
  } else if (parent.layoutMode === 'HORIZONTAL') {
    if (style.heightSizing === 'fill') node.layoutAlign = 'STRETCH';
    if (style.widthSizing === 'fill') node.layoutGrow = 1;
  }
  node.layoutSizingHorizontal = layoutSizingForChild(
    style.widthSizing,
    node.layoutMode,
    parent.layoutMode,
    absolute,
  );
  node.layoutSizingVertical = layoutSizingForChild(
    style.heightSizing,
    node.layoutMode,
    parent.layoutMode,
    absolute,
  );
}

function configurePublicContainerSlot(
  node: PublicContainerNode,
  slot: PublicContainerSlot,
  parent: ComponentNode | FrameNode | SlotNode,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  applyAutoLayout(node, slot.style);
  node.primaryAxisSizingMode = 'FIXED';
  node.counterAxisSizingMode = 'FIXED';
  node.resizeWithoutConstraints(
    Math.max(px(slot.style.width, 1), 1),
    Math.max(px(slot.style.height, 1), 1),
  );
  const absolute = slot.style.position === 'absolute' || slot.style.position === 'fixed';
  applySizingModes(node, slot.style, absolute);
  node.fills = [];
  node.strokes = [];
  node.clipsContent = slot.style.overflow === 'hidden' || slot.style.overflow === 'clip';
  applyPaint(node, slot.style, 'backgroundColor');
  applyStroke(node, slot.style);
  applyCornerRadii(node, slot.style);
  applyOpacity(node, slot.style);
  const background = colorVariableFor(
    ir,
    resources,
    slot.style.backgroundColor,
    slot.bindings?.background,
  );
  const border = colorVariableFor(ir, resources, slot.style.borderTopColor, slot.bindings?.border);
  if (background) bindPaintVariable(node, 'fills', background);
  if (border) bindPaintVariable(node, 'strokes', border);
  applyPublicSlotSizing(node, slot.style, parent);
  applyChildPlacement(node, parent, slot.style);
}

/** Reconcile moved public slots against their actual, final Auto Layout parent. */
export function reconcilePublicSlotLayouts(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  spec: FigmaComponentDefinition,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  for (const [slotName, slotSpec] of Object.entries(spec.slots)) {
    if (slotSpec.kind !== 'container' && slotSpec.kind !== 'slot') continue;
    const slot = capture.slots[slotName];
    if (!slot || (slot.kind !== 'container' && slot.kind !== 'slot')) continue;
    const expectedType =
      slotSpec.kind === 'slot' && component.type === 'COMPONENT' ? 'SLOT' : 'FRAME';
    const node = findPublicSlotNode(component, capture, slotName, expectedType);
    const parent = node?.parent;
    if (
      !node ||
      !parent ||
      (parent.type !== 'COMPONENT' && parent.type !== 'FRAME' && parent.type !== 'SLOT')
    ) {
      continue;
    }
    configurePublicContainerSlot(node as PublicContainerNode, slot, parent, ir, resources);
  }
}

/**
 * Public slot nodes are moved into the captured DOM anatomy. A later import
 * pass must recover those same nodes from the component subtree before the
 * flat slot upserts run; looking only at direct children creates duplicates.
 * This also repairs documents produced by the previous non-idempotent pass.
 */
export function recoverPublicSlotNodes(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  spec: FigmaComponentDefinition,
) {
  for (const [slotName, slotSpec] of Object.entries(spec.slots)) {
    const stableId = `${capture.stableId}/slot/${slotName}`;
    const expectedType = expectedSlotNodeType(slotSpec);
    const matches = component.findAll((node) => {
      try {
        return (
          node.getPluginData(MANAGED_KEY) === 'true' && node.getPluginData(DATA_KEY) === stableId
        );
      } catch {
        return false;
      }
    });
    const compatible = matches.filter((node) => node.type === expectedType);
    const keep = compatible[0];
    for (const duplicate of matches) {
      if (duplicate !== keep) duplicate.remove();
    }
    if (keep && keep.parent !== component) component.appendChild(keep);
  }
}

export async function reconcileNestedSlotOverrides(
  component: ComponentNode,
  capture: ComponentCaptureIR,
  spec: FigmaComponentDefinition,
  ir: DesignSystemIR,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  configureComponent: ConfigureNestedComponent,
) {
  for (const [slotName, slotSpec] of Object.entries(spec.slots)) {
    if (slotSpec.kind !== 'container' && slotSpec.kind !== 'slot') continue;
    const slot = capture.slots[slotName];
    if (!slot || (slot.kind !== 'container' && slot.kind !== 'slot')) continue;
    const stableId = `${capture.stableId}/slot/${slotName}`;
    const expectedType = slotSpec.kind === 'slot' ? 'SLOT' : 'FRAME';
    const host = findPublicSlotNode(component, capture, slotName, expectedType) as
      FrameNode | SlotNode | undefined;
    if (!host) continue;
    await syncNestedOverridesInPlace(
      host,
      slot.children,
      definitions,
      stableId,
      ir,
      resources,
      configureComponent,
    );
  }
  reconcilePublicSlotLayouts(component, capture, spec, ir, resources);
  // Nested reconciliation and slot reparenting must not be allowed to shrink
  // an explicitly authored Figma root.
  configureRoot(component, capture, ir, resources);
}
export async function upsertContainerSlot(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  slotName: string,
  slot: Extract<SlotIR, { kind: 'container' }>,
  ir: DesignSystemIR,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  configureComponent: ConfigureNestedComponent,
) {
  const stableId = `${capture.stableId}/slot/${slotName}`;
  await removeWrongTypeSibling(component, stableId, ['FRAME']);
  let frame = component.children.find(
    (child): child is FrameNode =>
      child.type === 'FRAME' && child.getPluginData(DATA_KEY) === stableId,
  );
  if (!frame) {
    frame = figma.createFrame();
    component.appendChild(frame);
  }
  frame.name = `slot:${slotName}`;
  mark(frame, stableId);
  configurePublicContainerSlot(frame, slot, component, ir, resources);

  await syncNestedChildren(
    frame,
    slot.children,
    definitions,
    stableId,
    ir,
    resources,
    configureComponent,
  );
  applyGeometryOverride(
    frame,
    geometryFor(
      ir.definitions.find((item) => item.component === capture.component)!,
      capture,
    ).slots?.[slotName],
    component,
  );
  return frame;
}

export function nativeSlotPropertyKey(slot: SlotNode) {
  const references = slot.componentPropertyReferences as Record<string, string> | null;
  return references?.slotContentId;
}

export async function upsertNativeSlot(
  component: ComponentNode,
  capture: ComponentCaptureIR,
  slotName: string,
  slotSpec: Extract<FigmaSlotDefinition, { kind: 'slot' }>,
  slot: Extract<SlotIR, { kind: 'slot' }>,
  ir: DesignSystemIR,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  configureComponent: ConfigureNestedComponent,
) {
  const stableId = `${capture.stableId}/slot/${slotName}`;
  await removeWrongTypeSibling(component, stableId, ['SLOT']);
  let nativeSlot = component.children.find(
    (child): child is SlotNode =>
      child.type === 'SLOT' && child.getPluginData(DATA_KEY) === stableId,
  );
  const legacy = component.children.find(
    (child) => child.type !== 'SLOT' && child.getPluginData(DATA_KEY) === stableId,
  );
  const index = legacy ? component.children.indexOf(legacy) : component.children.length;
  if (!nativeSlot) {
    nativeSlot = component.createSlot();
    component.insertChild(index, nativeSlot);
    legacy?.remove();
  }
  nativeSlot.name = slotSpec.propertyName;
  mark(nativeSlot, stableId);
  configurePublicContainerSlot(nativeSlot, slot, component, ir, resources);
  const propertyKey = nativeSlotPropertyKey(nativeSlot);
  if (propertyKey) {
    const owner = component.parent?.type === 'COMPONENT_SET' ? component.parent : component;
    owner.editComponentProperty(propertyKey, {
      name: slotSpec.propertyName,
      description:
        'Flexible content. Insert any layer or component instance; geometry is controlled by the owning slot wrapper.',
      slotSettings: {
        stretchChildOnInsert: true,
        displayEmptyByDefault: true,
        minChildren: null,
        maxChildren: null,
      },
    });
  }
  await syncNestedChildren(
    nativeSlot,
    slot.children,
    definitions,
    stableId,
    ir,
    resources,
    configureComponent,
  );
  applyGeometryOverride(
    nativeSlot,
    geometryFor(
      ir.definitions.find((item) => item.component === capture.component)!,
      capture,
    ).slots?.[slotName],
    component,
  );
  return nativeSlot;
}

export async function configureComponent(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  spec: FigmaComponentDefinition,
  ir: DesignSystemIR,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) {
  recoverPublicSlotNodes(component, capture, spec);
  configureRoot(component, capture, ir, resources);
  if ((spec.target === 'fragment' || spec.target === 'screen') && capture.structure?.length) {
    await syncNestedChildren(
      component as FrameNode,
      materializeStructure(capture.structure, capture.slots),
      definitions,
      `${capture.stableId}/structure`,
      ir,
      resources,
      configureComponent,
    );
    for (const child of [...component.children]) {
      const childId = child.getPluginData(DATA_KEY);
      if (
        child.getPluginData(MANAGED_KEY) === 'true' &&
        childId.startsWith(`${capture.stableId}/slot/`)
      ) {
        child.remove();
      }
    }
    configureRoot(component, capture, ir, resources);
    return;
  }
  const ordered: SceneNode[] = [];
  for (const [slotName, slotSpec] of Object.entries(spec.slots)) {
    const slot = capture.slots[slotName];
    if (slotSpec.kind === 'text') {
      if (!slot || slot.kind !== 'text') {
        if (slotSpec.required)
          throw new Error(`${spec.component} is missing text slot ${slotName}`);
        continue;
      }
      ordered.push(await upsertTextSlot(component, capture, slotName, slot, ir, resources));
    } else if (slotSpec.kind === 'asset-swap') {
      ordered.push(
        await upsertAssetSwapSlot(
          component,
          capture,
          slotName,
          slotSpec,
          slot?.kind === 'asset-swap' ? slot : undefined,
          ir,
          resources,
        ),
      );
    } else if (slotSpec.kind === 'container') {
      if (!slot || slot.kind !== 'container') {
        if (slotSpec.required)
          throw new Error(`${spec.component} is missing container slot ${slotName}`);
        continue;
      }
      ordered.push(
        await upsertContainerSlot(
          component,
          capture,
          slotName,
          slot,
          ir,
          resources,
          definitions,
          configureComponent,
        ),
      );
    } else {
      if (!slot || slot.kind !== 'slot') {
        if (slotSpec.required)
          throw new Error(`${spec.component} is missing native slot ${slotName}`);
        continue;
      }
      if (component.type !== 'COMPONENT') {
        // Screens are ordinary frames. Native Figma Slots only exist inside
        // components, so a screen-level slot remains a structural container.
        ordered.push(
          await upsertContainerSlot(
            component,
            capture,
            slotName,
            { ...slot, kind: 'container' },
            ir,
            resources,
            definitions,
            configureComponent,
          ),
        );
      } else {
        ordered.push(
          await upsertNativeSlot(
            component,
            capture,
            slotName,
            slotSpec,
            slot,
            ir,
            resources,
            definitions,
            configureComponent,
          ),
        );
      }
    }
  }
  const orderedIds = new Set(ordered.map((node) => node.getPluginData(DATA_KEY)));
  for (const child of [...component.children]) {
    const stableId = child.getPluginData(DATA_KEY);
    if (
      child.getPluginData(MANAGED_KEY) === 'true' &&
      stableId.startsWith(`${capture.stableId}/slot/`) &&
      !orderedIds.has(stableId)
    )
      child.remove();
  }
  ordered.forEach((node, index) => component.insertChild(index, node));

  const slotNodes = new Map<string, SceneNode>();
  for (const [slotName] of Object.entries(spec.slots)) {
    const stableId = `${capture.stableId}/slot/${slotName}`;
    const node = ordered.find((candidate) => candidate.getPluginData(DATA_KEY) === stableId);
    if (node) slotNodes.set(slotName, node);
  }

  // Slots are declared as a flat public API, but their rendered DOM anatomy can
  // be nested (for example an icon action inside a form-control wrapper, or
  // Alert text inside a horizontal content row). Reconcile each container again
  // after every slot exists so slot-ref layers can move the actual property-owning
  // node into its captured parent rather than materializing a visual duplicate.
  for (const [slotName, node] of slotNodes) {
    const slot = capture.slots[slotName];
    if (
      (node.type === 'FRAME' || node.type === 'SLOT') &&
      slot &&
      (slot.kind === 'container' || slot.kind === 'slot')
    ) {
      await syncNestedChildren(
        node,
        slot.children,
        definitions,
        `${capture.stableId}/slot/${slotName}`,
        ir,
        resources,
        configureComponent,
        slotNodes,
      );
    }
  }

  if (capture.structure?.length) {
    await syncNestedChildren(
      component,
      capture.structure,
      definitions,
      `${capture.stableId}/structure`,
      ir,
      resources,
      configureComponent,
      slotNodes,
    );
  }
  reconcilePublicSlotLayouts(component, capture, spec, ir, resources);
  configureRoot(component, capture, ir, resources);
}

