import {
  applyCornerRadii,
  applyOpacity,
  applyPaint,
  applyStroke,
  bindPaintVariable,
  findLiveChild,
  findStable,
  instanceUsesMainComponent,
  mark,
  px,
  removeWrongTypeSibling,
} from '../core/figmaNodes';
import {
  type ComponentCaptureIR,
  type FigmaComponentDefinition,
  type ComputedStyle,
  type AssetLayerIR,
  DATA_KEY,
  type DesignSystemIR,
  type DesignResources,
  MANAGED_KEY,
  type NestedComponentIR,
  type NestedElementIR,
  type NestedLayerIR,
  type NestedSlotIR,
  type NestedTextIR,
  type RenderRootNode,
  type SlotIR,
} from '../core/model';
import {
  applyAutoLayout,
  applyChildPlacement,
  applySizingModes,
  canonicalCaptures,
  layoutSizingForChild,
  stableIdForProperties,
} from './componentLayout';
import { colorVariableFor } from './documentResources';
import { recolorAssetInstance } from './componentPrimitives';
import { nestedStableIds } from '../../nestedIdentity';
import { loadProjectFont, upsertSemanticText } from '../resourceAdapters/typography';
import { assetMainComponentFor } from './assetResources';
import { applyTextPresentation, applyTextSizing } from './textProjection';

export type ConfigureNestedComponent = (
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  spec: FigmaComponentDefinition,
  ir: DesignSystemIR,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) => Promise<void>;

type NestedParent = RenderRootNode | SlotNode;

export async function propertyKey(
  instance: InstanceNode,
  displayName: string,
  type: ComponentPropertyType,
) {
  const local = Object.entries(instance.componentProperties).find(
    ([name, definition]) => name.split('#')[0] === displayName && definition.type === type,
  )?.[0];
  if (local) return local;
  const set = (await instance.getMainComponentAsync())?.parent;
  if (set?.type !== 'COMPONENT_SET') return undefined;
  return Object.entries(set.componentPropertyDefinitions).find(
    ([name, definition]) => name.split('#')[0] === displayName && definition.type === type,
  )?.[0];
}

export function nestedMainComponent(
  child: NestedComponentIR,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
) {
  const spec = definitions.get(child.componentRef);
  if (!spec) throw new Error(`Missing definition for nested ${child.componentRef}`);
  const stableId = stableIdForProperties(spec, child.properties);
  const mainComponent = findStable<ComponentNode>(stableId, ['COMPONENT']);
  if (!mainComponent) throw new Error(`Missing nested main component ${stableId}`);
  return { component: mainComponent, spec };
}

export function applyNestedLayerSizing(
  instance: InstanceNode,
  style: ComputedStyle | undefined,
  parent: NestedParent,
) {
  const absolute = style?.position === 'absolute' || style?.position === 'fixed';
  instance.layoutSizingHorizontal = layoutSizingForChild(
    style?.widthSizing,
    instance.layoutMode,
    parent.layoutMode,
    absolute,
  );
  instance.layoutSizingVertical = layoutSizingForChild(
    style?.heightSizing,
    instance.layoutMode,
    parent.layoutMode,
    absolute,
  );
}

export function applyNestedSizing(
  instance: InstanceNode,
  child: NestedComponentIR,
  parent: NestedParent,
) {
  const style = child.style;
  if (style) {
    // A component instance starts with its main component's dimensions. A concrete use
    // can intentionally have different measured geometry from the main component,
    // so restore that
    // geometry after setProperties()/swapComponent() have recalculated it.
    instance.resizeWithoutConstraints(
      Math.max(px(style.width, instance.width), 0.01),
      Math.max(px(style.height, instance.height), 0.01),
    );
  }
  applyNestedLayerSizing(instance, child.style, parent);
}

/**
 * Restore the computed root presentation of a concrete nested component use.
 *
 * Figma instances inherit their main component's surface by default. In the DOM,
 * composition can intentionally neutralize that surface (for example TextInput
 * inside InputGroup) or alter it through a parent state (for example Field/error).
 * These values are ordinary instance overrides and must be reconciled after
 * setProperties()/swapComponent(), which can restore the main component defaults.
 */
export function applyNestedPresentation(instance: InstanceNode, style: ComputedStyle | undefined) {
  if (!style) return;
  applyAutoLayout(instance, style);
  instance.clipsContent = style.overflow === 'hidden' || style.overflow === 'clip';
  applyPaint(instance, style, 'backgroundColor');
  applyStroke(instance, style);
  applyCornerRadii(instance, style);
  applyOpacity(instance, style);
}

export function bindNestedPresentation(
  instance: InstanceNode,
  child: NestedComponentIR,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  const style = child.style;
  if (!style) return;
  const background = colorVariableFor(
    ir,
    resources,
    style.backgroundColor,
    child.bindings?.background,
  );
  const border = colorVariableFor(ir, resources, style.borderTopColor, child.bindings?.border);
  if (background) bindPaintVariable(instance, 'fills', background);
  if (border) bindPaintVariable(instance, 'strokes', border);
}

export function isNestedComponent(child: NestedLayerIR): child is NestedComponentIR {
  return 'componentRef' in child;
}

export function materializeStructure(
  structure: readonly NestedLayerIR[],
  slots: ComponentCaptureIR['slots'],
): NestedLayerIR[] {
  return structure.flatMap((layer): NestedLayerIR[] => {
    if (isNestedComponent(layer) || layer.kind === 'text' || layer.kind === 'asset') return [layer];
    if (layer.kind === 'element') {
      return [
        {
          ...layer,
          children: materializeStructure(layer.children, slots),
        },
      ];
    }
    const slot = slots[layer.name];
    if (!slot) return [];
    if (slot.kind === 'text') {
      return [nestedTextFromSlot(slot)];
    }
    if (slot.kind === 'asset-swap') {
      return [{ ...slot.asset, style: { ...slot.asset.style, ...slot.style } }];
    }
    return [
      {
        kind: 'element',
        name: `slot:${layer.name}`,
        style: slot.style,
        bindings: slot.bindings,
        children: materializeStructure(slot.children, slots),
      },
    ];
  });
}

export function nestedTextFromSlot(slot: Extract<SlotIR, { kind: 'text' }>): NestedTextIR {
  return { ...slot, kind: 'text' };
}

export async function upsertNestedText(
  parent: NestedParent,
  child: NestedTextIR,
  stableId: string,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  await removeWrongTypeSibling(parent, stableId, ['TEXT']);
  let textNode = await findLiveChild<TextNode>(parent, stableId, ['TEXT']);
  if (!textNode) {
    textNode = figma.createText();
    parent.appendChild(textNode);
  }
  textNode.name = child.text.length > 32 ? `${child.text.slice(0, 29)}…` : child.text;
  mark(textNode, stableId);
  const textStyle = child.textStyleRef ? resources.textStyles.get(child.textStyleRef) : undefined;
  textNode.fontName = textStyle?.fontName ?? (await loadProjectFont(child.style.fontWeight));
  textNode.characters = child.text;
  if (textStyle) await textNode.setTextStyleIdAsync(textStyle.id);
  applyTextPresentation(textNode, child.style);
  applyTextSizing(textNode, parent, child.style);
  applyOpacity(textNode, child.style);
  applyPaint(textNode, child.style, 'color');
  const variable = colorVariableFor(
    ir,
    resources,
    child.style.color,
    child.colorRef ?? child.bindings?.content,
  );
  if (variable) bindPaintVariable(textNode, 'fills', variable);
  applyChildPlacement(textNode, parent, child.style);
  return textNode;
}

export async function upsertNestedAsset(
  parent: NestedParent,
  child: AssetLayerIR,
  stableId: string,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  const mainComponent = assetMainComponentFor(child.assetRef, resources);
  await removeWrongTypeSibling(parent, stableId, ['INSTANCE']);
  let instance = await findLiveChild<InstanceNode>(parent, stableId, ['INSTANCE']);
  if (!instance) {
    instance = mainComponent.createInstance();
    parent.appendChild(instance);
  } else if (!(await instanceUsesMainComponent(instance, mainComponent)))
    instance.swapComponent(mainComponent);
  instance.name = child.assetRef;
  mark(instance, stableId);
  instance.resizeWithoutConstraints(
    px(child.style.width, mainComponent.width),
    px(child.style.height, mainComponent.height),
  );
  applyNestedLayerSizing(instance, child.style, parent);
  applyOpacity(instance, child.style);
  recolorAssetInstance(
    instance,
    child.style.color,
    colorVariableFor(ir, resources, child.style.color, child.colorRef),
  );
  applyChildPlacement(instance, parent, child.style);
  return instance;
}

export async function upsertNestedElement(
  parent: NestedParent,
  child: NestedElementIR,
  stableId: string,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  ir: DesignSystemIR,
  resources: DesignResources,
  configureComponent: ConfigureNestedComponent,
  slotNodes?: ReadonlyMap<string, SceneNode>,
) {
  await removeWrongTypeSibling(parent, stableId, ['FRAME']);
  let frame = await findLiveChild<FrameNode>(parent, stableId, ['FRAME']);
  if (!frame) {
    frame = figma.createFrame();
    parent.appendChild(frame);
  }
  frame.name = child.name;
  mark(frame, stableId);
  configureNestedElementFrame(frame, child, parent, ir, resources);
  await syncNestedChildren(
    frame,
    child.children,
    definitions,
    stableId,
    ir,
    resources,
    configureComponent,
    slotNodes,
  );
  applyChildPlacement(frame, parent, child.style);
  return frame;
}

/** Apply a DOM element's box model to an existing generic Figma frame. */
export function configureNestedElementFrame(
  frame: FrameNode,
  child: NestedElementIR,
  parent: NestedParent,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  applyAutoLayout(frame, child.style);
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resizeWithoutConstraints(
    Math.max(px(child.style.width, 1), 1),
    Math.max(px(child.style.height, 1), 1),
  );
  const absolute = child.style.position === 'absolute' || child.style.position === 'fixed';
  applySizingModes(frame, child.style, absolute);
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = child.style.overflow === 'hidden' || child.style.overflow === 'clip';
  applyPaint(frame, child.style, 'backgroundColor');
  applyStroke(frame, child.style);
  applyCornerRadii(frame, child.style);
  applyOpacity(frame, child.style);
  const background = colorVariableFor(
    ir,
    resources,
    child.style.backgroundColor,
    child.bindings?.background,
  );
  const border = colorVariableFor(
    ir,
    resources,
    child.style.borderTopColor,
    child.bindings?.border,
  );
  if (background) bindPaintVariable(frame, 'fills', background);
  if (border) bindPaintVariable(frame, 'strokes', border);
  frame.layoutGrow = 0;
  frame.layoutAlign = 'INHERIT';
  if (parent.layoutMode === 'VERTICAL') {
    if (child.style.widthSizing === 'fill') frame.layoutAlign = 'STRETCH';
    if (child.style.heightSizing === 'fill') frame.layoutGrow = 1;
  } else if (parent.layoutMode === 'HORIZONTAL') {
    if (child.style.heightSizing === 'fill') frame.layoutAlign = 'STRETCH';
    if (child.style.widthSizing === 'fill') frame.layoutGrow = 1;
  }
  frame.layoutSizingHorizontal = layoutSizingForChild(
    child.style.widthSizing,
    frame.layoutMode,
    parent.layoutMode,
    absolute,
  );
  frame.layoutSizingVertical = layoutSizingForChild(
    child.style.heightSizing,
    frame.layoutMode,
    parent.layoutMode,
    absolute,
  );
}

export async function syncNestedChildren(
  parent: NestedParent,
  children: NestedLayerIR[],
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  stableId: string,
  ir: DesignSystemIR,
  resources: DesignResources,
  configureComponent: ConfigureNestedComponent,
  slotNodes?: ReadonlyMap<string, SceneNode>,
) {
  const expected = new Set<string>();
  const childIds = nestedStableIds(stableId, children);
  for (const [index, child] of children.entries()) {
    const childId = childIds[index];
    if (!childId) throw new Error(`Missing nested identity at index ${index}`);
    expected.add(childId);
    if (!isNestedComponent(child)) {
      if (child.kind === 'slot-ref') {
        const slotNode = slotNodes?.get(child.name);
        if (slotNode) parent.insertChild(index, slotNode);
        continue;
      }
      const node =
        child.kind === 'element'
          ? await upsertNestedElement(
              parent,
              child,
              childId,
              definitions,
              ir,
              resources,
              configureComponent,
              slotNodes,
            )
          : child.kind === 'asset'
            ? await upsertNestedAsset(parent, child, childId, ir, resources)
            : child.runs?.length
              ? await upsertSemanticText(parent, child, childId, ir, resources)
              : await upsertNestedText(parent, child, childId, ir, resources);
      parent.insertChild(index, node);
      continue;
    }
    const childSpec = definitions.get(child.componentRef);
    if (childSpec?.target === 'fragment') {
      const source = canonicalCaptures(childSpec, ir.components[child.componentRef] ?? []);
      const sourceId = stableIdForProperties(childSpec, child.properties);
      const template = source.get(sourceId) ?? source.values().next().value;
      if (!template) throw new Error(`Missing screen fragment ${sourceId}`);
      const projectedSlots = { ...template.slots };
      for (const [slotName, value] of Object.entries(child.slots)) {
        const base = projectedSlots[slotName];
        if (typeof value === 'string') {
          if (base?.kind === 'text') projectedSlots[slotName] = { ...base, text: value };
          continue;
        }
        if (
          (value.kind === 'container' || value.kind === 'slot') &&
          (base?.kind === 'container' || base?.kind === 'slot')
        ) {
          projectedSlots[slotName] = {
            ...base,
            kind: value.kind,
            children: value.children,
            bindings: value.bindings ?? base.bindings,
          };
        } else if (value.kind === 'asset-swap' && base?.kind === 'asset-swap') {
          projectedSlots[slotName] = {
            ...base,
            asset:
              value.children.find(
                (child): child is AssetLayerIR => 'kind' in child && child.kind === 'asset',
              ) ?? base.asset,
            bindings: value.bindings ?? base.bindings,
          };
        }
      }
      await removeWrongTypeSibling(parent, childId, ['FRAME']);
      let frame = await findLiveChild<FrameNode>(parent, childId, ['FRAME']);
      if (!frame) {
        frame = figma.createFrame();
        parent.appendChild(frame);
      }
      mark(frame, childId);
      await configureComponent(
        frame,
        {
          ...template,
          stableId: childId,
          properties: child.properties,
          slots: projectedSlots,
        },
        childSpec,
        ir,
        resources,
        definitions,
      );
      frame.name = child.componentRef;
      applyOpacity(frame, child.style ?? template.root);
      applyChildPlacement(frame, parent, child.style ?? {});
      parent.insertChild(index, frame);
      continue;
    }

    const resolved = nestedMainComponent(child, definitions);
    await removeWrongTypeSibling(parent, childId, ['INSTANCE']);
    let instance = await findLiveChild<InstanceNode>(parent, childId, ['INSTANCE']);
    if (!instance) {
      instance = resolved.component.createInstance();
      parent.appendChild(instance);
    } else if (!(await instanceUsesMainComponent(instance, resolved.component))) {
      instance.swapComponent(resolved.component);
    }
    instance.name = child.componentRef;
    mark(instance, childId);
    await applyNestedOverrides(
      instance,
      child,
      resolved.spec,
      definitions,
      childId,
      ir,
      resources,
      configureComponent,
    );
    parent.insertChild(index, instance);
    // setProperties() can recalculate sizing from the main component. Re-apply the
    // concrete DOM presentation and layout intent afterwards.
    applyNestedPresentation(instance, child.style);
    bindNestedPresentation(instance, child, ir, resources);
    applyNestedSizing(instance, child, parent);
    applyChildPlacement(instance, parent, child.style ?? {});
  }
  for (const child of [...parent.children]) {
    const childId = child.getPluginData(DATA_KEY);
    if (
      child.getPluginData(MANAGED_KEY) === 'true' &&
      childId.startsWith(`${stableId}/child/`) &&
      !expected.has(childId)
    )
      child.remove();
  }
}

/** Reconcile non-slot descendants through ordinary instance overrides only. */
export async function syncNestedOverridesInPlace(
  parent: FrameNode | SlotNode,
  children: NestedLayerIR[],
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  stableId: string,
  ir: DesignSystemIR,
  resources: DesignResources,
  configureComponent: ConfigureNestedComponent,
) {
  const childIds = nestedStableIds(stableId, children);
  for (const [index, child] of children.entries()) {
    const childId = childIds[index];
    if (!childId) throw new Error(`Missing nested identity at index ${index}`);
    if (!isNestedComponent(child)) {
      if (child.kind !== 'element') continue;
      const frame = await findLiveChild<FrameNode>(parent, childId, ['FRAME']);
      if (frame) {
        configureNestedElementFrame(frame, child, parent, ir, resources);
        await syncNestedOverridesInPlace(
          frame,
          child.children,
          definitions,
          childId,
          ir,
          resources,
          configureComponent,
        );
        applyChildPlacement(frame, parent, child.style);
      }
      continue;
    }
    const instance = await findLiveChild<InstanceNode>(parent, childId, ['INSTANCE']);
    if (!instance) continue;
    const resolved = nestedMainComponent(child, definitions);
    if (!(await instanceUsesMainComponent(instance, resolved.component))) {
      instance.swapComponent(resolved.component);
    }
    await applyNestedOverrides(
      instance,
      child,
      resolved.spec,
      definitions,
      childId,
      ir,
      resources,
      configureComponent,
    );
    applyNestedPresentation(instance, child.style);
    bindNestedPresentation(instance, child, ir, resources);
    applyNestedSizing(instance, child, parent);
    applyChildPlacement(instance, parent, child.style ?? {});
  }
}

export async function applyNestedOverrides(
  instance: InstanceNode,
  child: NestedComponentIR,
  childSpec: FigmaComponentDefinition | undefined,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  stableId: string,
  ir: DesignSystemIR,
  resources: DesignResources,
  configureComponent: ConfigureNestedComponent,
) {
  const overrides: Record<string, string | boolean> = {};
  const nestedContainers: Array<{ slotName: string; value: NestedSlotIR }> = [];
  for (const [slotName, slotSpec] of Object.entries(childSpec?.slots ?? {})) {
    if (slotSpec.required || (slotSpec.kind !== 'container' && slotSpec.kind !== 'asset-swap'))
      continue;
    const displayName =
      slotSpec.kind === 'asset-swap'
        ? `Show ${slotSpec.propertyName.toLowerCase()}`
        : `Show ${slotName}`;
    const key = await propertyKey(instance, displayName, 'BOOLEAN');
    if (key) overrides[key] = Boolean(child.slots[slotName]);
  }
  for (const [slotName, value] of Object.entries(child.slots)) {
    if (typeof value === 'string') {
      const displayName =
        childSpec?.slots[slotName]?.kind === 'text'
          ? childSpec.slots[slotName].propertyName
          : undefined;
      if (!displayName) continue;
      const key = await propertyKey(instance, displayName, 'TEXT');
      if (key) overrides[key] = value;
      continue;
    }
    const slotSpec = childSpec?.slots[slotName];
    if (value.kind === 'slot' && slotSpec?.kind === 'slot') {
      const nativeSlot = instance
        .findAllWithCriteria({ types: ['SLOT'] })
        .find((candidate) => candidate.name === slotSpec.propertyName);
      if (nativeSlot) {
        for (const existingChild of [...nativeSlot.children]) existingChild.remove();
        await syncNestedChildren(
          nativeSlot,
          value.children,
          definitions,
          `${stableId}/slot/${slotName}`,
          ir,
          resources,
          configureComponent,
        );
      }
    } else if (value.kind === 'container' && slotSpec?.kind === 'container') {
      nestedContainers.push({ slotName, value });
    }
  }
  if (Object.keys(overrides).length) instance.setProperties(overrides);
  // Project typography from the concrete rendered public text slot, never
  // from the component host. A host's inherited font can differ from its own
  // label, while a contextual link can
  // legitimately inherit a smaller contextual size.
  for (const [slotName, slotSpec] of Object.entries(childSpec?.slots ?? {})) {
    if (slotSpec.kind !== 'text' || typeof child.slots[slotName] !== 'string') continue;
    const textStyle = child.textSlotStyles?.[slotName];
    if (!textStyle) continue;
    const textNode = instance
      .findAllWithCriteria({ types: ['TEXT'] })
      .find((candidate) => candidate.name === `slot:${slotName}`);
    if (textNode) applyTextPresentation(textNode, textStyle);
  }
  for (const [slotName, value] of Object.entries(child.slots)) {
    if (typeof value === 'string' || value.kind !== 'asset-swap') continue;
    const asset = value.children.find(
      (child): child is AssetLayerIR => 'kind' in child && child.kind === 'asset',
    );
    if (!asset) continue;
    const assetInstance = instance
      .findAllWithCriteria({ types: ['INSTANCE'] })
      .find((candidate) => candidate.name === `slot:${slotName}`);
    const mainComponent = findStable<ComponentNode>(asset.assetRef, ['COMPONENT']);
    if (
      assetInstance &&
      mainComponent &&
      !(await instanceUsesMainComponent(assetInstance, mainComponent))
    ) {
      assetInstance.swapComponent(mainComponent);
    }
  }
  for (const { slotName, value } of nestedContainers) {
    const container = instance
      .findAllWithCriteria({ types: ['FRAME'] })
      .find((candidate) => candidate.name === `slot:${slotName}`);
    if (container) {
      await syncNestedOverridesInPlace(
        container,
        value.children,
        definitions,
        `${stableId}/slot/${slotName}`,
        ir,
        resources,
        configureComponent,
      );
    }
  }
}

