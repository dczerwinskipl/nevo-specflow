import type {
  FigmaComponentDefinition,
  NestedLayerIR,
  NestedSlotIR,
  ScreensIR,
  SlotIR,
} from '@nevo/figma-core/ir';
import type { IRInspection } from '../../messages';
import { componentReferenceKind, mainComponentRequirement } from '../../plan';
import { detailsRow, element } from './dom';
import { actionBadge, inspectionItem, uniqueCaptures } from './previewShared';

type Definitions = ReadonlyMap<string, FigmaComponentDefinition>;

function layerContainsMissing(
  layer: NestedLayerIR,
  definitions: Definitions,
  inspection: IRInspection | null,
): boolean {
  if ('componentRef' in layer) {
    const stableId = mainComponentRequirement(layer, definitions);
    if (stableId && inspectionItem(stableId, inspection)?.exists === false) return true;
    return Object.values(layer.slots).some((slot) =>
      slotContainsMissing(slot, definitions, inspection),
    );
  }
  if (layer.kind === 'asset')
    return inspectionItem(layer.assetRef, inspection, 'asset')?.exists === false;
  if (layer.kind === 'text') {
    const refs = [
      layer.textStyleRef,
      layer.colorRef,
      ...(layer.runs ?? []).flatMap((run) => [run.textStyleRef, run.colorRef]),
    ].filter((value): value is string => Boolean(value));
    return refs.some((stableId) => inspectionItem(stableId, inspection)?.exists === false);
  }
  return (
    layer.kind === 'element' &&
    layer.children.some((child) => layerContainsMissing(child, definitions, inspection))
  );
}

function slotContainsMissing(
  value: string | SlotIR | NestedSlotIR | undefined,
  definitions: Definitions,
  inspection: IRInspection | null,
) {
  if (!value || typeof value === 'string' || value.kind === 'text') return false;
  if (value.kind === 'asset-swap') {
    const asset =
      'asset' in value
        ? value.asset
        : value.children.find((child) => 'kind' in child && child.kind === 'asset');
    return asset ? inspectionItem(asset.assetRef, inspection, 'asset')?.exists === false : false;
  }
  return (
    'children' in value &&
    value.children.some((child) => layerContainsMissing(child, definitions, inspection))
  );
}

function slotSummary(value: string | SlotIR | NestedSlotIR | undefined) {
  if (!value) return 'Empty';
  if (typeof value === 'string' || value.kind === 'text') return 'Text content';
  if (value.kind === 'asset-swap') return 'Asset swap';
  const count = value.children.length;
  return `${count} ${count === 1 ? 'layer' : 'layers'}`;
}

function appendLazyGroup(
  parent: HTMLElement,
  group: HTMLDetailsElement,
  initiallyOpen: boolean,
  populate: (children: HTMLElement) => void,
) {
  let populated = false;
  const populateOnce = () => {
    if (populated) return;
    populated = true;
    const children = element('div', undefined, 'children');
    populate(children);
    if (children.childElementCount) group.append(children);
  };
  group.addEventListener('toggle', () => {
    if (group.open) populateOnce();
  });
  parent.append(group);
  if (initiallyOpen) {
    group.open = true;
    populateOnce();
  }
}

function appendSlot(
  parent: HTMLElement,
  name: string,
  value: string | SlotIR | NestedSlotIR | undefined,
  definitions: Definitions,
  inspection: IRInspection | null,
  depth: number,
) {
  const group = detailsRow(name, slotSummary(value));
  const containsMissing = slotContainsMissing(value, definitions, inspection);
  appendLazyGroup(parent, group, containsMissing, (children) => {
    if (typeof value === 'string') {
      children.append(element('div', value || 'Empty text', 'leaf'));
    } else if (value?.kind === 'text') {
      children.append(element('div', value.text || 'Empty text', 'leaf'));
    } else if (value?.kind === 'asset-swap') {
      const asset =
        'asset' in value
          ? value.asset
          : value.children.find((child) => 'kind' in child && child.kind === 'asset');
      if (asset) appendTreeLayer(children, asset, definitions, inspection, depth + 1);
    } else if (value && 'children' in value) {
      for (const child of value.children) {
        appendTreeLayer(children, child, definitions, inspection, depth + 1);
      }
    }
  });
}

function appendTreeLayer(
  parent: HTMLElement,
  layer: NestedLayerIR,
  definitions: Definitions,
  inspection: IRInspection | null,
  depth = 0,
) {
  if ('componentRef' in layer) {
    const kind = componentReferenceKind(layer.componentRef, definitions);
    const reusable = kind === 'reusable-component';
    const group = detailsRow(layer.componentRef, '');
    const heading = group.querySelector('summary');
    heading?.append(
      element(
        'span',
        reusable ? 'Reusable component' : 'Screen content',
        `node-badge ${reusable ? 'design-system' : 'screen-specific'}`,
      ),
    );
    let missing = false;
    if (reusable) {
      const item = inspectionItem(mainComponentRequirement(layer, definitions), inspection);
      missing = item?.exists === false;
      if (missing) heading?.append(actionBadge('missing'));
    }
    const containsMissing =
      missing ||
      Object.values(layer.slots).some((slot) => slotContainsMissing(slot, definitions, inspection));
    appendLazyGroup(parent, group, containsMissing, (children) => {
      for (const [name, value] of Object.entries(layer.slots)) {
        appendSlot(children, name, value, definitions, inspection, depth);
      }
    });
    return;
  }

  if (layer.kind === 'element') {
    const group = detailsRow(layer.name || 'Element', '');
    appendLazyGroup(
      parent,
      group,
      layerContainsMissing(layer, definitions, inspection),
      (children) => {
        for (const child of layer.children) {
          appendTreeLayer(children, child, definitions, inspection, depth + 1);
        }
      },
    );
    return;
  }

  if (layer.kind === 'asset') {
    const row = element('div', undefined, 'leaf');
    row.append(
      element('span', layer.assetRef, 'node-name'),
      element('span', 'Asset', 'node-badge design-system'),
    );
    if (inspectionItem(layer.assetRef, inspection, 'asset')?.exists === false)
      row.append(actionBadge('missing'));
    parent.append(row);
    return;
  }

  const isSlot = layer.kind === 'slot-ref';
  const label = isSlot ? `Slot: ${layer.name}` : layer.text || layer.kind;
  const row = element('div', undefined, 'leaf');
  row.append(element('span', label, 'node-name'));
  if (isSlot) row.append(element('span', 'Component slot', 'node-badge component-slot'));
  else if (layer.kind === 'text')
    row.append(element('span', layer.runs?.length ? 'Rich text' : 'Text', 'node-badge'));
  parent.append(row);
}

export function renderScreensPreview(
  parent: HTMLElement,
  ir: ScreensIR,
  inspection: IRInspection | null,
) {
  const definitions = new Map(ir.definitions.map((item) => [item.component, item]));
  const missing = inspection?.items.filter((item) => !item.exists) ?? [];
  if (missing.length) {
    const missingGroup = detailsRow(
      'Missing Design System dependencies',
      `${missing.length} missing`,
    );
    missingGroup.open = true;
    const children = element('div', undefined, 'children');
    for (const item of missing) {
      const row = element('div', undefined, 'leaf');
      row.append(
        element('span', item.stableId, 'node-name'),
        element('span', item.kind.replace('-', ' '), 'resource-kind'),
        actionBadge('missing'),
      );
      children.append(row);
    }
    missingGroup.append(children);
    parent.append(missingGroup);
  }
  for (const definition of ir.definitions) {
    if (definition.target !== 'screen') continue;
    for (const capture of uniqueCaptures(ir.screens[definition.component])) {
      const group = detailsRow(
        definition.component,
        String(capture.properties.viewport ?? 'view'),
        definition.description,
      );
      group.open = true;
      const children = element('div', undefined, 'children');
      for (const [name, value] of Object.entries(capture.slots)) {
        appendSlot(children, name, value, definitions, inspection, 0);
      }
      group.append(children);
      parent.append(group);
    }
  }
}
