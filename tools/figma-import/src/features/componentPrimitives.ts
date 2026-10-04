import {
  applyGeometryOverride,
  applyOpacity,
  applyPaint,
  bindPaintVariable,
  geometryFor,
  instanceUsesMainComponent,
  mark,
  parseColor,
  px,
  removeWrongTypeSibling,
} from '../core/figmaNodes';
import {
  type ComponentCaptureIR,
  DATA_KEY,
  type DesignSystemIR,
  type DesignResources,
  type RenderRootNode,
  SLOT_SCHEMA_KEY,
  SLOT_SCHEMA_VERSION,
  type SlotIR,
  type FigmaSlotDefinition,
} from '../core/model';
import { colorVariableFor } from './documentResources';
import { loadProjectFont } from '../resourceAdapters/typography';
import { assetMainComponentFor } from './assetResources';
import { applyTextPresentation, applyTextSizing } from './textProjection';
import { slotDisplayName } from '../core/displayNames';

export async function upsertTextSlot(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  slotName: string,
  displayName: string | undefined,
  slot: Extract<SlotIR, { kind: 'text' }>,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  const stableId = `${capture.stableId}/slot/${slotName}`;
  await removeWrongTypeSibling(component, stableId, ['TEXT']);
  let textNode = component.children.find(
    (child): child is TextNode =>
      child.type === 'TEXT' && child.getPluginData(DATA_KEY) === stableId,
  );
  if (!textNode) {
    textNode = figma.createText();
    component.appendChild(textNode);
  }
  // Figma only allows these references on layers that belong to a component
  // main component. A generated screen is a regular Frame, so it has nothing to detach.
  if (component.type === 'COMPONENT') textNode.componentPropertyReferences = {};
  textNode.name = slotDisplayName(slotName, displayName);
  mark(textNode, stableId);
  textNode.fontName = await loadProjectFont(slot.style.fontWeight);
  textNode.characters = slot.text;
  const textStyle = slot.textStyleRef && resources.textStyles.get(slot.textStyleRef);
  if (textStyle) await textNode.setTextStyleIdAsync(textStyle.id);
  applyTextPresentation(textNode, slot.style);
  applyTextSizing(textNode, component, slot.style);
  applyOpacity(textNode, slot.style);
  applyPaint(textNode, slot.style, 'color');
  const variable = colorVariableFor(
    ir,
    resources,
    slot.style.color,
    slot.colorRef ?? slot.bindings?.content ?? capture.bindings.content,
  );
  if (variable) bindPaintVariable(textNode, 'fills', variable);
  return textNode;
}

export function recolorAssetInstance(
  instance: InstanceNode,
  color: string | undefined,
  variable: Variable | undefined,
) {
  const paint = parseColor(color);
  for (const node of instance.findAll()) {
    if (node.type === 'RECTANGLE' && node.name === 'color') {
      node.fills = paint ? [paint] : [];
      if (variable) bindPaintVariable(node, 'fills', variable);
    }
  }
}

export async function upsertAssetSwapSlot(
  component: RenderRootNode,
  capture: ComponentCaptureIR,
  slotName: string,
  slotSpec: Extract<FigmaSlotDefinition, { kind: 'asset-swap' }>,
  slot: Extract<SlotIR, { kind: 'asset-swap' }> | undefined,
  ir: DesignSystemIR,
  resources: DesignResources,
) {
  const variant = String(capture.properties[slotSpec.variantProperty]);
  const assetRef = slot?.asset.assetRef ?? slotSpec.defaultAssetRefs[variant];
  if (!assetRef) throw new Error(`Missing default asset reference for ${slotName}/${variant}`);
  const mainComponent = assetMainComponentFor(assetRef, resources);
  const stableId = `${capture.stableId}/slot/${slotName}`;
  await removeWrongTypeSibling(component, stableId, ['INSTANCE']);
  let instance = component.children.find(
    (child): child is InstanceNode =>
      child.type === 'INSTANCE' && child.getPluginData(DATA_KEY) === stableId,
  );
  if (instance && instance.getPluginData(SLOT_SCHEMA_KEY) !== SLOT_SCHEMA_VERSION) {
    const previous = instance;
    instance = mainComponent.createInstance();
    component.insertChild(component.children.indexOf(previous), instance);
    previous.remove();
  }
  if (!instance) {
    instance = mainComponent.createInstance();
    component.appendChild(instance);
  } else {
    if (component.type === 'COMPONENT') instance.componentPropertyReferences = {};
    if (!(await instanceUsesMainComponent(instance, mainComponent)))
      instance.swapComponent(mainComponent);
  }
  instance.name = slotDisplayName(slotName, slotSpec.displayName ?? slotSpec.propertyName);
  mark(instance, stableId);
  if (slot) applyOpacity(instance, slot.style);
  instance.setPluginData(SLOT_SCHEMA_KEY, SLOT_SCHEMA_VERSION);
  instance.resizeWithoutConstraints(
    px(slot?.asset.style.width ?? slot?.style.width, mainComponent.width),
    px(slot?.asset.style.height ?? slot?.style.height, mainComponent.height),
  );
  applyGeometryOverride(
    instance,
    geometryFor(
      ir.definitions.find((definition) => definition.component === capture.component)!,
      capture,
    ).slots?.[slotName],
    component,
  );
  recolorAssetInstance(
    instance,
    slot?.asset.style.color ?? slot?.style.color ?? capture.root.color,
    colorVariableFor(
      ir,
      resources,
      slot?.asset.style.color ?? slot?.style.color ?? capture.root.color,
      slot?.asset.colorRef ?? slot?.bindings?.content ?? capture.bindings.content,
    ),
  );
  instance.visible = Boolean(slot) || Boolean(slotSpec.required);
  return instance;
}
